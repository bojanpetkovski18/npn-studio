'use strict';
// Desktop app, fresh install and reset: drives the real window (Electron) with an empty settings folder.
//   electron test/desktop-defaults.js
// Checks that a fresh install starts with no templates and no output folder (even when template files sit next to
// the exe), and that "Врати почетни поставки" and "Исчисти сè" put the app back into that state.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const samples = path.join(__dirname, '..', 'samples');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nalogix-defaults-'));
const userData = path.join(tmp, 'userData');
const exeDir = path.join(tmp, 'exe');
const outDir = path.join(tmp, 'out');
fs.mkdirSync(exeDir, { recursive: true });
// the old behaviour picked these up automatically; a fresh install must not
fs.copyFileSync(path.join(samples, 'template.docx'), path.join(exeDir, 'template.docx'));
fs.copyFileSync(path.join(samples, 'template_NPN_EMBG.docx'), path.join(exeDir, 'template_NPN_EMBG.docx'));
process.env.NALOGIX_USER_DATA = userData;
process.env.PORTABLE_EXECUTABLE_DIR = exeDir;
if (process.env.CI) app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
require('../src/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`[e2e] ok    ${name}`);
  else { failed++; console.log(`[e2e] FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const settingsFile = path.join(userData, 'settings.json');
const sessionFile = path.join(userData, 'session.json');

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (e) => { if (e.level === 'error') { failed++; console.log('[e2e] ERROR console:', e.message); } });
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const until = async (code, ms = 10000) => { for (let t = 0; t < ms; t += 100) { if (await js(code)) return true; await wait(100); } return false; };
    const loadSamples = () => js(`(async () => { const r = await api.scanFolder(${JSON.stringify(samples)});
      await setTemplate('standard', () => api.loadTemplate('standard', r.standard), true);
      await setTemplate('embg', () => api.loadTemplate('embg', r.embg), true);
      S.filePaths = r.excel; await reload(); return S.cases.length; })()`);
    const confirmVia = async (btn) => {
      await js(`document.querySelector(${JSON.stringify(btn)}).click(); 0`);
      const shown = await until(`!document.querySelector('#modal').hidden && !!document.querySelector('#mConfirm')`, 3000);
      check(`${btn} asks for confirmation first`, shown);
      if (shown) await js(`document.querySelector('#mConfirm').click(); 0`);
    };
    try {
      await until(`typeof S !== 'undefined' && !!S.init`); // S is a top-level const, not a window property

      // 1. fresh install
      const fresh = await js(`({ std: !!S.templates.standard, embg: !!S.templates.embg, out: S.outDir, label: document.querySelector('#outPath').textContent,
        disabled: document.querySelector('#genBtn').disabled })`);
      check('fresh install: no templates, even with template files next to the exe', !fresh.std && !fresh.embg, JSON.stringify(fresh));
      check('fresh install: no output folder', fresh.out === '', JSON.stringify(fresh.out));
      check('fresh install: the output folder asks to be chosen', fresh.label === 'Изберете папка…', fresh.label);
      const ui = await js(`({ folderBtn: !!document.querySelector('#scanFolderBtn'), adv: document.querySelector('#advanced') ? document.querySelector('#advanced').open : null,
        header: [...document.querySelectorAll('.titlebar-actions .tb-btn')].map((b) => b.textContent.trim()) })`);
      check('simple: no "Од папка…" button', !ui.folderBtn);
      check('simple: the extra options start closed', ui.adv === false, String(ui.adv));
      check('simple: the header only has "Историја"', JSON.stringify(ui.header) === '["Историја"]', JSON.stringify(ui.header));
      const sideW = await js(`Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)`);
      check('the left panel is wide (at least 400 px), the table does not dominate', sideW >= 400, `${sideW} px`);
      const n = await loadSamples();
      const view = await js(`({ cols: [...document.querySelectorAll('#thead > div')].map((d) => d.textContent.trim()),
        cards: document.querySelectorAll('#stats .stat').length, sel: S.selected.size, withItems: S.cases.filter((c) => c.items.length).length,
        warn: S.cases.filter(FILTERS.warn).length, line: (document.querySelector('#attention') || {}).textContent || '' })`);
      check('simple: the table shows Број, Должник, Долг, Статус', JSON.stringify(view.cols) === '["","Број","Должник","Долг","Статус"]', JSON.stringify(view.cols));
      check('simple: no statistics cards (total debt etc.)', view.cards === 0, String(view.cards));
      check('simple: every case with invoices is selected', view.sel === view.withItems && view.sel > 0, `${view.sel} of ${view.withItems}`);
      check('simple: one line says how many cases need a look', view.warn > 0 && view.line.includes(String(view.warn)), view.line);
      await js(`document.querySelector('#attnBtn').click(); 0`);
      const only = await js('S.view.length');
      await js(`document.querySelector('#attnBtn').click(); 0`);
      const back = await js('S.view.length');
      check('simple: one click shows only those cases, a second click shows all', only === view.warn && back === n, `${only} / ${back}`);
      await js(`S.templates = { standard: null, embg: null }; renderTemplates(); applyRules(); 0`);
      const why = await js(`({ disabled: document.querySelector('#genBtn').disabled, title: document.querySelector('#genBtn').title })`);
      check('generate stays disabled and says why', why.disabled && /шаблон/.test(why.title) && /папка/.test(why.title), JSON.stringify(why));

      // 2. the user sets everything
      await loadSamples();
      await js(`setOutDir(${JSON.stringify(outDir)}); setMode('embg'); setTheme('dark');
        const p = document.querySelector('#pattern'); p.value = 'X_{BROJ}'; p.dispatchEvent(new Event('change'));
        const sf = document.querySelector('#subfolder'); sf.value = 'mesto'; sf.dispatchEvent(new Event('change'));
        document.querySelector('#minDolg').value = '9000'; document.querySelector('#ruleFiz').checked = true;
        const c = document.querySelector('#optCombined'); c.checked = true; c.dispatchEvent(new Event('change')); 0`);
      await wait(1600); // the session is saved after 1.2 s
      const before = readJson(settingsFile) || {};
      check('only the theme is carried to the next start', !('outDir' in before) && !('template_standard' in before)
        && !('template_embg' in before) && !('pattern' in before) && !('mode' in before) && before.theme === 'dark', JSON.stringify(before));
      const next = await js('api.init()');
      check('every start is empty: no templates, no output folder', !next.templates.standard && !next.templates.embg && next.defaultOut === '',
        JSON.stringify({ t: next.templates, out: next.defaultOut }));
      check('the session is remembered', fs.existsSync(sessionFile));
      check('a changed hidden option is flagged on "Повеќе опции"', (await js(`document.querySelector('#advNote').textContent`)) === '· изменети');

      // 3. restore defaults: settings back to a fresh install, the loaded tables stay
      await confirmVia('#resetBtn');
      const r = await js(`({ std: !!S.templates.standard, embg: !!S.templates.embg, out: S.outDir, mode: S.mode,
        pattern: document.querySelector('#pattern').value, sub: document.querySelector('#subfolder').value,
        min: document.querySelector('#minDolg').value, fiz: document.querySelector('#ruleFiz').checked,
        items: document.querySelector('#ruleItems').checked, comb: document.querySelector('#optCombined').checked,
        report: document.querySelector('#optReport').checked, cases: S.cases.length,
        tplLabel: document.querySelector('#tpl-standard').textContent })`);
      check('restore defaults: templates and output folder cleared', !r.std && !r.embg && r.out === '', JSON.stringify(r));
      check('restore defaults: rules and options back to their defaults', r.mode === 'auto' && r.pattern === 'NPN_{BROJ}' && r.sub === 'none'
        && r.min === '0' && !r.fiz && r.items && !r.comb && r.report, JSON.stringify(r));
      check('restore defaults: the template panel shows "Не е избран"', /Не е избран/.test(r.tplLabel), r.tplLabel);
      check('restore defaults: the loaded tables stay', r.cases === n && n > 0, `${r.cases} of ${n}`);
      check('restore defaults: "Повеќе опции" is no longer flagged', (await js(`document.querySelector('#advNote').textContent`)) === '');
      const after = readJson(settingsFile) || {};
      check('restore defaults: saved settings cleared, the theme is kept', !('outDir' in after) && !('template_standard' in after)
        && !('template_embg' in after) && !('mode' in after) && !('pattern' in after) && after.theme === 'dark', JSON.stringify(after));
      const again = await js('api.init()');
      check('restore defaults: the next start is a fresh install again', !again.templates.standard && !again.templates.embg && again.defaultOut === '',
        JSON.stringify({ t: again.templates, out: again.defaultOut }));

      // 4. key column (клучна колона): only with two or more tables, right under the tables
      await loadSamples();
      const k = await js(`({ shown: !document.querySelector('#keyPanel').hidden,
        under: document.querySelector('#keyPanel').previousElementSibling === document.querySelector('#dataPanel'),
        opts: [...document.querySelectorAll('#keySel option')].map((o) => o.textContent.trim()) })`);
      check('two tables: the key column selector is shown right under the tables', k.shown && k.under, JSON.stringify(k));
      check('two tables: it lists the columns both tables have', JSON.stringify(k.opts.slice(1)) === '["Тужба број","Шифра коминтент"]', JSON.stringify(k.opts));
      const itemsOf = `S.cases.reduce((s, c) => s + c.items.length, 0)`;
      const itemsAuto = await js(itemsOf);
      await js(`const ks = document.querySelector('#keySel'); ks.value = 'field:sifra'; ks.dispatchEvent(new Event('change')); 0`);
      await until(`S.key === 'field:sifra' && !document.querySelector('#fileList .spinner')`);
      check('choosing a key column joins the tables on it', (await js(itemsOf)) > itemsAuto, `${await js(itemsOf)} vs ${itemsAuto}`);
      await js(`(async () => { S.filePaths = S.filePaths.filter((p) => !/Ставки/.test(p)); await reload(); return 0; })()`);
      const one = await js(`({ shown: !document.querySelector('#keyPanel').hidden, sel: S.selected.size, cases: S.cases.length,
        errs: S.cases.filter((c) => c.warnings.some((w) => w.level === 'error')).length, key: S.key })`);
      check('one table: no key column selector', !one.shown, JSON.stringify(one));
      check('one table: it is the whole source (every case selected, no "no invoices" error)', one.cases > 0 && one.sel === one.cases && one.errs === 0, JSON.stringify(one));

      // 5. generation never overwrites its own documents (regression: the pattern "NPN_{2}")
      await loadSamples();
      const ids = await js('S.cases.slice(0, 12).map((c) => c.id)');
      const genDir = path.join(tmp, 'gen');
      const genOpts = (pattern) => JSON.stringify({ ids, outDir: genDir, pattern, mode: 'auto', overwrite: true, combined: false, pdf: false, report: false, datum: '' });
      await js(`api.generate(${genOpts('NPN')})`);
      const docs = fs.existsSync(genDir) ? fs.readdirSync(genDir).filter((f) => f.endsWith('.docx')) : [];
      check('a file-name pattern without a unique field still writes one file per document', docs.length === ids.length, `${docs.length} files for ${ids.length}`);
      const refused = await js(`api.generate(${genOpts('NPN_{2}')}).then((r) => r.refused || 'ran', (e) => 'threw: ' + (e.message || e))`);
      check('a file-name pattern with an unknown field is refused', /\{2\}/.test(refused), refused);

      // 6. clear everything: also the loaded data and the remembered session
      await js(`setOutDir(${JSON.stringify(outDir)}); 0`);
      await wait(1600);
      check('the session is saved again before clearing', fs.existsSync(sessionFile));
      await confirmVia('#clearAllBtn');
      const c = await js(`({ cases: S.cases.length, files: S.filePaths.length, sel: S.selected.size, out: S.outDir,
        std: !!S.templates.standard, empty: !document.querySelector('#empty').classList.contains('hidden'),
        list: document.querySelectorAll('#fileList li').length })`);
      check('clear everything: data, selection, templates and output folder gone', c.cases === 0 && c.files === 0 && c.sel === 0
        && c.out === '' && !c.std && c.list === 0, JSON.stringify(c));
      check('clear everything: the start screen is shown', c.empty);
      await wait(1600);
      check('clear everything: the remembered session is deleted', !fs.existsSync(sessionFile));
      const init2 = await js('api.init()');
      check('clear everything: nothing to resume at the next start', init2.session === null);
    } catch (e) {
      failed++; console.log('[e2e] ERROR', e && e.stack ? e.stack : e);
    }
    console.log(failed ? `[e2e] ${failed} FAILED` : '[e2e] all checks passed');
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    app.exit(failed ? 1 : 0);
  });
});
