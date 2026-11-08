// Engine Web Worker: everything heavy runs here – Excel parsing (Phase 2) and document generation (Phase 4).
// The browser build of SheetJS does not load codepage tables by itself (Node does). Older BIFF5 .xls exports store
// Cyrillic in codepage 1251, so without this their headers decode as garbage and the file is not recognised.
import { set_cptable, utils as XU, write as xlsxWrite } from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import JSZip from 'jszip';
import { loadFiles } from '../../src/core/excel.js';
import { Template, buildValues, fileNameFor } from '../../src/core/docx.js';
import { templateKind, reportRow } from '../../src/core/cases.js';

set_cptable(cptable);

const cancelledIds = new Set();
const tplCache = new Map(); // name|size -> Template (templates rarely change between runs)

async function getTemplate(t) {
  if (!t) return null;
  const key = `${t.name}|${t.data.byteLength}`;
  if (!tplCache.has(key)) tplCache.set(key, await Template.fromData(new Uint8Array(t.data), t.name));
  return tplCache.get(key);
}

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
};

const ops = {
  load({ files }) {
    return loadFiles(files.map((f) => ({ name: f.name, data: new Uint8Array(f.data) })));
  },

  /**
   * job: { cases, templates: { standard?: {name,data}, embg?: {name,data} }, mode, pattern, options: { combined, report }, overrides }
   * → { zip: Uint8Array, name, ok, warn, errors[], doneIds[], ms, files }
   */
  async generate({ job }, progress, isCancelled) {
    const t0 = Date.now();
    const tpls = { standard: await getTemplate(job.templates.standard), embg: await getTemplate(job.templates.embg) };
    const has = { standard: !!tpls.standard, embg: !!tpls.embg };
    if (!has.standard && !has.embg) throw new Error('Нема избран Word шаблон');
    const overrides = new Map(Object.entries(job.overrides || {}));
    const zip = new JSZip();
    const folder = zip.folder('Предлози');
    const used = new Set();
    const combined = { standard: [], embg: [] };
    const results = [];
    let lastTick = 0;

    for (let i = 0; i < job.cases.length; i++) {
      // render() only awaits promises (microtasks), so without a real task turn the 'cancel' message could not be
      // delivered until the whole run had finished. Yield to the event loop every few documents.
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
      if (isCancelled()) break;
      const c = job.cases[i];
      const kind = templateKind(c, job.mode, has);
      const row = { id: c.id, broj: c.broj, ime: c.ime, status: 'ok', file: '', template: kind ? tpls[kind].name : '', message: '' };
      try {
        let name = fileNameFor(c, job.pattern);
        if (used.has(name.toLowerCase())) name = name.replace(/\.docx$/, `_${c.godina || i}.docx`);
        used.add(name.toLowerCase());
        const r = await tpls[kind].render(buildValues(c));
        folder.file(name, r.buffer, { compression: 'STORE' }); // a .docx is already compressed
        row.file = name;
        if (job.options.combined) combined[kind].push(r.documentXml);
        if (r.unknown.length) { row.status = 'warn'; row.message = `Непознати полиња: ${r.unknown.join(', ')}`; }
        else if (c.warnings.some((w) => w.level !== 'info')) { row.status = 'warn'; row.message = c.warnings.map((w) => w.text).join('; '); }
      } catch (err) {
        row.status = 'error';
        row.message = err.message || String(err);
      }
      results.push(row);
      const now = Date.now();
      if (now - lastTick > 80 || i === job.cases.length - 1) { lastTick = now; progress({ phase: 'docx', done: i + 1, total: job.cases.length, name: c.ime }); }
    }
    if (isCancelled()) return { cancelled: true, done: results.length };

    const extras = [];
    const st = stamp();
    if (job.options.combined) {
      progress({ phase: 'combined' });
      for (const kind of ['standard', 'embg']) {
        if (!combined[kind].length) continue;
        const suffix = combined.standard.length && combined.embg.length ? (kind === 'embg' ? '_ЕМБГ' : '_стандарден') : '';
        const name = `_СИТЕ_ЗА_ПЕЧАТЕЊЕ${suffix}.docx`;
        zip.file(name, await tpls[kind].combine(combined[kind]), { compression: 'STORE' });
        extras.push(name);
      }
    }
    if (job.options.report && results.length) {
      progress({ phase: 'report' });
      const byId = new Map(job.cases.map((c) => [c.id, c]));
      const rows = results.map((r) => reportRow(byId.get(r.id), overrides, {
        'Шаблон': r.template, 'Датотека': r.file,
        'Статус': { ok: 'Генериран', warn: 'Со забелешка', error: 'Грешка' }[r.status], 'Забелешка': r.message,
      }));
      const ws = XU.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.min(50, Math.max(k.length + 2, ...rows.slice(0, 200).map((x) => String(x[k] ?? '').length + 1))) }));
      if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
      const wb = XU.book_new();
      XU.book_append_sheet(wb, ws, 'Извештај');
      zip.file('_Извештај.xlsx', xlsxWrite(wb, { type: 'array', bookType: 'xlsx' }));
      extras.push('_Извештај.xlsx');
    }
    progress({ phase: 'zip' });
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
    const ok = results.filter((r) => r.status !== 'error');
    return {
      zip: out, name: `Nalogix_${results.length ? `${results[0].broj}-${results[results.length - 1].broj}` : 'празно'}_${st}.zip`,
      ok: results.filter((r) => r.status === 'ok').length, warn: results.filter((r) => r.status === 'warn').length,
      errors: results.filter((r) => r.status === 'error').map((r) => ({ broj: r.broj, ime: r.ime, message: r.message })),
      doneIds: ok.map((r) => r.id), ms: Date.now() - t0, extras, count: ok.length,
    };
  },
};

self.onmessage = async (e) => {
  const { id, op } = e.data;
  // cancel is per job id: starting a job can never wipe out a cancel meant for it
  if (op === 'cancel') { cancelledIds.add(id); return; }
  try {
    if (!ops[op]) throw new Error(`unknown op ${op}`);
    const progress = (p) => self.postMessage({ id, type: 'progress', ...p });
    const result = await ops[op](e.data, progress, () => cancelledIds.has(id));
    cancelledIds.delete(id);
    // hand the ZIP bytes over without copying them
    self.postMessage({ id, type: 'done', result }, result && result.zip ? [result.zip.buffer] : []);
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err && err.message ? err.message : String(err) });
  }
};
