'use strict';
// Generates the FICTIONAL sample data used by the tests, the demo and anyone trying the app:
//   samples/Листа на тужби (пример).xls    samples/Ставки по тужби (пример).xls
//   samples/template.docx                  samples/template_NPN_EMBG.docx
// Every person, company, address, ID number, invoice and amount here is invented (seeded PRNG, so the output is
// stable). ЕМБГ numbers use region code 99, which no real ЕМБГ uses; IDs and invoice numbers start with 99.
//   node samples/generate.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const out = __dirname;

// ---------- deterministic randomness ----------
let seed = 20261107;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---------- invented names and places ----------
// surnames in their masculine form; feminine forms are derived (…СКИ → …СКА, …ОВ/…ЕВ → …ОВА/…ЕВА), others are unchanged
const SURNAMES = ['ПЕТРЕСКИ', 'ЈАНЕВСКИ', 'ТРАЈКОВСКИ', 'ДИМОВСКИ', 'ИЛИЕВСКИ', 'СТОЈАНОВСКИ', 'НИКОЛОВ', 'АНГЕЛОВСКИ', 'ВЕЛКОВСКИ', 'МИТРЕВСКИ',
  'КРСТЕВ', 'ЗДРАВКОВСКИ', 'ЛАЗАРЕВСКИ', 'ГЕОРГИЕВСКИ', 'СПАСЕСКИ', 'БОШКОВСКИ', 'РИСТЕСКИ', 'ПОПОВСКИ', 'ЈОВАНОВСКИ', 'ТОДОРОВ',
  'КАМБЕРИ', 'ИСЉАМИ', 'РАМАДАНИ', 'ДЕМИРИ', 'ОСМАНИ', 'ЈАКУПИ', 'САЛИУ', 'АЛИМИ', 'БЕКИРИ'];
const MALE = ['МАРКО', 'ИВАН', 'НИКОЛА', 'ДАРКО', 'ГОРАН', 'ДЕЈАН', 'ЗОРАН', 'ТОНИ', 'ФАТМИР', 'ВЕБИ', 'ЛУАН', 'ПЕТАР', 'ЉУПЧО', 'АРТАН'];
const FEMALE = ['АНА', 'ЕЛЕНА', 'МАРИЈА', 'СНЕЖАНА', 'ВЕСНА', 'КАТЕРИНА', 'БИЛЈАНА', 'ЛИДИЈА', 'ЕРМИРА', 'АРБЕНА', 'ДРИТА', 'ИРЕНА', 'ЈАСМИНА'];
const feminine = (s) => (s.endsWith('СКИ') ? `${s.slice(0, -1)}А` : /(ОВ|ЕВ)$/.test(s) ? `${s}А` : s);
const personName = () => (rnd() < 0.5 ? `${pick(SURNAMES)} ${pick(MALE)}` : `${feminine(pick(SURNAMES))} ${pick(FEMALE)}`);
const STREETS = ['УЛ. ЈАВОРОВА', 'УЛ. ЛИПОВА', 'УЛ. БРЕСТОВА', 'УЛ. КЕСТЕНОВА', 'УЛ. ВИШНОВА', 'УЛ. БАГРЕМОВА', 'УЛ. ЈАСИКОВА', 'УЛ. ДАБОВА',
  'УЛ. ОРЕВОВА', 'УЛ. ЈАБОЛКОВА', 'БУЛ. ДЕМО', 'УЛ. ТРЕНДАФИЛОВА', 'УЛ. ЛАВАНДИНА', 'УЛ. ЗУМБУЛОВА'];
// real municipality / settlement names are public geography; streets, numbers and people are invented
const PLACES = [['ЦЕНТАР', 9], ['АЕРОДРОМ', 8], ['КАРПОШ', 7], ['ЧАИР', 7], ['КИСЕЛА ВОДА', 6], ['ГАЗИ БАБА', 6], ['БУТЕЛ', 5], ['ЃОРЧЕ ПЕТРОВ', 4],
  ['ШУТО ОРИЗАРИ', 3], ['САРАЈ', 2], ['СТУДЕНИЧАНИ', 2], ['ДОЛНО ЛИСИЧЕ', 1], ['ВИЗБЕГОВО', 1]];
const placePool = PLACES.flatMap(([p, w]) => Array(w).fill(p));
const COMPANIES = ['ЛИПА ТРЕЈД ДООЕЛ', 'ВИДРА КОНСАЛТИНГ ДОО', 'БРЕЗА ГРАДБА ДООЕЛ Скопје', 'ЈАВОР ИНЖЕНЕРИНГ ДОО', 'СОКОЛ МАРКЕТ ДООЕЛ',
  'Заедница на сопственици на зграда на ул. Јаворова бр. 7', 'ДЕМО ПРОДУКТ ДОО експорт-импорт', 'ПЧЕЛАРСКА ЗАДРУГА ПРИМЕР', 'ОРЕВ ХОЛДИНГ АД', 'КЛЕН ТРАНС ДООЕЛ'];

