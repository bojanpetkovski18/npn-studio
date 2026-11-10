'use strict';
// Pure case logic (join, totals, validation, manual overrides, template choice). No spreadsheet library here,
// so the mobile UI thread can use it without loading SheetJS.
const { dateKey, num } = require('./format');
const { enrich } = require('./analyze');

/**
 * Joins list rows with their invoice items and computes totals + validation warnings.
 * Items are matched on "Тужба број" (+ "Година" when both files have it), or, with `byKey`, on the `_key` value
 * of the key column the user chose. `itemsExpected: false` (only one table loaded) means the list alone is the
 * source, so a case without invoices is not an error.
 */
function join(listRows, itemRows, { byKey = false, itemsExpected = true } = {}) {
  // exact (број+година) index, plus a per-number index used only when one side has no year
  const exact = new Map();
  const byNum = new Map();
  for (const it of itemRows) {
    const k = `${it.broj}|${it.godina || ''}`;
    if (!exact.has(k)) exact.set(k, []);
    exact.get(k).push(it);
    if (!byNum.has(it.broj)) byNum.set(it.broj, []);
    byNum.get(it.broj).push(it);
  }
  const byKeyIndex = new Map();
  if (byKey) {
    for (const it of itemRows) {
      if (!it._key) continue;
      if (!byKeyIndex.has(it._key)) byKeyIndex.set(it._key, []);
      byKeyIndex.get(it._key).push(it);
    }
  }
  const itemsFor = (row) => {
    if (byKey) return row._key ? byKeyIndex.get(row._key) || [] : [];
    const hit = exact.get(`${row.broj}|${row.godina || ''}`);
    if (hit) return hit;
    const all = byNum.get(row.broj) || [];
    // never borrow invoices from a different year's тужба with the same number
    return row.godina ? all.filter((it) => !it.godina) : all;
  };

  // Overlapping lists (e.g. a filtered list loaded together with the full one) -> keep the first occurrence only
  const seen = new Set();
  const unique = listRows.filter((r) => {
    const k = `${r.broj}|${r.godina}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return unique.map((row) => {
    let items = itemsFor(row);
    // de-duplicate (same invoice may appear if the same Ставки file was loaded twice)
    const uniq = new Map();
    for (const it of items) uniq.set(`${it.faktura}|${it.iznos}|${it.ddo}`, it);
    items = [...uniq.values()].sort((a, b) => dateKey(a.ddo) - dateKey(b.ddo));
    return recompute({ ...row, id: `${row.broj}|${row.godina}`, items, itemsExpected, warnings: [] });
  });
}

/** (Re)computes totals and the base validation warnings; keeps derived warnings from analyze.js. */
function recompute(c) {
  c.zbirStavki = c.items.reduce((s, it) => s + it.iznos, 0);
  c.vkupnoTroshoci = c.advokat + c.notarTrosok + c.notarNagrada + c.materijal + c.tekovna;
  const warnings = (c.warnings || []).filter((w) => w.derived);
  if (!c.items.length) { if (c.itemsExpected !== false) warnings.push({ level: 'error', text: 'Нема ставки (фактури) за оваа тужба' }); }
  else if (Math.abs(c.zbirStavki - c.vkupenDolg) > 0.005) {
    const diff = c.vkupenDolg - c.zbirStavki;
    warnings.push({ level: 'warn', text: `Збирот на фактурите (${c.zbirStavki.toFixed(2)}) се разликува од вкупниот долг за ${diff.toFixed(2)}` });
  }
  if (c.sifra && c.items.some((it) => it.sifra && it.sifra !== c.sifra)) {
    warnings.push({ level: 'warn', text: 'Шифрата на коминтент во ставките не се совпаѓа' });
  }
  if (!c.adresa) warnings.push({ level: 'warn', text: 'Недостасува адреса' });
  c.warnings = warnings;
  return c;
}


/** Fields a user may correct by hand (in the app only – the source Excel is never modified). */
const EDITABLE = ['ime', 'adresa', 'embg', 'sifra', 'vkupenDolg', 'advokat', 'notarTrosok', 'notarNagrada', 'materijal', 'tekovna'];

/**
 * Applies (patch object) or reverts (patch === null) a manual correction.
 * cases: Map<id, case>, overrides: Map<id, patch>. Re-validates the case; call enrich() on all cases afterwards.
 */
function applyOverride(cases, overrides, id, patch) {
  const c = cases.get(id);
  if (!c) return null;
  if (!c._orig) c._orig = Object.fromEntries(EDITABLE.map((k) => [k, c[k]]));
  if (patch === null) { Object.assign(c, c._orig); delete c._orig; overrides.delete(id); }
  else {
    const merged = { ...(overrides.get(id) || {}) };
    for (const k of EDITABLE) {
      if (!(k in patch)) continue;
      const raw = patch[k];
      const v = typeof c._orig[k] === 'number'
        ? num(raw) // shared parser: "11.300,00", "11300", "11 300 ден." …
        : String(raw).trim();
      c[k] = v;
      if (v === c._orig[k]) delete merged[k]; else merged[k] = v;
    }
    if (Object.keys(merged).length) overrides.set(id, merged);
    else { delete c._orig; overrides.delete(id); }
  }
  recompute(c);
  return c;
}

/** Applies a saved { id: patch } map after loading; returns how many were applied. */
function applyOverrides(cases, overrides, saved) {
  let n = 0;
  for (const [id, patch] of Object.entries(saved || {})) if (applyOverride(cases, overrides, id, patch)) n++;
  if (n) enrich([...cases.values()]);
  return n;
}

/**
 * Which template a case uses. mode: 'auto' | 'standard' | 'embg'; has: { standard: bool, embg: bool }.
 * Smart ('auto') mode uses the ЕМБГ template only for natural persons with a real ЕМБГ (never for a company's ЕДБ).
 */
function templateKind(c, mode, has) {
  if (mode === 'embg') return has.embg ? 'embg' : has.standard ? 'standard' : null;
  if (mode === 'standard') return has.standard ? 'standard' : has.embg ? 'embg' : null;
  const useEmbg = c.embg && !c.edb && c.tip === 'fizicko';
  return useEmbg && has.embg ? 'embg' : has.standard ? 'standard' : has.embg ? 'embg' : null;
}

/** One row of the Excel report / table export. */
function reportRow(c, overrides, extra = {}) {
  return {
    'Тужба бр.': Number(c.broj), 'Година': c.godina, 'Должник': c.ime, 'Тип': c.tip === 'pravno' ? 'Правно лице' : 'Физичко лице',
    'ЕМБГ/ЕДБ': c.embg, 'Шифра': c.sifra, 'Адреса': c.adresa, 'Место': c.mesto, 'Вкупен долг': c.vkupenDolg, 'Фактури': c.items.length,
    'Трошоци': c.vkupnoTroshoci, 'Долг + трошоци': c.vkupenDolg + c.vkupnoTroshoci, ...extra,
    'Изменето рачно': overrides && overrides.has(c.id) ? Object.keys(overrides.get(c.id)).join(', ') : '',
    'Предупредувања': c.warnings.map((w) => w.text).join('; '),
  };
}

module.exports = { join, recompute, EDITABLE, applyOverride, applyOverrides, templateKind, reportRow };
