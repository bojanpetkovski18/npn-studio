// Case detail – bottom sheet with Документ / Фактури / Уреди / Проверки. Back button and swipe-down close it.
import { $, $$, esc, ICON, money, fdate, markText, reEsc, toast, haptic, parseNum } from '../ui.js';
import { S, on, emit, tplFor, kindFor, updateCase, saveSession } from '../state.js';
import { buildValues, previewParagraphs } from '../../../src/core/docx.js';

const EDIT = [
  ['ime', 'Назив / име и презиме', 'text'], ['adresa', 'Адреса', 'text'], ['embg', 'ЕМБГ / ЕДБ', 'tel'], ['sifra', 'Шифра на корисник', 'tel'],
  ['vkupenDolg', 'Вкупен долг', 'num'], ['advokat', 'Адвокатска награда', 'num'], ['notarNagrada', 'Нотарска награда', 'num'],
  ['notarTrosok', 'Нотарски трошок', 'num'], ['materijal', 'Материјален трошок', 'num'], ['tekovna', 'Тековна состојба', 'num'],
];
const SH = { id: null, order: [], tab: 'doc', open: false };

export function openSheet(id, order) {
  SH.id = id;
  SH.order = order || SH.order;
  if (!SH.open) {
    SH.open = true;
    history.pushState({ sheet: true }, ''); // Android back closes the sheet
    $('#sheet').hidden = false;
    $('#sheetBackdrop').hidden = false;
    document.body.classList.add('sheet-open');
  }
  render();
}
export const isSheetOpen = () => SH.open;
export function closeSheet(fromPop) {
  if (!SH.open) return;
  SH.open = false;
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  $('#sheet').style.transform = '';
  document.body.classList.remove('sheet-open');
  if (!fromPop && history.state && history.state.sheet) history.back();
}
window.addEventListener('popstate', () => { if (SH.open && !(history.state && history.state.sheet)) closeSheet(true); });

function step(d) {
  const i = SH.order.indexOf(SH.id);
  const j = i + d;
  if (j < 0 || j >= SH.order.length) { haptic(20); return; }
  SH.id = SH.order[j];
  haptic();
  render();
}

function render() {
  const c = S.byId.get(SH.id);
  if (!c) return closeSheet();
  const i = SH.order.indexOf(SH.id);
  $('#sheetKicker').textContent = `Бр. ${c.broj}/${c.godina} · ${c.mesto}${i >= 0 ? ` · ${i + 1}/${SH.order.length}` : ''}`;
  $('#sheetTitle').textContent = c.ime;
  $('#sheetPrev').disabled = i <= 0;
  $('#sheetNext').disabled = i < 0 || i >= SH.order.length - 1;
  for (const b of $$('#sheetTabs button')) {
    const t = b.dataset.t;
    const n = t === 'items' ? c.items.length : t === 'checks' ? c.warnings.length : t === 'edit' && S.overrides.has(c.id) ? Object.keys(S.overrides.get(c.id)).length : 0;
    b.innerHTML = { doc: 'Документ', items: 'Фактури', edit: 'Уреди', checks: 'Проверки' }[t] + (n ? `<span class="cnt">${n}</span>` : '');
    b.classList.toggle('on', t === SH.tab);
  }
  const sel = S.selected.has(c.id);
  $('#sheetSelect').className = `btn block ${sel ? '' : 'primary'}`;
  $('#sheetSelect').innerHTML = sel ? `${ICON.check} Избрана за генерирање — отстрани` : 'Избери за генерирање';
  const body = $('#sheetBody');
  body.scrollTop = 0;
  ({ doc: renderDoc, items: renderItems, edit: renderEdit, checks: renderChecks })[SH.tab](c, body);
}