// ЕМБГ with region 99 (unused by real ЕМБГ) and a correct check digit
function fakeEmbg(validCheck = true) {
  const y = int(1945, 2000), m = int(1, 12), d = int(1, 28);
  const base = `${String(d).padStart(2, '0')}${String(m).padStart(2, '0')}${String(y).slice(1)}99${String(int(0, 999)).padStart(3, '0')}`;
  const w = [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let k = 11 - (w.reduce((s, x, i) => s + x * Number(base[i]), 0) % 11);
  if (k > 9) k = 0;
  return base + (validCheck ? k : (k + 3) % 10);
}
const fakeEdb = () => `4999${String(int(0, 999999999)).padStart(9, '0')}`; // tax-number-like: starts with 4, no valid birth date

// ---------- cases ----------
const N = 240;
const FIRST = 90001;
const cases = [];
const invoices = [];
const excelSerial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5);
let invoiceNo = 99016000000000;

for (let i = 0; i < N; i++) {
  const broj = FIRST + i;
  const company = i % 19 === 7;
  const ime = company ? COMPANIES[(i / 19 | 0) % COMPANIES.length] : personName();
  const adresa = `${pick(STREETS)} БР.${rnd() < 0.15 ? 'ББ' : int(1, 140)} ${pick(placePool)}`;
  let embg = '';
  if (company) embg = rnd() < 0.8 ? fakeEdb() : '';
  else if (i === 41 || rnd() < 0.62) embg = fakeEmbg(i !== 41); // case 90042 gets a wrong check digit on purpose
  const sifra = String(9000000 + int(1000, 899999));
  // monthly invoices for 2–9 months, Sept 2025 onwards
  const months = company ? int(4, 9) : int(3, 9);
  const monthly = company ? int(1400, 9000) : int(1150, 3400);
  const its = [];
  for (let k = 0; k < months; k++) {
    const y = 2025 + Math.floor((8 + k) / 12), m = ((8 + k) % 12) + 1;
    const amount = Math.round(monthly * (0.85 + rnd() * 0.3));
    its.push({ y, m, ddo: excelSerial(y, m, int(25, 28)), valuta: excelSerial(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 20), faktura: String(invoiceNo++), iznos: amount });
  }
  let total = its.reduce((s, x) => s + x.iznos, 0);
  if (i === 12 || i === 133) total += 1; // invoices sum 1 ден. short of the total (a rounding difference to detect)
  const band = total < 10000 ? 0 : total < 20000 ? 1 : total < 50000 ? 2 : 3;
  cases.push({
    serija: 9901, broj, godina: 2026, sifra, ime, adresa,
    vkupenDolg: total, tekovna: rnd() < 0.08 ? 295 : 0,
    notarNagrada: [500, 600, 1100, 1600][band], notarTrosok: 250, materijal: 50, advokat: [1500, 3000, 3000, 4500][band],
    embg,
  });
  if (i !== 200) for (const it of its) invoices.push({ broj, sifra, ...it, total }); // case 90201 has no invoices
}
cases[60].sifra = cases[59].sifra; // a duplicate customer code to detect
for (const x of invoices) if (x.broj === cases[60].broj) x.sifra = cases[60].sifra;
// a few debts below the 6 000 ден. threshold
for (const i of [5, 77, 150]) {
  const c = cases[i];
  const keep = invoices.filter((x) => x.broj === c.broj).slice(0, 2);
  for (let k = invoices.length - 1; k >= 0; k--) if (invoices[k].broj === c.broj && !keep.includes(invoices[k])) invoices.splice(k, 1);
  c.vkupenDolg = keep.reduce((s, x) => s + x.iznos, 0);
  for (const x of keep) x.total = c.vkupenDolg;
}
for (const x of invoices) x.total = cases.find((c) => c.broj === x.broj).vkupenDolg;

// ---------- Excel (.xls, BIFF8 – the same format as the real exports) ----------
const listHeader = ['Серија', 'Тужба број', 'Година', 'Шифра коминтент', 'Назив', 'Адреса', 'Вкупен долг', 'Тековна Состојба', 'Нотарска награда', 'Нотарски трошок', 'Материјален трошок', 'Адвокатски трошок', 'ЕМБГ'];
const listRows = cases.map((c) => [c.serija, c.broj, c.godina, c.sifra, c.ime, c.adresa, c.vkupenDolg, c.tekovna, c.notarNagrada, c.notarTrosok, c.materijal, c.advokat, c.embg]);
const itemHeader = ['Тужба број', 'Година на тужење', 'Шифра на коминтент', 'Година на документ', 'Месец на документ', 'Документ датум ДДО', 'Документ датум ВАЛУТА', 'Фактура број', 'Долг по документ', 'Вкупен долг по тужба'];
const itemRows = invoices.map((x) => [x.broj, 2026, x.sifra, x.y, x.m, x.ddo, x.valuta, x.faktura, x.iznos, x.total]);
itemRows.push(['', '', '', '', '', '', '', '', '', invoices.reduce((s, x) => s + x.iznos, 0)]); // the exports end with a grand-total row

