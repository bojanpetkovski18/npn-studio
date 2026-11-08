'use strict';

/**
 * Enrichment of joined cases: legal/physical person detection, ЕМБГ checksum + birth date,
 * place (населба/општина) extraction and duplicate-debtor detection.
 */

// Legal-form markers (matched as whole words, Cyrillic-safe)
const LEGAL_MARKERS = [
  'ДООЕЛ', 'ДОО', 'Д\\.О\\.О\\.?', 'Д\\.О\\.О\\.Е\\.Л\\.?', 'АД', 'А\\.Д\\.?', 'ДПТУ', 'ДТПУ', 'ДППУ', 'ДТУ', 'ПТУ', 'ТП', 'ТД', 'ЈТД', 'КД', 'ЛТД',
  'ЈП', 'ЈЗУ', 'ЈУ', 'ПЗУ', 'ООУ', 'ОУ', 'СОУ', 'СУГС', 'ДУФ', 'ЗК', 'ДЗС', 'ЗЗ', 'ПЗ',
  'ЗАДРУГА', 'ЗАЕДНИЦА', 'ЗДРУЖЕНИЕ', 'ФОНДАЦИЈА', 'СОЈУЗ', 'КЛУБ', 'ЦРКВА', 'ЏАМИЈА', 'МАНАСТИР', 'ОПШТИНА',
  'МИНИСТЕРСТВО', 'АГЕНЦИЈА', 'ДИРЕКЦИЈА', 'УПРАВА', 'ФОНД', 'БАНКА', 'КОМПАНИЈА', 'ДРУШТВО', 'ТРГОВЕЦ', 'ПОЕДИНЕЦ',
  'ДРЖАВЕН', 'ДРЖАВНА', 'УНИВЕРЗИТЕТ', 'ФАКУЛТЕТ', 'ГРАДИНКА', 'УЧИЛИШТЕ', 'БОЛНИЦА', 'АМБУЛАНТА', 'АПТЕКА',
  'ХОЛДИНГ', 'ГРУП', 'ИМПЕКС', 'КОМЕРЦ', 'ТРЕЈД', 'ТРАДЕ', 'ИНЖЕНЕРИНГ', 'КОНСАЛТИНГ', 'ГРАДБА', 'ГРАДЕЖНИШТВО', 'ИНВЕСТ', 'МАРКЕТ',
  'DOOEL', 'DOO', 'LTD', 'LLC', 'GMBH', 'INC',
];
const LEGAL_RE = new RegExp(`(^|[\\s.,"„“'()\\-/])(${LEGAL_MARKERS.join('|')})(?=$|[\\s.,"“'()\\-/])`, 'i');
const LEGAL_LONG_RE = /станбена зграда|сопственици|друштво за|трговско|јавно претпријатие|основно училиште|средно училиште|со ограничена одговорност/i;

/** A 13-digit number that is not a valid birth-date ЕМБГ but looks like an ЕДБ (tax no., starts with 4). */
function looksLikeEdb(id) {
  if (!/^\d{13}$/.test(id || '')) return false;
  return id[0] === '4' && !embgInfo(id).birth;
}

function personType(c) {
  const name = String(c.ime || '').toUpperCase();
  if (LEGAL_RE.test(name) || LEGAL_LONG_RE.test(c.ime || '')) return 'pravno';
  if (looksLikeEdb(c.embg)) return 'pravno';
  if (c.embg && /^\d{13}$/.test(c.embg)) return 'fizicko';
  // Long names (> 4 words) are almost never a natural person, unless it's "X И Y"
  if (name.split(/\s+/).filter(Boolean).length > 4 && !/\sИ\s/.test(name)) return 'pravno';
  return 'fizicko';
}