function renderDoc(c, body) {
  const tpl = tplFor(c);
  if (!tpl) {
    body.innerHTML = `<div class="check warn"><span class="ico">${ICON.warn}</span><span>Нема избран Word шаблон. Изберете го во „Податоци“.</span></div>`;
    return;
  }
  const r = tpl.fill(buildValues(c)); // text only, no zip – instant even on slow phones
  const needles = [c.ime, c.adresa, c.embg, c.sifra, money(c.vkupenDolg), money(c.vkupnoTroshoci), money(c.advokat), money(c.notarTrosok), money(c.notarNagrada), money(c.materijal), ...c.items.map((x) => x.faktura)]
    .filter((x) => x && String(x).length > 2).sort((a, b) => b.length - a.length);
  const re = needles.length ? new RegExp(needles.map((n) => reEsc(String(n))).join('|'), 'g') : null;
  const mark = (t) => markText(t, re, '<span class="fill">', '</span>');
  const name = kindFor(c) === 'embg' ? S.templates.embg.name : S.templates.standard.name;
  body.innerHTML = `<p class="note" style="margin:0 2px 10px">${esc(name)}${r.unknown.length ? ` · <b style="color:var(--warn)">непознати полиња: ${esc(r.unknown.join(', '))}</b>` : ''}</p>
    <div class="paper">${previewParagraphs(r.documentXml).map((p) => `<p class="${p.center ? 'c' : ''}">${p.runs.map((x) => (x.bold ? `<b>${mark(x.text)}</b>` : mark(x.text))).join('') || '&nbsp;'}</p>`).join('')}</div>`;
}

function renderItems(c, body) {
  const diff = Math.abs(c.zbirStavki - c.vkupenDolg) > 0.005;
  body.innerHTML = `<div class="kv"><div><span>Вкупен долг</span><b>${money(c.vkupenDolg)}</b></div><div><span>Збир на фактури</span><b style="${diff ? 'color:var(--warn)' : ''}">${money(c.zbirStavki)}</b></div>
      <div><span>Трошоци</span><b>${money(c.vkupnoTroshoci)}</b></div><div><span>Долг + трошоци</span><b>${money(c.vkupenDolg + c.vkupnoTroshoci)}</b></div></div>
    ${c.items.map((it, n) => `<div class="inv"><span class="no">${n + 1}. ${esc(it.faktura)}</span><span class="am">${money(it.iznos)}</span><small>од ${fdate(it.ddo)} · валута ${fdate(it.valuta)}</small></div>`).join('') || '<div class="check error"><span>Нема фактури за оваа тужба.</span></div>'}
    <div class="section-title">Трошоци</div>
    <div class="kv"><div><span>Адвокатска награда</span><b>${money(c.advokat)}</b></div><div><span>Нотарска награда</span><b>${money(c.notarNagrada)}</b></div>
      <div><span>Нотарски трошок</span><b>${money(c.notarTrosok)}</b></div><div><span>Материјален трошок</span><b>${money(c.materijal)}</b></div>
      <div><span>Тековна состојба</span><b>${money(c.tekovna)}</b></div></div>`;
}

function renderEdit(c, body) {
  const ov = S.overrides.get(c.id) || {};
  const orig = c._orig || {};
  const field = ([k, label, kind]) => {
    const changed = k in ov;
    const val = kind === 'num' ? money(c[k]) : c[k];
    return `<div><label for="f_${k}"><span>${label}</span>${changed ? `<s>${esc(kind === 'num' ? money(orig[k]) : orig[k])}</s>` : ''}</label>
      <input class="inp ${kind !== 'text' ? 'mono' : ''} ${changed ? 'changed' : ''}" id="f_${k}" data-k="${k}" value="${esc(val)}"
        ${kind === 'num' ? 'inputmode="decimal"' : kind === 'tel' ? 'inputmode="numeric"' : 'autocapitalize="characters"'} autocomplete="off" spellcheck="false" enterkeyhint="done" /></div>`;
  };
  body.innerHTML = `<div class="form">${field(EDIT[0])}${field(EDIT[1])}<div class="two">${field(EDIT[2])}${field(EDIT[3])}</div>
      <div class="two">${field(EDIT[4])}${field(EDIT[5])}</div><div class="two">${field(EDIT[6])}${field(EDIT[7])}</div><div class="two">${field(EDIT[8])}${field(EDIT[9])}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
      <button class="btn" id="fRevert" ${S.overrides.has(c.id) ? '' : 'disabled style="opacity:.45"'}>Врати оригинал</button>
      <button class="btn primary" id="fSave">${ICON.check} Зачувај</button></div>
    <p class="note">Измените важат само во апликацијата — Excel датотеките не се менуваат. Се паметат на телефонот.</p>`;
  $('#fSave').onclick = () => {
    const patch = {};
    for (const inp of $$('#sheetBody .form .inp')) {
      const kind = EDIT.find((f) => f[0] === inp.dataset.k)[2];
      patch[inp.dataset.k] = kind === 'num' ? parseNum(inp.value) : inp.value;
    }
    updateCase(c.id, patch);
    toast('ok', 'Измените се зачувани', `Тужба ${c.broj}`);
    render();
  };
  $('#fRevert').onclick = () => { updateCase(c.id, null); toast('info', 'Вратени оригиналните податоци'); render(); };
}

