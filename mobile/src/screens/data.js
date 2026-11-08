// Screen 1 – Податоци: Excel files, Word templates, template mode.
import { $, $$, esc, ICON, nf, plural, moneyShort, toast, dialog, hydrateIcons } from '../ui.js';
import { S, on, emit, addFiles, removeFile, reloadData, setTemplate, removeTemplate, saveSession, resetAll } from '../state.js';
import { registerScreen, go } from '../router.js';

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function renderHero() {
  const el = $('#dataHero');
  if (S.loading) {
    el.innerHTML = '<h1>Вчитувам…</h1><p>Табелите се обработуваат на телефонот.</p><div class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff;margin:14px 0 0"></div>';
    return;
  }
  if (!S.cases.length) {
    el.innerHTML = `<h1>Добредојдовте</h1><p>1. Додадете ја <b>Листа на тужби</b> и <b>Ставки по тужби</b><br/>2. Изберете ги Word шаблоните (само еднаш)<br/>3. Генерирајте ги предлозите и споделете ги</p>`;
    return;
  }
  const debt = S.cases.reduce((s, c) => s + c.vkupenDolg, 0);
  const legal = S.cases.filter((c) => c.tip === 'pravno').length;
  el.innerHTML = `<h1>${plural(S.cases.length, 'тужба', 'тужби')}</h1><p>${legal ? `${nf(S.cases.length - legal)} физички · ${nf(legal)} правни лица` : 'подготвени за генерирање'}</p>
    <div class="hero-stats"><div><b>${nf(S.itemCount)}</b><span>фактури</span></div><div><b>${moneyShort(Math.round(debt / 1000))}</b><span>илј. ден. долг</span></div><div><b>${nf(S.selected.size)}</b><span>избрани</span></div></div>
    <button class="btn block" id="toCases" style="margin-top:14px;background:rgba(255,255,255,.95);color:#2440d0;box-shadow:none">Прегледај ги тужбите</button>`;
  $('#toCases').onclick = () => go('cases');
}

function renderFiles() {
  const info = new Map(S.fileInfo.map((f) => [f.name, f]));
  $('#fileList').innerHTML = S.files.map((f) => {
    const i = info.get(f.name) || {};
    const kind = i.kind === 'list' ? ['list', 'Листа'] : i.kind === 'items' ? ['items', 'Ставки'] : i.error ? ['bad', 'Грешка'] : ['bad', '…'];
    const meta = i.error ? esc(i.error) : i.rows ? `${nf(i.rows)} редови · ${kb(f.size)}` : kb(f.size);
    return `<li class="file-item ${i.error ? 'err' : ''}"><span class="kind ${kind[0]}">${kind[1]}</span>
      <div style="min-width:0"><div class="fname">${esc(f.name)}</div><div class="fmeta">${meta}</div></div>
      <button class="icon-btn" data-rm="${esc(f.name)}" aria-label="Отстрани ${esc(f.name)}">${ICON.x}</button></li>`;
  }).join('');
  const lists = S.fileInfo.filter((f) => f.kind === 'list').length;
  const items = S.fileInfo.filter((f) => f.kind === 'items').length;
  $('#filesHint').textContent = !S.files.length ? 'Листа + Ставки' : `${lists} листа · ${items} ставки`;
  $('#resetBtn').hidden = !S.files.length && !S.templates.standard && !S.templates.embg;
}

