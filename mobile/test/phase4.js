// Phase 4 acceptance: generate 1 690 documents in the worker, UI stays responsive, the ZIP's document.xml for every
// case is identical to the desktop engine's output, combined print doc + Excel report present, cancel works.
const path = require('path');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const { loadAll } = require('../../src/core/node');
require('../../src/core/node');
const { Template, buildValues, fileNameFor } = require('../../src/core/docx');
const { templateKind } = require('../../src/core/cases');
const { dataFiles, until, setup } = require('./helpers');

module.exports = async (ctx) => {
  const { js, shot, tap, wait, log, dataDir } = ctx;
  const check = (ok, msg) => log(ok ? `ok ${msg}` : `FAIL ${msg}`);
  await setup(ctx);
  // select every case (the default rules leave out debts below the minimum and cases without invoices)
  await tap('#tabbar [data-tab="cases"]');
  await until(js, wait, '!!document.querySelector("#selectAllBtn")');
  if ((await js('document.querySelector("#selectAllBtn").dataset.mode')) === 'all') await tap('#selectAllBtn');
  await tap('#tabbar [data-tab="gen"]');
  await until(js, wait, '!!document.querySelector("#gGo")');
  await shot('summary');
  const n = await js('Number(document.querySelector("#gGo").textContent.replace(/\\D/g, ""))');
  log('documents to generate:', n);

  // UI responsiveness probe: longest gap between 16 ms timer ticks on the main thread while the worker runs
  await js('window.__gap = 0; window.__last = performance.now(); window.__probe = setInterval(() => { const t = performance.now(); __gap = Math.max(__gap, t - __last); __last = t; }, 16); 0');
  const t0 = Date.now();
  await tap('#gGo');
  await wait(1500);
  await shot('progress');
  await until(js, wait, '!!document.querySelector("#gSave")', 240000);
  const secs = (Date.now() - t0) / 1000;
  const gap = await js('clearInterval(__probe), __gap');
  check(gap < 250, `UI thread stayed responsive (longest stall ${Math.round(gap)} ms) during ${secs.toFixed(1)} s`);
  await shot('done');
  const info = await js('({ name: __nalogix.result.name, count: __nalogix.result.count, size: __nalogix.blob.size, errors: __nalogix.result.errors.length })');
  log('result:', JSON.stringify(info), `≈ ${(info.count / secs).toFixed(0)} docs/s`);
  check(info.count === n && info.errors === 0, `${info.count}/${n} documents, ${info.errors} errors`);

  // pull the ZIP out of the page and verify every document against the desktop engine
  const b64 = await js('new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(__nalogix.blob); })');
  const zip = await JSZip.loadAsync(Buffer.from(b64, 'base64'));
  const DATA = dataFiles(dataDir);
  const desktop = loadAll([...DATA.lists, ...DATA.items].map((f) => path.join(dataDir, f)));
  const tpls = { standard: await Template.load(path.join(dataDir, 'template.docx')), embg: await Template.load(path.join(dataDir, 'template_NPN_EMBG.docx')) };
  let same = 0, diff = [], missing = 0;
  for (const c of desktop.cases) {
    const f = zip.file(`Предлози/${fileNameFor(c, 'NPN_{BROJ}')}`);
    if (!f) { missing++; continue; }
    const xml = await (await JSZip.loadAsync(await f.async('uint8array'))).file('word/document.xml').async('string');
    const kind = templateKind(c, 'auto', { standard: true, embg: true });
    if (xml === tpls[kind].fill(buildValues(c)).documentXml) same++; else diff.push(c.broj);
  }
  check(same === desktop.cases.length && !missing, `document.xml identical to desktop for ${same}/${desktop.cases.length} cases (missing ${missing}, different ${diff.length}${diff.length ? ': ' + diff.slice(0, 5) : ''})`);

  const combined = Object.keys(zip.files).filter((f) => f.startsWith('_СИТЕ_ЗА_ПЕЧАТЕЊЕ'));
  let pages = 0;
  for (const f of combined) pages += ((await (await JSZip.loadAsync(await zip.file(f).async('uint8array'))).file('word/document.xml').async('string')).match(/ПРЕДЛОГ ЗА ИЗДАВАЊЕ/g) || []).length;
  check(pages === n, `print document(s) ${combined.join(', ')} contain ${pages} предлози`);
  const rep = zip.file('_Извештај.xlsx');
  const rows = rep ? XLSX.utils.sheet_to_json(XLSX.read(await rep.async('uint8array')).Sheets['Извештај']) : [];
  check(rows.length === n, `Excel report has ${rows.length} rows`);

  // generated cases are marked; "Негенерирани" is now empty
  await tap('#tabbar [data-tab="cases"]');
  check((await js('document.querySelector(\'#chips [data-f="todo"] .n\').textContent')) === '0', 'all cases marked as generated');
  await shot('cases-generated');

  // cancel
  await tap('#tabbar [data-tab="gen"]');
  await tap('#gNew');
  // start and cancel in one go: a small dataset finishes in about a second, so waiting first could miss the run
  await js(`(async () => {
    document.querySelector('#gGo').click();
    for (let i = 0; i < 200 && !document.querySelector('#gCancel'); i++) await new Promise((r) => setTimeout(r, 5));
    document.querySelector('#gCancel').click(); return 0; })()`);
  await until(js, wait, '!!document.querySelector("#gGo")', 20000);
  check(await js('[...document.querySelectorAll(".toast b")].some((b) => /прекинато/.test(b.textContent))'), 'cancel right after start stops the run');

  // cancel in the middle of a run: some documents done, the rest must not be produced
  await js('document.querySelectorAll(".toast").forEach((t) => t.remove()); 0');
  const mid = await js(`(async () => {
    document.querySelector('#gGo').click();
    const t0 = performance.now();
    while (!(__nalogix.progress && __nalogix.progress.phase === 'docx' && __nalogix.progress.done > 0) && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 2));
    const doneAtCancel = __nalogix.progress ? __nalogix.progress.done : -1;
    document.querySelector('#gCancel').click();
    while (__nalogix.running) await new Promise((r) => setTimeout(r, 10));
    const toast = [...document.querySelectorAll('.toast span')].map((s) => s.textContent).join(' ');
    return { doneAtCancel, toast, result: __nalogix.result };
  })()`);
  const finished = Number((mid.toast.match(/\d+/) || [])[0]);
  check(mid.doneAtCancel > 0 && mid.result === null && finished < n, `cancel mid-run stops it (${mid.doneAtCancel} done when cancelled, ${finished} of ${n} when it stopped)`);
};