function renderChecks(c, body) {
  const ei = c.embgInfo;
  const id = ei && ei.birth ? `<div class="section-title">Податоци од ЕМБГ</div><div class="kv">
      <div><span>Датум на раѓање</span><b>${esc(ei.birth)}</b></div><div><span>Возраст</span><b>${ei.age} год.</b></div>
      <div><span>Пол</span><b>${ei.sex === 'М' ? 'Машки' : 'Женски'}</b></div><div><span>Контролна цифра</span><b style="color:${ei.valid ? 'var(--ok)' : 'var(--warn)'}">${ei.valid ? 'Точна' : 'Неточна'}</b></div></div>` : '';
  const checks = c.warnings.length
    ? c.warnings.map((w) => `<div class="check ${w.level}"><span class="ico">${ICON[w.level === 'error' ? 'error' : w.level === 'info' ? 'info' : 'warn']}</span><span>${esc(w.text)}</span></div>`).join('')
    : `<div class="check ok"><span class="ico">${ICON.ok}</span><span>Сите проверки се поминати — збирот на фактурите одговара на вкупниот долг.</span></div>`;
  body.innerHTML = `${id}<div class="section-title">Проверки</div>${checks}
    <div class="section-title">Детали</div><div class="check plain"><span class="ico">${ICON.file}</span><span>
      Тип: <b>${c.tip === 'pravno' ? 'Правно лице' : 'Физичко лице'}</b><br/>Место: ${esc(c.mesto)}<br/>Шифра: ${esc(c.sifra)}<br/>Извор: ${esc(c.source)}<br/>
      Шаблон: ${kindFor(c) === 'embg' ? 'со ЕМБГ' : 'стандарден'} (${S.mode === 'auto' ? 'паметен избор' : 'рачно'})</span></div>`;
}

// ---------- events ----------
$('#sheetClose').onclick = () => closeSheet();
$('#sheetBackdrop').onclick = () => closeSheet();
$('#sheetPrev').onclick = () => step(-1);
$('#sheetNext').onclick = () => step(1);
$('#sheetTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { SH.tab = b.dataset.t; render(); } });
$('#sheetSelect').onclick = () => {
  if (S.selected.has(SH.id)) S.selected.delete(SH.id); else S.selected.add(SH.id);
  haptic();
  saveSession();
  emit('selection');
  render();
};
document.addEventListener('keydown', (e) => { if (SH.open && e.key === 'Escape') closeSheet(); });

// swipe down on the grip/header to close; horizontal swipe on the body switches case
let drag = null;
const head = () => [$('#sheetGrip'), $('.sheet-head')];
for (const el of head()) {
  el.addEventListener('touchstart', (e) => { drag = { y: e.touches[0].clientY, dy: 0 }; $('#sheet').classList.add('dragging'); }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
    $('#sheet').style.transform = `translateY(${drag.dy}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (!drag) return;
    $('#sheet').classList.remove('dragging');
    if (drag.dy > 120) closeSheet(); else $('#sheet').style.transform = '';
    drag = null;
  });
}
let swipe = null;
$('#sheetBody').addEventListener('touchstart', (e) => { swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
$('#sheetBody').addEventListener('touchend', (e) => {
  if (!swipe || SH.tab === 'edit') { swipe = null; return; }
  const dx = e.changedTouches[0].clientX - swipe.x;
  const dy = e.changedTouches[0].clientY - swipe.y;
  if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
  swipe = null;
});

// keep the sheet current when data changes underneath it
on('cases', () => { if (SH.open) render(); });
on('mode', () => { if (SH.open) render(); });
on('data', () => { if (SH.open && !S.byId.has(SH.id)) closeSheet(); });
