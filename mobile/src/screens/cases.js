// Screen 2 – Тужби: search, filter chips, windowed card list with selection.
import { $, esc, ICON, nf, money, markText, reEsc, debounce, haptic, hydrateIcons } from '../ui.js';
import { S, on, emit, kindFor, saveSession } from '../state.js';
import { registerScreen, go, App } from '../router.js';
import { openSheet } from './sheet.js';

const ROW = 96; // card 88 px + 8 px gap
const FILTERS = {
  all: { label: 'Сите', fn: () => true },
  sel: { label: 'Избрани', fn: (c) => S.selected.has(c.id) },
  fiz: { label: 'Физички', fn: (c) => c.tip === 'fizicko' },
  pravno: { label: 'Правни', fn: (c) => c.tip === 'pravno' },
  warn: { label: 'Предупредувања', fn: (c) => c.warnings.some((w) => w.level !== 'info') },
  todo: { label: 'Негенерирани', fn: (c) => !S.generated.has(c.id) },
  edited: { label: 'Изменети', fn: (c) => S.overrides.has(c.id) },
};
export const V = { filter: 'all', query: '', mesto: '', view: [] };

let hlRe = null;
function applyView() {
  const terms = V.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const f = FILTERS[V.filter].fn;
  V.view = S.cases.filter((c) => {
    if (V.mesto && c.mesto !== V.mesto) return false;
    if (!f(c)) return false;
    if (!terms.length) return true;
    if (!c._hay) c._hay = [c.broj, c.ime, c.adresa, c.sifra, c.embg, c.mesto, ...c.items.map((i) => i.faktura)].join(' ').toLowerCase();
    return terms.every((t) => c._hay.includes(t));
  }).sort((a, b) => Number(a.broj) - Number(b.broj));
  const hl = terms.filter((t) => t.length > 1);
  hlRe = hl.length ? new RegExp(hl.map(reEsc).join('|'), 'gi') : null;
}

function renderChips() {
  const counts = {};
  for (const k of Object.keys(FILTERS)) counts[k] = 0;
  for (const c of S.cases) for (const [k, f] of Object.entries(FILTERS)) if (f.fn(c)) counts[k]++;
  $('#chips').innerHTML = (V.mesto ? `<button class="chip on" data-mesto-clear>${esc(V.mesto)} ✕</button>` : '') + Object.entries(FILTERS).map(([k, f]) =>
    `<button class="chip ${V.filter === k ? 'on' : ''}" data-f="${k}">${f.label}${k !== 'all' ? `<span class="n">${nf(counts[k])}</span>` : ''}</button>`).join('');
}

function status(c) {
  if (S.generated.has(c.id)) return '<span class="pill done">Генериран</span>';
  if (c.warnings.some((w) => w.level === 'error')) return '<span class="pill err">Грешка</span>';
  if (c.warnings.some((w) => w.level === 'warn')) return '<span class="pill warn">Провери</span>';
  return '<span class="pill ok">Во ред</span>';
}
function card(c, i) {
  const on = S.selected.has(c.id);
  const hl = (t) => markText(t, hlRe);
  return `<div class="case ${on ? 'on' : ''}" style="top:${i * ROW}px" data-id="${esc(c.id)}" role="button" tabindex="0">
    <button class="sel" data-sel aria-label="${on ? 'Отстрани од избор' : 'Избери'}" aria-pressed="${on}"><span class="dot">${on ? ICON.check : ''}</span></button>
    <div class="main"><div class="top">№ ${hl(c.broj)}${c.tip === 'pravno' ? ' <span class="tag legal">ПРАВНО</span>' : ''}${S.overrides.has(c.id) ? ' <span class="tag edited">ИЗМЕНЕТО</span>' : ''}${kindFor(c) === 'embg' ? ' <span class="tag emb">ЕМБГ</span>' : ''}</div>
      <div class="nm">${hl(c.ime)}</div><div class="ad">${hl(c.mesto)} · ${hl(c.adresa)}</div></div>
    <div class="right"><span class="amt">${money(c.vkupenDolg)}</span>${status(c)}</div>
  </div>`;
}