const writeXls = (file, header, rows, sheet) => {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  fs.writeFileSync(path.join(out, file), XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }));
};
writeXls('Листа на тужби (пример).xls', listHeader, listRows, 'Листа на тужби');
writeXls('Ставки по тужби (пример).xls', itemHeader, itemRows, 'Ставки по тужби');

// ---------- Word templates (original fictional wording) ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (t, { b = false, sz = 20 } = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${b ? '<w:b/>' : ''}${sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (runs, { jc = 'both', after = 120 } = {}) => `<w:p><w:pPr><w:spacing w:after="${after}" w:line="260" w:lineRule="auto"/><w:jc w:val="${jc}"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="20"/></w:rPr></w:pPr>${runs.join('')}</w:p>`;
const B = (t) => run(t, { b: true });
const T = (t) => run(t);

function templateXml(withEmbg) {
  const debtor = withEmbg ? [B('Должник: '), T('{{IME}}, ЕМБГ {{EMBG}}, {{ADRESA}}')] : [B('Должник: '), T('{{IME}}, {{ADRESA}}')];
  const body = [
    para([B('ДО НОТАР: ______________________________')], { jc: 'right' }),
    para([T('Бр. {{BROJ_DOKUMENT}}/2026')], { jc: 'left' }),
    para([T('Скопје, ____________')], { jc: 'left' }),
    para([B('Доверител: '), T('ЈП Бистра Вода – Демо, ул. Пример бр. 1, Скопје, ЕМБС 0000000, ЕДБ 4000000000000, сметка 000000000000000, '
      + 'е-пошта info@example.com, преку полномошник адвокат Марко Примеровски, ул. Демо бр. 2, Скопје, тел. 070/000-000, kancelarija@example.com.')]),
    para(debtor),
    para([T('Шифра на корисник: {{SIFRA}}')], { after: 0 }),
    para([T('Основ: '), B('неплатени сметки')], { after: 0 }),
    para([T('Вредност: '), B('{{VKUPEN_DOLG}} денари')]),
    para([B('ПРЕДЛОГ ЗА ИЗДАВАЊЕ НА НОТАРСКИ ПЛАТЕН НАЛОГ')], { jc: 'center' }),
    para([T('Должникот не ги платил сметките наведени подолу, во вкупен износ од '), B('{{VKUPEN_DOLG}} денари'), T('. Доказ: извод од книгата на корисници.')]),
    para([T('Доверителот предлага нотарот да издаде платен налог со кој должникот {{IME}}, {{ADRESA}}, се задолжува во рок од 8 дена да плати:')]),
    para([T('А) главен долг од '), B('{{VKUPEN_DOLG}}'), T(' денари;')]),
    para([T('Б) законска казнена камата за секоја сметка, од денот на доспевањето до исплатата, и тоа:')]),
    // the list run deliberately has no font size, the engine aligns it with the paragraph (tested)
    para([run(' ', {}), run('{{FAKTURI_TABELA}}', { sz: 0 })]),
    para([T('В) трошоци на постапката од {{VKUPNO_TROSHOCI}} денари: адвокатска награда {{ADVOKAT}}, нотарски трошок {{NOTAR_TROSOK}}, '
      + 'нотарска награда {{NOTAR_NAGRADA}}, материјални трошоци {{MATERIJAL}} денари.')]),
    para([B('ТРОШКОВНИК')], { jc: 'center' }),
    para([T('1. Адвокатска награда ........ {{ADVOKAT}} денари')], { after: 0 }),
    para([T('2. Нотарски трошок ........ {{NOTAR_TROSOK}} денари')], { after: 0 }),
    para([T('3. Нотарска награда ........ {{NOTAR_NAGRADA}} денари')], { after: 0 }),
    // the standard template keeps a hard-coded ",00" after this amount (like real templates do) – the engine must not double it
    para(withEmbg ? [T('4. Тековна состојба ........ {{TEKOVNA_SOSTOJBA}} денари')] : [T('4. Тековна состојба ........ '), T('{{TEKOVNA_SOSTOJBA}}'), T(',00 денари')], { after: 0 }),
    para([T('5. Материјални трошоци ........ {{MATERIJAL}} денари')], { after: 0 }),
    para([B('ВКУПНО: {{VKUPNO_TROSHOCI}} денари')]),
    para([B('За доверителот, полномошник')], { jc: 'right' }),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

async function writeDocx(file, xml) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', xml);
  // fixed timestamps so the generated files are byte-stable
  for (const f of Object.values(zip.files)) f.date = new Date(Date.UTC(2026, 0, 1));
  fs.writeFileSync(path.join(out, file), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

(async () => {
  await writeDocx('template.docx', templateXml(false));
  await writeDocx('template_NPN_EMBG.docx', templateXml(true));
  console.log(`samples: ${cases.length} cases (${cases.filter((c) => /ДОО|АД|ЗАДРУГА|Заедница/i.test(c.ime)).length} companies), ${invoices.length} invoices, 2 templates`);
})();
