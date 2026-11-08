// Phase 3 acceptance: 1 690 cases scroll smoothly (windowed), search/filters match desktop, selection,
// detail sheet with preview identical to desktop text, edit + revert, back button closes the sheet.
const path = require('path');
const { loadAll } = require('../../src/core/node');
const { Template, buildValues, previewParagraphs } = require('../../src/core/docx');
require('../../src/core/node'); // Template.load
const { dataFiles, until, setup } = require('./helpers');

module.exports = async (ctx) => {
  const { js, shot, tap, wait, log, noHScroll, dataDir, wc } = ctx;
  const DATA = dataFiles(dataDir);
  const desktop = loadAll([...DATA.lists, ...DATA.items].map((f) => path.join(dataDir, f)));
  const third = [...desktop.cases].sort((a, b) => Number(a.broj) - Number(b.broj))[2].broj; // a case number to search for
  const check = (ok, msg) => log(ok ? `ok ${msg}` : `FAIL ${msg}`);

  await setup(ctx);
  await tap('#tabbar [data-tab="cases"]');
  await until(js, wait, 'document.querySelectorAll("#vrows .case").length > 0');
  check((await js('document.querySelector("#listMeta").textContent')).startsWith(desktop.cases.length.toLocaleString('mk-MK')), `list shows ${desktop.cases.length} cases`);
  const nodes = await js('document.querySelectorAll("#vrows .case").length');
  check(nodes < 40, `windowed list renders only ${nodes} cards`);
  await shot('list');
  await noHScroll('cases');

  // scroll performance: jump through the list and time each re-render
  const perf = await js(`(async () => {
    const H = document.querySelector('#vpad').offsetHeight; const times = [];
    for (let k = 1; k <= 30; k++) { const t = performance.now(); window.scrollTo(0, H * k / 30); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); times.push(performance.now() - t); }
    times.sort((a,b)=>a-b); return { median: times[15], max: times[29], last: document.querySelector('#vrows .case:last-child .top').textContent };
  })()`);
  check(perf.median < 40, `scroll frame median ${perf.median.toFixed(1)} ms, max ${perf.max.toFixed(1)} ms`);
  log('  last rendered card:', perf.last.trim());
  await js('window.scrollTo(0,0)');

  // search
  await js('const s=document.querySelector("#search"); s.value="' + third + '"; s.dispatchEvent(new Event("input"))');
  await wait(400);
  check((await js('document.querySelectorAll("#vrows .case").length')) === 1 && (await js('!!document.querySelector("#vrows mark")')), `search "${third}" → 1 highlighted result`);
  await js('document.querySelector("#searchClear").click()'); await wait(300);

  // filters vs desktop
  const legal = desktop.cases.filter((c) => c.tip === 'pravno').length;
  await tap('#chips [data-f="pravno"]');
  check((await js('document.querySelector("#listMeta").textContent')).startsWith(String(legal)), `filter Правни = ${legal} (desktop)`);
  await tap('#chips [data-f="all"]');

  // selection
  // (the tab badge caps at "999+", so read the exact number from the list header)
  const selCount = 'Number(document.querySelector("#listMeta").textContent.split("·")[1].replace(/\\D/g,""))';
  const before = await js(selCount);
  await tap('#vrows .case:first-child [data-sel]');
  const after = await js(selCount);
  check(Math.abs(after - before) === 1, `tap on circle toggles selection (${before} → ${after})`);
  await tap('#vrows .case:first-child [data-sel]');

  // detail sheet
  const firstId = await js('document.querySelector("#vrows .case").dataset.id');
  await tap('#vrows .case:first-child .main');
  await until(js, wait, '!document.querySelector("#sheet").hidden && document.querySelector("#sheetBody .paper")');
  await shot('sheet-doc');
  const c = desktop.cases.find((x) => x.id === firstId);
  const tpl = await Template.load(path.join(dataDir, c.embg && !c.edb && c.tip === 'fizicko' ? 'template_NPN_EMBG.docx' : 'template.docx'));
  const deskText = previewParagraphs(tpl.fill(buildValues(c)).documentXml).map((p) => p.runs.map((r) => r.text).join('')).join('\n');
  const mobText = await js('[...document.querySelectorAll("#sheetBody .paper p")].map(p => p.textContent.replace(/\\u00a0/g, "")).join("\\n")');
  check(mobText === deskText, `preview text identical to desktop (${deskText.length} chars)`);
  await tap('#sheetTabs [data-t="items"]');
  check((await js('document.querySelectorAll("#sheetBody .inv").length')) === c.items.length, `invoices tab shows ${c.items.length} invoices`);
  await shot('sheet-items');

  // edit + revert
  await tap('#sheetTabs [data-t="edit"]');
  await js('const a=document.querySelector("#f_adresa"); a.value="УЛ.ТЕСТ БР.1 ЦЕНТАР"');
  await tap('#fSave');
  check(await js('document.querySelector("#f_adresa").classList.contains("changed")'), 'edited field marked');
  await shot('sheet-edit');
  await tap('#sheetTabs [data-t="doc"]');
  check(await js('document.querySelector("#sheetBody .paper").textContent.includes("УЛ.ТЕСТ БР.1 ЦЕНТАР")'), 'preview uses the edited address');
  await tap('#sheetTabs [data-t="edit"]');
  await tap('#fRevert');
  check((await js('document.querySelector("#f_adresa").value')) === c.adresa, 'revert restores the original');

  // next case + back button
  await tap('#sheetNext');
  check((await js('document.querySelector("#sheetKicker").textContent')).includes('2/'), 'next → case 2');
  await tap('#sheetTabs [data-t="checks"]');
  await shot('sheet-checks');
  await js('history.back()'); await wait(400);
  check(await js('document.querySelector("#sheet").hidden && location.hash === "#cases"'), 'back button closes the sheet and stays on Тужби');

  // dark
  await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await wait(300);
  await shot('list-dark');
  await tap('#vrows .case:nth-child(3) .main');
  await until(js, wait, '!!document.querySelector("#sheetBody .paper, #sheetBody .check")');
  await tap('#sheetTabs [data-t="doc"]');
  await shot('sheet-doc-dark');
};
