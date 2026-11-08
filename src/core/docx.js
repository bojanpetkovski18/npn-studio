'use strict';

// Pure engine module (no Node built-ins): shared by the desktop app and the mobile bundle.
const JSZip = require('jszip');
const { money, moneyInt, date } = require('./format');

const PLACEHOLDER = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
const AMOUNT_KEYS = new Set([
  'VKUPEN_DOLG', 'VKUPNO_TROSHOCI', 'ADVOKAT', 'NOTAR_TROSOK', 'NOTAR_NAGRADA',
  'MATERIJAL', 'TEKOVNA_SOSTOJBA', 'ZBIR_FAKTURI', 'VKUPNO_SO_TROSHOCI',
]);
const LIST_KEYS = new Set(['FAKTURI_TABELA']);

const xmlEscape = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const T_RE = /<w:t(?=[\s>])([^>]*)>([\s\S]*?)<\/w:t>/g;
const P_RE = /<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g;

/**
 * Word often splits "{{NAME}}" across several runs after a template is edited.
 * This moves every placeholder fully into the run where it starts, so the
 * replacement keeps that run's formatting (bold, size, font…).
 */
function mergeSplitPlaceholders(pXml) {
  const tokens = [];
  let m;
  T_RE.lastIndex = 0;
  while ((m = T_RE.exec(pXml))) {
    tokens.push({ start: m.index, end: m.index + m[0].length, attrs: m[1], text: m[2] });
  }
  if (tokens.length < 2) return pXml;
  const concat = tokens.map((t) => t.text).join('');
  if (!concat.includes('{{')) return pXml;

  // owner[i] = token index that will hold character i
  const owner = [];
  tokens.forEach((t, ti) => { for (let k = 0; k < t.text.length; k++) owner.push(ti); });
  let changed = false;
  const re = /\{\{[^{}]*\}\}/g;
  while ((m = re.exec(concat))) {
    const first = owner[m.index];
    for (let k = m.index; k < m.index + m[0].length; k++) {
      if (owner[k] !== first) { owner[k] = first; changed = true; }
    }
  }
  if (!changed) return pXml;

  const texts = tokens.map(() => '');
  for (let k = 0; k < concat.length; k++) texts[owner[k]] += concat[k];

  let out = '';
  let last = 0;
  tokens.forEach((t, ti) => {
    out += pXml.slice(last, t.start);
    const attrs = /xml:space/.test(t.attrs) ? t.attrs : `${t.attrs} xml:space="preserve"`;
    out += `<w:t${attrs}>${texts[ti]}</w:t>`;
    last = t.end;
  });
  return out + pXml.slice(last);
}

/** Ensures the run holding the invoice list has the same font size as the surrounding text. */
function harmonizeListRun(pXml, key) {
  const runRe = new RegExp(`<w:r(?=[\\s>])[^>]*>(?:(?!<\\/w:r>)[\\s\\S])*?\\{\\{\\s*${key}\\s*\\}\\}[\\s\\S]*?<\\/w:r>`);
  const rm = pXml.match(runRe);
  if (!rm) return pXml;
  const run = rm[0];
  const rPrMatch = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  if (rPrMatch && /<w:sz\s/.test(rPrMatch[0])) return pXml;
  const sz = pXml.split(run).join('').match(/<w:sz w:val="(\d+)"\/>/);
  if (!sz) return pXml;
  const add = `<w:sz w:val="${sz[1]}"/><w:szCs w:val="${sz[1]}"/>`;
  const fixed = rPrMatch
    ? run.replace(rPrMatch[0], () => rPrMatch[0].replace('</w:rPr>', () => `${add}</w:rPr>`))
    : run.replace(/^(<w:r(?=[\s>])[^>]*>)/, `$1<w:rPr>${add}</w:rPr>`);
  return pXml.replace(run, () => fixed);
}

