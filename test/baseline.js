'use strict';
// Output baseline: hashes the filled document.xml of every case with both templates, plus the analysis results,
// and compares with test/baseline.sha256 – so a refactor cannot silently change a generated document.
//   node test/baseline.js [--write]     always uses the fictional samples/ (the stored hash is for them)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadAll, Template } = require('../src/core/node');
const { buildValues } = require('../src/core/docx');

const dir = path.join(__dirname, '..', 'samples');
const write = process.argv.includes('--write');

(async () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(xls|xlsx)$/i.test(f) && !f.startsWith('_')).sort().map((f) => path.join(dir, f));
  const res = loadAll(files);
  const tpls = { std: await Template.load(path.join(dir, 'template.docx')), emb: await Template.load(path.join(dir, 'template_NPN_EMBG.docx')) };
  const h = crypto.createHash('sha256');
  for (const c of res.cases) for (const k of ['std', 'emb']) h.update(tpls[k].fill(buildValues(c)).documentXml);
  h.update(JSON.stringify(res.cases.map((c) => [c.id, c.tip, c.mesto, c.edb, c.warnings.map((w) => w.text), c.zbirStavki, c.vkupnoTroshoci])));
  const digest = h.digest('hex');
  const file = path.join(__dirname, 'baseline.sha256');
  if (write) { fs.writeFileSync(file, `${digest}\n`); console.log('baseline written', res.cases.length, 'cases', digest.slice(0, 16)); return; }
  const ref = fs.readFileSync(file, 'utf8').trim();
  console.log(digest === ref ? `BASELINE OK (${res.cases.length} cases × 2 templates)` : `BASELINE MISMATCH ${digest.slice(0, 16)} != ${ref.slice(0, 16)}`);
  if (digest !== ref) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
