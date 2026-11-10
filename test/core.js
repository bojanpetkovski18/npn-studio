'use strict';
// Unit checks for the shared engine logic used by both desktop and mobile.
//   node test/core.js [dataDir]     dataDir defaults to the fictional samples/
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { loadAll } = require('../src/core/node');
const { applyOverride, applyOverrides, templateKind } = require('../src/core/cases');
const { num } = require('../src/core/format');
const { placeOf } = require('../src/core/analyze');
const { safeFileName } = require('../src/core/docx');

const dir = process.argv[2] || path.join(__dirname, '..', 'samples');
const files = fs.readdirSync(dir).filter((f) => /\.(xls|xlsx)$/i.test(f) && !f.startsWith('_')).map((f) => path.join(dir, f));
const load = () => loadAll(files);

// number parsing
for (const [inp, exp] of [['11.300,00', 11300], ['11300', 11300], ['11 300 ден.', 11300], ['6.000', 6000], ['1,234.50', 1234.5], ['', 0]]) assert.strictEqual(num(inp), exp, inp);
// places
assert.strictEqual(placeOf('УЛ. ЛИПОВА БР.9 ШУТО ОРИЗАРИ'), 'ШУТО ОРИЗАРИ');
assert.strictEqual(placeOf('УЛ. ДЕМО 5 ЦЕНТАР СКОПЈЕ.'), 'ЦЕНТАР');
assert.strictEqual(placeOf('УЛ. ЈАВОРОВА БР.13 КИСЕЛА ВОДА (НОВА)'), 'КИСЕЛА ВОДА');
assert.strictEqual(placeOf('УЛ. 3 БР.ББ'), 'Непознато');
// file names
assert.strictEqual(safeFileName('ДРУШТВО Д.О.О.'), 'ДРУШТВО Д.О.О');
assert.strictEqual(safeFileName('CON'), '_CON');

// file names: an unknown field is refused, and no two documents of one run may share a name
// (regression: the pattern "NPN_{2}" gave every document the same name and each one overwrote the last)
{
  const { patternProblem, uniqueFileName } = require('../src/core/docx');
  assert.ok(/\{2\}/.test(patternProblem('NPN_{2}') || ''), 'an unknown field in the file-name pattern is refused');
  assert.strictEqual(patternProblem('NPN_{BROJ}_{IME}'), null);
  assert.strictEqual(patternProblem(''), null, 'empty = the default pattern');
  const taken = new Set();
  assert.deepStrictEqual(['A.docx', 'A.docx', 'a.docx', 'A.docx'].map((n) => uniqueFileName(n, taken)),
    ['A.docx', 'A (2).docx', 'a (3).docx', 'A (4).docx'], 'names stay unique, case-insensitively (Windows)');
}

// key column (клучна колона): the columns both tables share, and joining on the one the user picks
{
  const { loadFiles } = require('../src/core/excel');
  const inputs = files.map((f) => ({ name: f, data: fs.readFileSync(f) }));
  const items = (r) => r.cases.reduce((s, c) => s + c.items.length, 0);
  const auto = loadFiles(inputs);
  if (dir.endsWith('samples')) {
    // "Година" is in both tables but would match every invoice to every case of that year, so it is not offered
    assert.deepStrictEqual(auto.keyOptions.map((o) => o.label), ['Тужба број', 'Шифра коминтент'], 'columns present in both tables that identify a case');
    const bySifra = loadFiles(inputs, { key: 'field:sifra' });
    assert.ok(bySifra.cases.some((c) => c.items.length > auto.cases.find((a) => a.id === c.id).items.length), 'a shared customer code pulls in more invoices');
  }
  assert.strictEqual(auto.key, 'auto');
  assert.strictEqual(items(loadFiles(inputs, { key: 'field:broj' })), items(auto), 'joining on Тужба број alone finds the same invoices here');
  const bad = loadFiles(inputs, { key: 'col:no such column' });
  assert.strictEqual(bad.key, 'auto', 'an unknown key falls back to automatic');
  assert.strictEqual(items(bad), items(auto));
  // one table is the whole source: no "no invoices" error, nothing to choose
  const listOnly = inputs.filter((i) => loadFiles([i]).files[0].kind === 'list');
  const one = loadFiles(listOnly);
  assert.ok(one.cases.length > 0 && one.cases.every((c) => !c.warnings.some((w) => /Нема ставки/.test(w.text))), 'one table: no "Нема ставки" error');
  assert.deepStrictEqual(one.keyOptions, [], 'one table: no key column to choose');
}
// file and template names shown in the UI are base names on every OS (regression: Windows paths were shown whole)
{
  const { loadFiles } = require('../src/core/excel');
  const xls = fs.readFileSync(files[0]);
  for (const p of ['C:\\Users\\someone\\Data\\list.xls', '/home/someone/data/list.xls', 'list.xls']) {
    assert.strictEqual(loadFiles([{ name: p, data: xls }]).files[0].name, 'list.xls', `Excel name from ${p}`);
  }
}

