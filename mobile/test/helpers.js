// Shared test steps. Works with any data folder: the fictional samples by default (samples/), or a real folder
// passed on the command line (never committed). File kinds are detected by the engine, not by file name.
const fs = require('fs');
const path = require('path');
const { inspectData } = require('../../src/core/excel');

/** { lists: [...], items: [...] } – Excel files in the folder, classified like the app does. */
function dataFiles(dataDir) {
  const out = { lists: [], items: [] };
  for (const f of fs.readdirSync(dataDir).filter((n) => /\.(xls|xlsx)$/i.test(n) && !n.startsWith('_') && !n.startsWith('~$')).sort()) {
    const kind = inspectData(fs.readFileSync(path.join(dataDir, f)), f).kind;
    if (kind === 'list') out.lists.push(f); else if (kind === 'items') out.items.push(f);
  }
  return out;
}

async function until(js, wait, cond, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await js(cond)) return true; await wait(150); }
  return false;
}

/** Loads Excel files + both templates through the UI (like a user would). */
async function setup({ js, pick, wait, dataDir }, files) {
  const d = dataFiles(dataDir);
  files = files || [...d.lists, ...d.items];
  await pick('#excelInput', files);
  await until(js, wait, `document.querySelectorAll("#fileList .file-item:not(.err)").length === ${files.length} && /тужб/.test(document.querySelector("#dataHero h1").textContent)`);
  await js('document.querySelector("[data-tpl=standard]").click()');
  await pick('#tplInput', ['template.docx']);
  await until(js, wait, 'document.querySelector("#tpl-standard b").textContent === "template.docx"');
  await js('document.querySelector("[data-tpl=embg]").click()');
  await pick('#tplInput', ['template_NPN_EMBG.docx']);
  await until(js, wait, 'document.querySelector("#tpl-embg b").textContent === "template_NPN_EMBG.docx"');
  await js('document.querySelectorAll(".toast").forEach((t) => t.remove())');
}

module.exports = { dataFiles, until, setup };
