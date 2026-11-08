'use strict';

/** 11284 -> "11.284,00" (Macedonian number format) */
function money(value) {
  const n = Number(value) || 0;
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + grouped + ',' + dec;
}

/** 11284 -> "11.284" (no decimals; used where the template already has ",00") */
function moneyInt(value) {
  return money(value).replace(/,\d\d$/, '');
}

const pad = (n) => String(n).padStart(2, '0');

/** Excel serial / Date / string -> "dd.MM.yyyy" */
function date(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !isNaN(value)) {
    return `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.${value.getFullYear()}`;
  }
  if (typeof value === 'number' && isFinite(value)) {
    // Excel 1900 date system (with the Lotus leap-year bug) -> epoch 1899-12-30
    const ms = Math.round((value - 25569) * 86400000);
    const d = new Date(ms);
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${pad(m[3])}.${pad(m[2])}.${m[1]}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${pad(m[1])}.${pad(m[2])}.${m[3]}`;
  return s;
}

/** Excel serial / Date / string -> sortable number */
function dateKey(value) {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime() / 86400000 + 25569;
  const m = String(value || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000 + 25569;
  return 0;
}

/** Cell -> clean text; numbers that are identifiers keep all digits */
function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function num(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined || value === '') return 0;
  let s = String(value).trim().replace(/[\s ]/g, '').replace(/(ден\.?|мкд|mkd)$/i, '');
  // "1.234,56" -> "1234.56" ; "1.234" (Macedonian thousands) -> "1234" ; "1,234.56" -> "1234.56"
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else s = s.replace(/,(?=\d{3}(\D|$))/g, '');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

module.exports = { money, moneyInt, date, dateKey, text, num };