/** Fills one paragraph. Returns { xml, unknown:Set } */
function fillParagraph(pXml, values, unknown) {
  pXml = mergeSplitPlaceholders(pXml);
  if (!pXml.includes('{{')) return pXml;

  for (const key of LIST_KEYS) {
    if (pXml.includes(key)) pXml = harmonizeListRun(pXml, key);
  }

  // Plain text after each token is needed to detect a hard-coded ",00" right after an amount
  const tokens = [];
  let m;
  T_RE.lastIndex = 0;
  while ((m = T_RE.exec(pXml))) tokens.push({ start: m.index, end: m.index + m[0].length, attrs: m[1], text: m[2] });
  const fullText = tokens.map((t) => t.text).join('');

  let offset = 0;
  let out = '';
  let last = 0;
  for (const t of tokens) {
    const tokenOffset = offset;
    offset += t.text.length;
    if (!t.text.includes('{{')) continue;

    const pieces = []; // array of strings; '\n' entries become <w:br/>
    let cursor = 0;
    let buf = '';
    PLACEHOLDER.lastIndex = 0;
    while ((m = PLACEHOLDER.exec(t.text))) {
      buf += t.text.slice(cursor, m.index);
      cursor = m.index + m[0].length;
      const key = m[1];
      const v = values[key];
      if (v === undefined) { unknown.add(key); buf += m[0]; continue; }

      if (Array.isArray(v)) {
        v.forEach((line, i) => {
          if (i > 0) { pieces.push(buf); pieces.push('\n'); buf = ''; }
          buf += xmlEscape(line);
        });
      } else if (AMOUNT_KEYS.has(key) && typeof v === 'number') {
        const after = fullText.slice(tokenOffset + cursor, tokenOffset + cursor + 3);
        buf += xmlEscape(/^,\d\d/.test(after) ? moneyInt(v) : money(v));
      } else {
        buf += xmlEscape(v);
      }
    }
    buf += t.text.slice(cursor);
    pieces.push(buf);

    const attrs = /xml:space/.test(t.attrs) ? t.attrs : `${t.attrs} xml:space="preserve"`;
    const rebuilt = pieces.map((p) => (p === '\n' ? '<w:br/>' : `<w:t${attrs}>${p}</w:t>`)).join('');
    out += pXml.slice(last, t.start) + rebuilt;
    last = t.end;
  }
  return out + pXml.slice(last);
}

function fillXml(xml, values) {
  const unknown = new Set();
  const filled = xml.replace(P_RE, (p) => (p.includes('{') ? fillParagraph(p, values, unknown) : p));
  return { xml: filled, unknown };
}

/** Builds the placeholder map for one case. */
function buildValues(c, opts = {}) {
  const fakturi = c.items.map((it) =>
    `За ф-ра бр. ${it.faktura} од ${date(it.ddo)} во износ од ${money(it.iznos)} денари сметано од ${date(it.valuta)} до конечна исплата;`);
  return {
    BROJ_DOKUMENT: c.broj,
    GODINA: c.godina || String(new Date().getFullYear()),
    SERIJA: c.serija || '',
    IME: c.ime,
    ADRESA: c.adresa,
    SIFRA: c.sifra,
    EMBG: c.embg || '',
    VKUPEN_DOLG: c.vkupenDolg,
    TEKOVNA_SOSTOJBA: c.tekovna,
    NOTAR_NAGRADA: c.notarNagrada,
    NOTAR_TROSOK: c.notarTrosok,
    MATERIJAL: c.materijal,
    ADVOKAT: c.advokat,
    VKUPNO_TROSHOCI: c.vkupnoTroshoci,
    VKUPNO_SO_TROSHOCI: c.vkupenDolg + c.vkupnoTroshoci,
    ZBIR_FAKTURI: c.zbirStavki,
    BROJ_FAKTURI: String(c.items.length),
    DATUM: opts.datum || '',
    FAKTURI_TABELA: fakturi.length ? fakturi : [''],
  };
}

const OUT_TYPE = typeof Buffer !== 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.node ? 'nodebuffer' : 'uint8array';
const XML_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

class Template {
  /** data: Uint8Array | ArrayBuffer | Buffer. (Node: use Template.load(path) from ./node.js) */
  static async fromData(data, name, filePath = name) {
    const base = String(name || 'template.docx').split(/[\\/]/).pop(); // both separators: Windows and POSIX paths
    let zip;
    try { zip = await JSZip.loadAsync(data); } catch { throw new Error(`„${base}“ не е важечки .docx (можеби е стар .doc или е оштетен)`); }
    if (!zip.file('word/document.xml')) throw new Error(`„${base}“ не е Word документ`);
    const parts = {};
    for (const [name, entry] of Object.entries(zip.files)) {
      if (!entry.dir && XML_PARTS.test(name)) parts[name] = await entry.async('string');
    }
    const t = new Template();
    t.filePath = filePath;
    t.name = base;
    t.base = zip; // never mutated – every render works on base.clone()
    t.parts = parts;
    t.placeholders = [...new Set(Object.values(parts).flatMap((x) => {
      // detect placeholders even if split across runs
      const plain = x.replace(P_RE, (p) => mergeSplitPlaceholders(p));
      return [...plain.matchAll(PLACEHOLDER)].map((mm) => mm[1]);
    }))];
    return t;
  }

