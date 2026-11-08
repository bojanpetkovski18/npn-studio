'use strict';

// Pure engine module: no Node built-ins, runs unchanged in Electron and in the mobile browser bundle.
// File-system helpers live in ./node.js.
const XLSX = require('xlsx');
const { text, num } = require('./format');
const { join, recompute } = require('./cases');
const { enrich } = require('./analyze');

const norm = (h) => String(h || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Header aliases (normalised) -> internal field
const LIST_FIELDS = {
  serija: ['серија'],
  broj: ['тужба број', 'тужба бр', 'број на тужба'],
  godina: ['година', 'година на тужење'],
  sifra: ['шифра коминтент', 'шифра на коминтент', 'шифра на корисник', 'шифра'],
  ime: ['назив', 'име и презиме', 'должник'],
  adresa: ['адреса'],
  vkupenDolg: ['вкупен долг', 'вкупен долг по тужба'],
  tekovna: ['тековна состојба'],
  notarNagrada: ['нотарска награда'],
  notarTrosok: ['нотарски трошок', 'нотарски трошоци'],
  materijal: ['материјален трошок', 'материјални трошоци'],
  advokat: ['адвокатски трошок', 'адвокатска награда'],
  embg: ['ембг'],
};

const ITEM_FIELDS = {
  broj: ['тужба број', 'тужба бр'],
  godina: ['година на тужење', 'година'],
  sifra: ['шифра на коминтент', 'шифра коминтент'],
  docGodina: ['година на документ'],
  docMesec: ['месец на документ'],
  ddo: ['документ датум ддо', 'датум ддо', 'датум на фактура'],
  valuta: ['документ датум валута', 'датум валута', 'валута'],
  faktura: ['фактура број', 'број на фактура'],
  iznos: ['долг по документ', 'износ'],
};

function mapHeaders(headerRow, fields) {
  const idx = {};
  const normalized = headerRow.map(norm);
  for (const [key, aliases] of Object.entries(fields)) {
    for (const a of aliases) {
      const i = normalized.indexOf(a);
      if (i !== -1) { idx[key] = i; break; }
    }
  }
  return idx;
}

/** data: Uint8Array | ArrayBuffer | Buffer (a Buffer is a Uint8Array) */
function readSheet(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false, raw: false, codepage: 1251 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  // Find the header row (first row among the first 10 that contains "тужба")
  let h = rows.findIndex((r, i) => i < 10 && r.some((c) => norm(c).includes('тужба')));
  if (h === -1) h = 0;
  return { header: rows[h] || [], body: rows.slice(h + 1), sheetName: wb.SheetNames[0] };
}

/** Detects whether a workbook is a "Листа на тужби" or "Ставки по тужби" file. */
function detectKind(header) {
  const n = header.map(norm);
  if (n.some((x) => x.includes('фактура'))) return 'items';
  if (n.includes('назив') || n.includes('адреса')) return 'list';
  return null;
}

const baseName = (p) => String(p || '').split(/[\\/]/).pop(); // both separators: Windows and POSIX paths

/** Parses one workbook from memory. */
function inspectData(data, name, filePath = name) {
  const { header, body, sheetName } = readSheet(data);
  const kind = detectKind(header);
  return { filePath, name: baseName(name), kind, sheetName, header, body };
}

function parseList(sheet) {
  const ix = mapHeaders(sheet.header, LIST_FIELDS);
  const missing = ['broj', 'ime', 'vkupenDolg'].filter((k) => ix[k] === undefined);
  if (missing.length) throw new Error(`„${sheet.name}“: недостасуваат колони (${missing.join(', ')})`);
  const get = (r, k) => (ix[k] === undefined ? '' : r[ix[k]]);
  const out = [];
  for (const r of sheet.body) {
    const broj = text(get(r, 'broj'));
    if (!broj || !/^\d+$/.test(broj.replace(/\.0+$/, ''))) continue; // skip blank / total rows
    let embg = text(get(r, 'embg'));
    if (/^\d{11,12}$/.test(embg)) embg = embg.padStart(13, '0'); // numeric cells lose leading zeros
    out.push({
      serija: text(get(r, 'serija')),
      broj: broj.replace(/\.0+$/, ''),
      godina: text(get(r, 'godina')),
      sifra: text(get(r, 'sifra')),
      ime: text(get(r, 'ime')),
      adresa: text(get(r, 'adresa')),
      embg,
      vkupenDolg: num(get(r, 'vkupenDolg')),
      tekovna: num(get(r, 'tekovna')),
      notarNagrada: num(get(r, 'notarNagrada')),
      notarTrosok: num(get(r, 'notarTrosok')),
      materijal: num(get(r, 'materijal')),
      advokat: num(get(r, 'advokat')),
      source: sheet.name,
    });
  }
  return out;
}

function parseItems(sheet) {
  const ix = mapHeaders(sheet.header, ITEM_FIELDS);
  const missing = ['broj', 'faktura', 'iznos'].filter((k) => ix[k] === undefined);
  if (missing.length) throw new Error(`„${sheet.name}“: недостасуваат колони (${missing.join(', ')})`);
  const get = (r, k) => (ix[k] === undefined ? '' : r[ix[k]]);
  const out = [];
  for (const r of sheet.body) {
    const broj = text(get(r, 'broj')).replace(/\.0+$/, '');
    if (!broj || !/^\d+$/.test(broj)) continue;
    out.push({
      broj,
      godina: text(get(r, 'godina')),
      sifra: text(get(r, 'sifra')),
      ddo: get(r, 'ddo'),
      valuta: get(r, 'valuta'),
      faktura: text(get(r, 'faktura')),
      iznos: num(get(r, 'iznos')),
    });
  }
  return out;
}

/**
 * Loads any number of in-memory files ({ name, data, filePath?, error? }), auto-detects their kind and
 * returns joined + enriched cases. A file that fails is reported in `files[].error` and the rest still load.
 */
function loadFiles(inputs) {
  const files = [];
  const lists = [];
  const items = [];
  for (const input of inputs) {
    const filePath = input.filePath || input.name;
    if (input.error) { files.push({ filePath, name: baseName(input.name), kind: null, rows: 0, error: input.error }); continue; }
    try {
      const sheet = inspectData(input.data, input.name, filePath);
      // (no spread-push: it overflows the call stack on very large sheets)
      if (sheet.kind === 'list') for (const r of parseList(sheet)) lists.push(r);
      else if (sheet.kind === 'items') for (const r of parseItems(sheet)) items.push(r);
      files.push({ filePath, name: sheet.name, kind: sheet.kind, rows: sheet.body.length,
        error: sheet.kind ? null : 'Не е препознаена како „Листа на тужби“ ниту „Ставки по тужби“' });
    } catch (err) {
      files.push({ filePath, name: baseName(input.name), kind: null, rows: 0, error: err.message || String(err) });
    }
  }
  const cases = enrich(join(lists, items));
  return { files, cases, itemCount: items.length, duplicatesSkipped: lists.length - cases.length };
}

module.exports = { inspectData, loadFiles, join, recompute, parseList, parseItems };