/** Macedonian ЕМБГ (ЈМБГ) checksum + decoded birth date / sex. */
function embgInfo(embg) {
  if (!embg) return null;
  if (!/^\d{13}$/.test(embg)) return { valid: false, reason: 'ЕМБГ мора да има точно 13 цифри' };
  const d = embg.split('').map(Number);
  const w = [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let m = 11 - (w.reduce((s, x, i) => s + x * d[i], 0) % 11);
  if (m > 9) m = 0;
  const day = d[0] * 10 + d[1];
  const month = d[2] * 10 + d[3];
  const y3 = d[4] * 100 + d[5] * 10 + d[6];
  const year = y3 >= 800 ? 1000 + y3 : 2000 + y3;
  const dt = new Date(Date.UTC(year, month - 1, day));
  const dateOk = dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  const region = d[7] * 10 + d[8];
  const sex = (d[9] * 100 + d[10] * 10 + d[11]) < 500 ? 'М' : 'Ж';
  const age = dateOk ? Math.floor((Date.now() - dt.getTime()) / (365.2425 * 864e5)) : null;
  const res = { valid: m === d[12] && dateOk, birth: dateOk ? `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}` : null, sex, region, age };
  if (!dateOk) res.reason = 'ЕМБГ содржи невалиден датум на раѓање';
  else if (m !== d[12]) res.reason = 'Контролната цифра на ЕМБГ не е точна';
  else if (age < 18) res.reason = `Должникот според ЕМБГ е малолетен (${age} год.)`;
  else if (age > 105) res.reason = `Невообичаена возраст според ЕМБГ (${age} год.)`;
  return res;
}

/** "УЛ. ЛИПОВА БР.ББ БУТЕЛ" -> "БУТЕЛ" ; "УЛ.4 БР.14 ВИЗБЕГОВО" -> "ВИЗБЕГОВО" */
// Multi-word municipalities / settlements around Skopje (checked first, as whole trailing words)
const MULTI_PLACES = ['КИСЕЛА ВОДА', 'ГАЗИ БАБА', 'ШУТО ОРИЗАРИ', 'ЃОРЧЕ ПЕТРОВ', 'ЧУЧЕР САНДЕВО', 'ЧУЧЕР-САНДЕВО', 'ДОЛНО ЛИСИЧЕ', 'ГОРНО ЛИСИЧЕ', 'НОВО ЛИСИЧЕ', 'СТАРО ЛИСИЧЕ', 'ДОЛНО НЕРЕЗИ', 'ГОРНО НЕРЕЗИ'];

function placeOf(adresa) {
  let a = String(adresa || '').toUpperCase().replace(/[\s ]+/g, ' ').trim();
  if (!a) return '';
  a = a.replace(/\s*\([^)]*\)\s*$/, ''); // trailing note in parentheses: "… ШУТО ОРИЗАРИ (НОВА)"
  // trailing city name / punctuation is not the place: "… ЦЕНТАР СКОПЈЕ." -> "… ЦЕНТАР"
  a = a.replace(/[\s,.;-]*(ГР\.?\s*)?СКОПЈЕ[\s,.;]*$/, '').replace(/[\s,.;-]+$/, '');
  const multi = MULTI_PLACES.find((p) => a === p || a.endsWith(` ${p}`) || a.endsWith(`.${p}`));
  if (multi) return multi.replace('-', ' ');
  const words = a.split(/[ ]+/);
  let place = words[words.length - 1] || '';
  const prev = words[words.length - 2] || '';
  if (/^(ГОРНО|ДОЛНО|ГОРНИ|ДОЛНИ|НОВО|СТАРО|МАЛО|ГОЛЕМО|НОВ|СТАР)$/.test(prev)) place = `${prev} ${place}`;
  place = place.replace(/^[^А-ЯЃЌЅЈЉЊЏA-Z]+/, '').replace(/[.,;)]+$/, '').trim();
  // house numbers, "ББ", "КАТ 3", "ВЛ.1" etc. are not places
  if (!place || place.length < 3 || /\d/.test(place) || /^(ББ|БР|КАТ|ВЛ|СТАН|ЛОК|ПРИЗ)(\.|$)/.test(place)) return 'Непознато';
  return place;
}

/** Adds derived info + extra warnings to every case (mutates & returns). */
function enrich(cases) {
  const bySifra = new Map();
  const byEmbg = new Map();
  for (const c of cases) {
    if (c.sifra) bySifra.set(c.sifra, (bySifra.get(c.sifra) || 0) + 1);
    if (c.embg) byEmbg.set(c.embg, (byEmbg.get(c.embg) || 0) + 1);
  }
  for (const c of cases) {
    c.tip = personType(c);
    c.mesto = placeOf(c.adresa);
    c.edb = looksLikeEdb(c.embg);
    c.embgInfo = c.edb ? null : embgInfo(c.embg);
    c.warnings = c.warnings.filter((w) => !w.derived);
    if (c.edb) c.warnings.push({ level: 'info', text: 'Во колоната ЕМБГ има ЕДБ (даночен број на правно лице). Паметниот режим користи стандарден шаблон за да не пишува „ЕМБГ“ пред даночен број.', derived: true });
    else if (c.embgInfo && c.embgInfo.reason) {
      const soft = /Контролната/.test(c.embgInfo.reason);
      c.warnings.push({ level: soft ? 'info' : 'warn', text: c.embgInfo.reason + (soft ? ' (постојат стари ЕМБГ без важечка контролна цифра)' : ''), derived: true });
    }
    if (c.sifra && bySifra.get(c.sifra) > 1) c.warnings.push({ level: 'warn', text: `Иста шифра на корисник се појавува во ${bySifra.get(c.sifra)} тужби`, derived: true });
    if (c.embg && byEmbg.get(c.embg) > 1) c.warnings.push({ level: 'info', text: `Истиот ЕМБГ има ${byEmbg.get(c.embg)} тужби`, derived: true });
  }
  return cases;
}

module.exports = { enrich, personType, embgInfo, placeOf, looksLikeEdb };
