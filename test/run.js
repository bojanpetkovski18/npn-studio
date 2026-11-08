'use strict';
// End-to-end engine check: Excel → join → Word (+ combined print document), with assertions on the output.
//   node test/run.js [dataDir] [outDir]     dataDir defaults to the fictional samples/
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { loadAll, Template } = require('../src/core/node');
const { buildValues, fileNameFor, previewParagraphs, mergeSplitPlaceholders } = require('../src/core/docx');
const { templateKind } = require('../src/core/cases');
const { money, moneyInt, date } = require('../src/core/format');

const SAMPLES = path.join(__dirname, '..', 'samples');

(async () => {
  assert.strictEqual(money(11284), '11.284,00');
  assert.strictEqual(money(1234567.5), '1.234.567,50');
  assert.strictEqual(moneyInt(295), '295');
  assert.strictEqual(date(45930), '30.09.2025');
  assert.strictEqual(date(45950), '20.10.2025');
  const split = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Име: {{</w:t></w:r><w:r><w:t>IM</w:t></w:r><w:r><w:t>E}} крај</w:t></w:r></w:p>';
  assert.ok(mergeSplitPlaceholders(split).includes('Име: {{IME}}</w:t>'), 'placeholder split across runs is merged');

  const dir = process.argv[2] || SAMPLES;
  const out = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'npn-run-'));
  fs.mkdirSync(out, { recursive: true });
  const files = fs.readdirSync(dir).filter((f) => /\.(xls|xlsx)$/i.test(f) && !f.startsWith('_')).map((f) => path.join(dir, f));
  const t0 = Date.now();
  const res = loadAll(files);
  console.log('files', res.files.map((f) => `${f.kind}:${f.rows}`).join(' '), '| cases', res.cases.length, '| items', res.itemCount, '| loaded in', Date.now() - t0, 'ms');
  assert.ok(res.cases.length > 0 && res.files.every((f) => !f.error), 'all files load');

  const tpl = { standard: await Template.load(path.join(dir, 'template.docx')), embg: await Template.load(path.join(dir, 'template_NPN_EMBG.docx')) };
  const has = { standard: true, embg: true };

  const t1 = Date.now();
  const xmls = [];
  const sample = res.cases.slice(0, 40);
  for (const c of sample) {
    const r = await tpl[templateKind(c, 'auto', has)].render(buildValues(c));
    assert.deepStrictEqual(r.unknown, [], `no unknown placeholders (${c.broj})`);
    fs.writeFileSync(path.join(out, fileNameFor(c, 'NPN_{BROJ}')), r.buffer);
    xmls.push(r.documentXml);
  }
  console.log(`rendered ${sample.length} in ${Date.now() - t1} ms`);
  const combined = await tpl.standard.combine(xmls);
  fs.writeFileSync(path.join(out, '_COMBINED.docx'), combined);
  assert.ok(combined.length > 0, 'combined print document');

  // content checks on one case that has a „тековна состојба“ amount (exercises the hard-coded ",00" after it)
  const c = res.cases.find((x) => x.tekovna > 0 && x.items.length) || res.cases.find((x) => x.items.length);
  const txt = previewParagraphs(tpl.standard.fill(buildValues(c)).documentXml).map((p) => p.runs.map((x) => (x.bold ? `**${x.text}**` : x.text)).join('')).join('\n');
  assert.ok(txt.includes(`**Должник: **${c.ime}`), 'bold label kept, value filled in');
  const it = c.items[0];
  assert.ok(txt.includes(`За ф-ра бр. ${it.faktura} од ${date(it.ddo)} во износ од ${money(it.iznos)} денари сметано од ${date(it.valuta)} до конечна исплата;`), 'invoice line');
  assert.ok(txt.includes(`${money(c.vkupnoTroshoci)}`), 'total costs');
  assert.ok(!txt.includes(',00,00'), 'a hard-coded ",00" in the template is not doubled');
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(txt), 'no placeholder left');
  console.log('ALL OK');
})().catch((e) => { console.error(e); process.exit(1); });
