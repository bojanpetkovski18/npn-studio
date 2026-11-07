// Phase 2 acceptance: real files load on a phone viewport, kinds detected, templates remembered across restarts,
// per-file errors shown, desktop and mobile agree on the number of cases.
const path = require('path');
const { dataFiles } = require('./helpers');
const { loadAll } = require('../../src/core/node');

module.exports = async ({ js, shot, tap, wait, log, pick, noHScroll, dataDir }) => {
  const { lists: [LIST], items: [ITEMS] } = dataFiles(dataDir);
  const expected = loadAll([path.join(dataDir, LIST), path.join(dataDir, ITEMS)]);
  const until = async (cond, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(cond)) return true; await wait(150); } return false; };

  await pick('#excelInput', [LIST, ITEMS]);
  await until('document.querySelectorAll("#fileList .kind.list").length === 1 && document.querySelectorAll("#fileList .kind.items").length === 1');
  const n = await js('document.querySelector("#dataHero h1").textContent');
  log(n.startsWith(String(expected.cases.length)) ? `ok ${n} (desktop: ${expected.cases.length})` : `FAIL cases ${n} vs desktop ${expected.cases.length}`);
  await shot('loaded');
  await noHScroll('data loaded');

  // templates
  await js('document.querySelector("[data-tpl=standard]").click()');
  await pick('#tplInput', ['template.docx']);
  await until('document.querySelector("#tpl-standard b").textContent === "template.docx"');
  await js('document.querySelector("[data-tpl=embg]").click()');
  await pick('#tplInput', ['template_NPN_EMBG.docx']);
  await until('document.querySelector("#tpl-embg b").textContent === "template_NPN_EMBG.docx"');
  log((await js('document.querySelector("#tpl-standard small:last-child").textContent')) === '12 полиња' ? 'ok standard template 12 fields' : 'FAIL standard template');
  await tap('#modeSeg [data-v="standard"]');
  log('mode after tap:', await js('document.querySelector("#modeSeg .on").dataset.v'));
  await wait(600); // session save is debounced
  await shot('templates');

  // broken file: a .docx renamed to .xls must be reported, the rest keeps working
  await js(`(async () => { const b = await (await fetch('/__data/template.docx')).blob(); const dt = new DataTransfer(); dt.items.add(new File([b], 'оштетена.xls'));
    const i = document.querySelector('#excelInput'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await until('document.querySelectorAll("#fileList .file-item.err").length === 1');
  log((await js('document.querySelectorAll("#fileList .file-item.err").length')) === 1 ? 'ok broken file flagged' : 'FAIL broken file');
  log((await js('document.querySelector("#dataHero h1").textContent')).startsWith(String(expected.cases.length)) ? 'ok other files still loaded' : 'FAIL load aborted');
  await shot('error-file');
  await js('document.querySelector(\'[data-rm="оштетена.xls"]\').click()');
  await until('!document.querySelector("#fileList .file-item.err")');

  // restart: everything comes back from IndexedDB
  await js('location.reload()');
  await wait(800);
  const back = await until(`(document.querySelector("#dataHero h1")||{}).textContent?.startsWith("${expected.cases.length}") && document.querySelector("#tpl-embg b").textContent === "template_NPN_EMBG.docx"`);
  log(back ? 'ok restored after restart (files + templates)' : 'FAIL restore');
  const mode = await js('document.querySelector("#modeSeg .on").dataset.v');
  log(mode === 'standard' ? 'ok template mode restored' : `FAIL mode restore (${mode})`);
  await shot('restored');
};