  /** Fills the XML parts only (no zipping) – cheap, used by the preview. Pure: never mutates the template. */
  fill(values) {
    const unknown = new Set();
    const parts = {};
    for (const [name, xml] of Object.entries(this.parts)) {
      const r = fillXml(xml, values);
      r.unknown.forEach((u) => unknown.add(u));
      parts[name] = r.xml;
    }
    return { parts, unknown: [...unknown], documentXml: parts['word/document.xml'] || '' };
  }

  /** Builds a fresh package: a fresh zip over the pristine template entries (unchanged parts keep their already-compressed bytes). */
  async pack(parts) {
    // JSZip#clone() shares the files map with the original, so copy the map: entries are swapped, never mutated
    const zip = new JSZip();
    zip.files = Object.assign(Object.create(null), this.base.files);
    for (const [name, xml] of Object.entries(parts)) zip.file(name, xml);
    return zip.generateAsync({ type: OUT_TYPE, compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  /** Returns { buffer, unknown[], documentXml }. Safe to call concurrently (each call builds its own zip). */
  async render(values) {
    const f = this.fill(values);
    const buffer = await this.pack(f.parts);
    return { buffer, unknown: f.unknown, documentXml: f.documentXml };
  }

  /** Builds a single .docx with every filled body separated by page breaks (for one-click printing). */
  async combine(documentXmls) {
    const base = this.parts['word/document.xml'];
    const bodyOpen = base.indexOf('<w:body>') + '<w:body>'.length;
    const head = base.slice(0, bodyOpen);
    const lastSect = base.lastIndexOf('<w:sectPr');
    const tail = base.slice(lastSect);

    const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    const bodies = documentXmls.map((xml) => {
      const s = xml.indexOf('<w:body>') + '<w:body>'.length;
      const e = xml.lastIndexOf('<w:sectPr');
      return xml.slice(s, e)
        .replace(/\sw14:(paraId|textId)="[^"]*"/g, '')
        .replace(/<w:bookmark(Start|End)\b[^>]*\/>/g, '');
    });
    const merged = head + bodies.join(pageBreak) + tail;
    return this.pack({ 'word/document.xml': merged });
  }
}

/** Plain-text preview of the filled template (for the in-app preview pane). */
function previewParagraphs(documentXml) {
  const paras = [];
  const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  for (const p of documentXml.match(P_RE) || []) {
    const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
    const runs = [];
    for (const r of p.match(/<w:r(?=[\s>])[^>]*>[\s\S]*?<\/w:r>/g) || []) {
      const rPr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
      const bold = /<w:b\/>|<w:b w:val="(1|true|on)"\/>/.test(rPr);
      let txt = '';
      r.replace(/<w:t(?=[\s>])[^>]*>([\s\S]*?)<\/w:t>|<w:br\/>|<w:tab\/>/g, (all, t) => {
        txt += all === '<w:br/>' ? '\n' : all === '<w:tab/>' ? '\t' : unescape(t);
        return '';
      });
      if (txt) runs.push({ text: txt, bold });
    }
    paras.push({ runs, center: /<w:jc w:val="center"\/>/.test(pPr), right: /<w:jc w:val="right"\/>/.test(pPr) });
  }
  return paras;
}

/**
 * Windows-safe file/folder name: strips illegal chars, trailing dots/spaces (Windows silently drops them, which
 * broke "already generated" detection for names like „… Д.О.О.“) and reserved device names (CON, NUL, COM1…).
 */
function safeFileName(s, max = 150) {
  let out = String(s ?? '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, max);
  out = out.replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(out)) out = `_${out}`;
  return out || 'document';
}

function fileNameFor(c, pattern) {
  const map = { BROJ: c.broj, IME: c.ime, SIFRA: c.sifra, GODINA: c.godina, SERIJA: c.serija, EMBG: c.embg || '', MESTO: c.mesto || '' };
  // function replacer: names containing "$&" / "$1" must not be interpreted as replacement patterns
  const name = (pattern || 'NPN_{BROJ}').replace(/\{([A-Z]+)\}/g, (all, k) => (k in map ? String(map[k] ?? '') : all));
  return safeFileName(name) + '.docx';
}

module.exports = { Template, buildValues, fillXml, previewParagraphs, fileNameFor, safeFileName, mergeSplitPlaceholders };
