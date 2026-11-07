// Demo capture, desktop: drives the real app through the tutorial journey on the fictional samples and saves a
// screenshot + the rectangle of the element each caption talks about.
//   electron demo/capture-desktop.js <outDir>
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const outDir = process.argv[process.argv.length - 1];
const samples = path.join(__dirname, '..', 'samples');
// a neutral output folder, so no user name appears in the summary dialog (removed afterwards)
const genRoot = process.platform === 'win32' ? path.win32.join('C:\\', 'Nalogix') : fs.mkdtempSync(path.join(os.tmpdir(), 'nalogix-demo-'));
const genDir = path.join(genRoot, 'Предлози');
require('../src/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
app.on('browser-window-created', (_e, win) => {
  // recording is a test: any console error or CSP violation is reported
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || /Content Security Policy/.test(e.message)) errors.push(e.message); });
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    // wait for finite animations only (spinners loop forever), and never longer than 2 s
    const settle = () => js(`Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 2000))]).then(() => 0)`);
    const shots = [];
    const shot = async (name, highlight) => {
      await settle(); await wait(250);
      const rect = highlight ? await js(`(() => { const e = document.querySelector(${JSON.stringify(highlight)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`) : null;
      if (highlight && !rect) errors.push(`highlight not found: ${highlight} (${name})`);
      fs.writeFileSync(path.join(outDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
      shots.push({ name, rect, size: win.getContentSize() });
      console.log('[demo] shot', name);
    };
    try {
      fs.mkdirSync(outDir, { recursive: true });
      // the app maximises itself once it is ready; wait for that, then use a fixed 1440×900 window
      for (let i = 0; i < 40 && !win.isMaximized(); i++) await wait(100);
      win.unmaximize();
      await wait(300);
      win.setContentSize(1440, 900);
      win.center();
      await wait(800);
      await js(`setTheme('light', false); setOutDir(${JSON.stringify(genDir)}, true); 0`);

      // 1. load the samples (what "Од папка…" does)
      await js(`(async () => { const r = await api.scanFolder(${JSON.stringify(samples)});
        await setTemplate('standard', () => api.loadTemplate('standard', r.standard), true);
        await setTemplate('embg', () => api.loadTemplate('embg', r.embg), true);
        S.filePaths = r.excel; await reload(); document.querySelectorAll('.toast').forEach((t) => t.remove()); return 0; })()`);
      await wait(800);
      await shot('d01-loaded', '#stats');

      // 2. problems found on load
      await js(`setFilter('warn'); 0`);
      await shot('d02-warnings', '#tableCard');

      // 3. a company with a tax number in the ЕМБГ column
      await js(`setFilter('pravno'); 0`);
      await js(`(() => { const c = S.view.find((x) => x.edb); S.tab = 'checks'; openDrawer(c.id); return 0; })()`);
      await wait(500);
      await shot('d03-company', '#dBody .check.info');

      // 4. the document preview of a natural person with ЕМБГ
      await js(`setFilter('all'); (() => { const c = S.view.find((x) => x.embg && !x.edb && x.items.length >= 6); S.tab = 'doc'; openDrawer(c.id); return 0; })()`);
      await wait(900);
      await shot('d04-preview', '#dBody .paper');

      // 5. a correction that never touches the Excel file
      await js(`S.tab = 'edit'; renderDrawer(); 0`);
      await wait(400);
      await js(`(() => { const a = document.querySelector('#f_adresa'); a.value = a.value.replace(/БР\\.\\S+/, 'БР.12А'); document.querySelector('#fSave').click(); return 0; })()`);
      await wait(700);
      await js(`document.querySelectorAll('.toast').forEach((t) => t.remove()); 0`);
      await shot('d05-edit', '#dBody .form');

      // 6. selection rules
      await js(`closeDrawer(); applyRules(); document.querySelectorAll('.toast').forEach((t) => t.remove()); document.querySelector('.rule-result').scrollIntoView({ block: 'center' }); 0`);
      await wait(400);
      const selected = await js('S.selected.size');
      await shot('d06-rules', '.rule-result');

      // 7. analytics
      await js(`setView('charts'); 0`);
      await wait(600);
      await shot('d07-analytics', '#charts .chart-card');

      // 8. generate: Word files + print document + Excel report
      await js(`setView('table'); document.querySelector('#optCombined').checked = true; generate(); 0`);
      for (let i = 0; i < 100 && !(await js('!document.querySelector("#modal").hidden')); i++) await wait(150);
      await wait(400);
      const summary = await js('document.querySelector("#modal .modal p").textContent');
      await shot('d08-generated', '#modal .modal');
      await js(`closeModal(); 0`);

      // 9. dark theme + command palette
      await js(`setTheme('dark', false); openPalette(); const i = document.querySelector('#palInput'); i.value = '9004'; i.dispatchEvent(new Event('input')); 0`);
      await wait(500);
      await shot('d10-palette-dark', '#palette .palette');
      await js(`closePalette(); setTheme('light', false); 0`);

      fs.writeFileSync(path.join(outDir, 'desktop.json'), JSON.stringify({ shots, selected, summary, errors }, null, 2));
      console.log('[demo] selected', selected, '| summary:', summary.replace(/\s+/g, ' '));
      console.log('[demo] console errors / CSP violations:', errors.length ? errors : 'none');
    } catch (e) { console.error('[demo] ERROR', e); process.exitCode = 1; }
    // remove only what this script created
    if (path.isAbsolute(genRoot) && /Nalogix|nalogix-demo-/.test(path.basename(genRoot))) fs.rmSync(genRoot, { recursive: true, force: true });
    app.quit();
  });
});