function renderTemplates() {
  for (const kind of ['standard', 'embg']) {
    const t = S.templates[kind];
    const title = kind === 'embg' ? 'Шаблон со ЕМБГ' : 'Стандарден шаблон';
    $(`#tpl-${kind}`).innerHTML = `<div class="tpl-ico ${t ? (kind === 'embg' ? 'embg' : '') : 'missing'}">W</div>
      <div style="min-width:0"><small>${title}</small><b>${t ? esc(t.name) : 'Не е избран'}</b>${t ? `<small>${t.tpl.placeholders.length} полиња</small>` : ''}</div>
      <div style="display:flex;gap:4px">${t ? `<button class="icon-btn small" data-tplrm="${kind}" aria-label="Отстрани">${ICON.x}</button>` : ''}<button class="small-btn" data-tpl="${kind}">${t ? 'Промени' : 'Избери'}</button></div>`;
  }
  $$('#modeSeg button').forEach((b) => { const on = b.dataset.v === S.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
}

function render() { renderHero(); renderFiles(); renderTemplates(); }

// ---------- events ----------
$('#excelInput').addEventListener('change', async (e) => {
  const list = [...e.target.files];
  e.target.value = '';
  if (!list.length) return;
  const bad = list.filter((f) => !/\.(xls|xlsx|xlsm)$/i.test(f.name));
  if (bad.length) toast('warn', 'Прескокнати датотеки', `${bad.map((f) => f.name).join(', ')} не се Excel`);
  const ok = list.filter((f) => /\.(xls|xlsx|xlsm)$/i.test(f.name));
  if (!ok.length) return;
  try {
    await addFiles(ok);
    const r = await reloadData();
    const errs = r.files.filter((f) => f.error);
    if (errs.length) toast('warn', errs.length === 1 ? 'Една датотека не е вчитана' : `${errs.length} датотеки не се вчитани`, errs.map((f) => `${f.name}: ${f.error}`).join(' · '), 7000);
    const lists = r.files.filter((f) => f.kind === 'list').length;
    const items = r.files.filter((f) => f.kind === 'items').length;
    if (lists && !items) toast('warn', 'Недостасува „Ставки по тужби“', 'Без ставки фактурите ќе бидат празни.');
    else if (!lists && items) toast('info', 'Додадете ја и „Листа на тужби“');
    else if (S.cases.length) toast('ok', `Вчитани ${plural(S.cases.length, 'тужба', 'тужби')}`, `${plural(S.itemCount, 'фактура', 'фактури')} · ${r.ms} ms`);
  } catch (err) {
    toast('error', 'Не може да се вчита', err.message, 7000);
  }
});

$('#fileList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b) return;
  await removeFile(b.dataset.rm);
  await reloadData();
  toast('info', 'Датотеката е отстранета', b.dataset.rm);
});

let pendingKind = null;
document.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-tpl]');
  if (pick) { pendingKind = pick.dataset.tpl; $('#tplInput').click(); return; }
  const rm = e.target.closest('[data-tplrm]');
  if (rm) removeTemplate(rm.dataset.tplrm).then(() => toast('info', 'Шаблонот е отстранет'));
});
$('#tplInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f || !pendingKind) return;
  try {
    await setTemplate(pendingKind, f.name, await f.arrayBuffer());
    toast('ok', 'Шаблонот е зачуван', `${f.name} · ${S.templates[pendingKind].tpl.placeholders.length} полиња`);
  } catch (err) { toast('error', 'Неважечки шаблон', err.message, 6000); }
});

$('#modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  S.mode = b.dataset.v;
  renderTemplates();
  saveSession();
  emit('mode');
});

$('#resetBtn').onclick = () => {
  const close = dialog(`<h3>Исчисти ги податоците?</h3><p>Ќе се избришат вчитаните табели, шаблоните, изборот и рачните измени од овој телефон. Генерираните документи што веќе сте ги споделиле остануваат.</p>
    <div class="actions"><button class="btn block" style="color:var(--err)" id="rstYes">Исчисти сè</button><button class="btn ghost block" id="rstNo">Откажи</button></div>`);
  $('#rstNo').onclick = close;
  $('#rstYes').onclick = async () => { close(); await resetAll(); toast('ok', 'Податоците се избришани'); };
};

on('data', render);
on('loading', render);
on('templates', render);
on('restored', render);
on('selection', renderHero);
registerScreen('data', { show: render });
hydrateIcons();
render();