// overrides
const res = load();
const cases = new Map(res.cases.map((c) => [c.id, c]));
const ov = new Map();
const first = res.cases.find((c) => c.items.length && Math.abs(c.zbirStavki - c.vkupenDolg) < 0.005);
const id = first.id;
const original = { dolg: first.vkupenDolg, adresa: first.adresa };
for (const [inp, exp] of [['11.300,00', 11300], ['11300', 11300], [11300.5, 11300.5]]) {
  applyOverride(cases, ov, id, { vkupenDolg: inp });
  assert.strictEqual(cases.get(id).vkupenDolg, exp, String(inp));
}
applyOverride(cases, ov, id, { vkupenDolg: '11.300,00', adresa: 'НОВА АДРЕСА' });
assert.ok(cases.get(id).warnings.some((w) => /Збирот/.test(w.text)), 'sum mismatch warning after edit');
assert.deepStrictEqual(Object.keys(ov.get(id)).sort(), ['adresa', 'vkupenDolg']);
applyOverride(cases, ov, id, null);
assert.strictEqual(cases.get(id).vkupenDolg, original.dolg);
assert.strictEqual(cases.get(id).adresa, original.adresa);
assert.ok(!ov.has(id));
const fresh = new Map(load().cases.map((c) => [c.id, c]));
assert.strictEqual(applyOverrides(fresh, new Map(), { [id]: { ime: 'X' } }), 1);

// template choice
const has = { standard: true, embg: true };
assert.strictEqual(templateKind(res.cases.find((c) => c.edb), 'auto', has), 'standard', 'company ЕДБ never gets the ЕМБГ template');
const fiz = res.cases.find((c) => c.embg && !c.edb && c.tip === 'fizicko');
assert.strictEqual(templateKind(fiz, 'auto', has), 'embg');
assert.strictEqual(templateKind(fiz, 'auto', { standard: true, embg: false }), 'standard');
assert.strictEqual(templateKind(fiz, 'standard', has), 'standard');

// the samples contain one of each planted problem – the analysis must find them
const w = (re) => res.cases.filter((c) => c.warnings.some((x) => re.test(x.text))).length;
if (dir.endsWith('samples')) {
  assert.strictEqual(w(/Нема ставки/), 1, 'case without invoices');
  assert.strictEqual(w(/Збирот на фактурите/), 2, 'sum mismatches');
  assert.strictEqual(w(/Контролната цифра/), 1, 'wrong ЕМБГ check digit');
  assert.strictEqual(w(/Иста шифра/), 2, 'duplicate customer code');
  assert.ok(res.cases.filter((c) => c.edb).length >= 5, 'tax numbers in the ЕМБГ column');
  assert.ok(res.cases.every((c) => !c.embg || c.edb || c.embg.slice(7, 9) === '99'), 'sample ЕМБГ all use the unused region 99');
}

(async () => {
  const { Template } = require('../src/core/docx');
  const docx = fs.readFileSync(path.join(path.join(__dirname, '..', 'samples'), 'template.docx'));
  for (const p of ['C:\\Users\\someone\\Templates\\t.docx', '/home/someone/t.docx', 't.docx']) {
    assert.strictEqual((await Template.fromData(docx, p)).name, 't.docx', `template name from ${p}`);
  }
  console.log('CORE TESTS OK');
})().catch((e) => { console.error(e); process.exit(1); });