let lastRange = '';
function renderRows(force) {
  const list = $('#vlist');
  $('#vpad').style.height = `${Math.max(0, V.view.length * ROW - 8)}px`;
  if (App.tab !== 'cases') return;
  const top = list.getBoundingClientRect().top + window.scrollY;
  const from = Math.max(0, Math.floor((window.scrollY - top) / ROW) - 4);
  const to = Math.min(V.view.length, Math.ceil((window.scrollY - top + window.innerHeight) / ROW) + 4);
  const key = `${from}:${to}`;
  if (!force && key === lastRange) return;
  lastRange = key;
  let html = '';
  for (let i = from; i < to; i++) html += card(V.view[i], i);
  $('#vrows').innerHTML = html;
}

function renderMeta() {
  const selInView = V.view.reduce((n, c) => n + (S.selected.has(c.id) ? 1 : 0), 0);
  $('#listMeta').textContent = S.cases.length ? `${nf(V.view.length)} прикажани · ${nf(S.selected.size)} избрани` : '';
  const all = V.view.length && selInView === V.view.length;
  $('#selectAllBtn').textContent = V.view.length ? (all ? 'Отстрани ги сите' : 'Избери ги сите') : '';
  $('#selectAllBtn').dataset.mode = all ? 'none' : 'all';
}

function renderEmpty() {
  const e = $('#casesEmpty');
  if (!S.cases.length) {
    e.hidden = false;
    e.innerHTML = `<div class="art">${ICON.list}</div><h3>Нема вчитани тужби</h3><p>Прво додадете ги Excel табелите во „Податоци“.</p><button class="btn primary" id="emptyToData">Оди на Податоци</button>`;
    $('#emptyToData').onclick = () => go('data');
  } else if (!V.view.length) {
    e.hidden = false;
    e.innerHTML = `<div class="art">${ICON.search}</div><h3>Нема резултати</h3><p>Обидете се со друг збор или филтер.</p><button class="btn soft" id="emptyClear">Исчисти ги филтрите</button>`;
    $('#emptyClear').onclick = () => { V.query = ''; V.filter = 'all'; V.mesto = ''; $('#search').value = ''; refresh(); };
  } else e.hidden = true;
}

export function refresh() {
  applyView();
  renderChips();
  renderMeta();
  renderEmpty();
  $('.sticky-tools').hidden = !S.cases.length;
  renderRows(true);
}
export function setPlace(mesto) { V.mesto = mesto; V.filter = 'all'; refresh(); }

function toggle(id) {
  if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
  haptic();
  saveSession();
  emit('selection');
}

// ---------- events ----------
$('#vrows').addEventListener('click', (e) => {
  const row = e.target.closest('.case');
  if (!row) return;
  if (e.target.closest('[data-sel]')) { toggle(row.dataset.id); return; }
  openSheet(row.dataset.id, V.view.map((c) => c.id));
});
$('#vrows').addEventListener('keydown', (e) => {
  const row = e.target.closest('.case');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSheet(row.dataset.id, V.view.map((c) => c.id)); }
});
$('#chips').addEventListener('click', (e) => {
  if (e.target.closest('[data-mesto-clear]')) { V.mesto = ''; refresh(); return; }
  const b = e.target.closest('[data-f]');
  if (!b) return;
  V.filter = b.dataset.f;
  window.scrollTo({ top: 0 });
  refresh();
});
const onSearch = debounce(() => { V.query = $('#search').value; window.scrollTo({ top: 0 }); refresh(); }, 120);
$('#search').addEventListener('input', () => { $('#searchClear').hidden = !$('#search').value; onSearch(); });
$('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); }); // hide the keyboard
$('#searchClear').onclick = () => { $('#search').value = ''; $('#searchClear').hidden = true; V.query = ''; refresh(); };
$('#selectAllBtn').onclick = () => {
  const add = $('#selectAllBtn').dataset.mode === 'all';
  for (const c of V.view) { if (add) S.selected.add(c.id); else S.selected.delete(c.id); }
  haptic(12);
  saveSession();
  emit('selection');
};
window.addEventListener('scroll', () => requestAnimationFrame(() => renderRows(false)), { passive: true });
window.addEventListener('resize', debounce(() => renderRows(true), 80));

on('data', refresh);
on('cases', refresh);
on('selection', () => { if (V.filter === 'sel') refresh(); else { renderChips(); renderMeta(); renderRows(true); } });
on('generated', refresh);
on('mode', () => renderRows(true));
registerScreen('cases', { show: () => { lastRange = ''; refresh(); } });
hydrateIcons();
