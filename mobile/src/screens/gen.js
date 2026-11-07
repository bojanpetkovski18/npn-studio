// Screen 4 – Генерирај: rules → summary → options → generate in the worker → share / save the ZIP.
import { $, esc, ICON, nf, plural, money, moneyShort, toast, haptic, parseNum, hydrateIcons, dialog } from '../ui.js';
import { S, on, emit, eligible, kindFor, saveSession, has } from '../state.js';
import { registerScreen, go, App } from '../router.js';
import { engine } from '../engine.js';
import { store } from '../store.js';
import { canShareFiles, shareFile, saveFile, cleanShareCache, isNative } from '../native.js';

const G = { running: false, progress: null, result: null, blob: null, history: [] };
window.__nalogix = G; // inspected by the automated tests

const sw = (id, checked, label, sub = '') => `<label class="row-toggle"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>
  <span class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} /><i></i></span></label>`;

function selectedCases() { return S.cases.filter((c) => S.selected.has(c.id)).sort((a, b) => Number(a.broj) - Number(b.broj)); }

function render() {
  const body = $('#genBody');
  if (!S.cases.length) {
    body.innerHTML = `<div class="empty"><div class="art">${ICON.send}</div><h3>Нема што да се генерира</h3><p>Прво вчитајте ги табелите и изберете шаблон.</p><button class="btn primary" id="gToData">Оди на Податоци</button></div>`;
    $('#gToData').onclick = () => go('data');
    return;
  }
  const sel = selectedCases();
  const eligibleN = S.cases.filter((c) => eligible(c)).length;
  const kinds = { standard: 0, embg: 0, none: 0 };
  for (const c of sel) kinds[kindFor(c) || 'none']++;
  const warn = sel.filter((c) => c.warnings.some((w) => w.level !== 'info')).length;
  const noItems = sel.filter((c) => !c.items.length).length;
  const tplMissing = !has().standard && !has().embg;

  body.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Правила за избор</h2><span class="hint">${nf(eligibleN)} од ${nf(S.cases.length)}</span></div>
      <label class="field-label" for="gMin" style="margin-top:0">Минимален главен долг (ден.)</label>
      <input class="inp mono" id="gMin" inputmode="numeric" value="${esc(String(S.rules.min))}" />
      <div style="margin-top:6px">${sw('gFiz', S.rules.fiz, 'Само физички лица', 'правните лица (ДООЕЛ, АД, заедници…) се прескокнуваат')}
      ${sw('gItems', S.rules.items, 'Прескокни тужби без фактури')}
      ${sw('gDone', S.rules.skipDone, 'Прескокни веќе генерирани', 'на овој телефон')}</div>
      <button class="btn soft block" id="gApply" style="margin-top:10px">Избери ${plural(eligibleN, 'тужба', 'тужби')} според правилата</button>
    </div>

    <div class="card">
      <div class="card-head"><h2>Ќе се генерира</h2><button class="link-btn" id="gReview">Прегледај</button></div>
      <div class="sum-row"><span>Документи</span><b>${nf(sel.length)}</b></div>
      <div class="sum-row"><span>Фактури</span><b>${nf(sel.reduce((s, c) => s + c.items.length, 0))}</b></div>
      <div class="sum-row"><span>Главен долг</span><b>${moneyShort(sel.reduce((s, c) => s + c.vkupenDolg, 0))} ден.</b></div>
      <div class="sum-row"><span>Трошоци</span><b>${moneyShort(sel.reduce((s, c) => s + c.vkupnoTroshoci, 0))} ден.</b></div>
      <div class="sum-row"><span>Шаблон</span><b>${kinds.standard ? `${nf(kinds.standard)} стандарден` : ''}${kinds.standard && kinds.embg ? ' · ' : ''}${kinds.embg ? `${nf(kinds.embg)} со ЕМБГ` : ''}${!kinds.standard && !kinds.embg ? '—' : ''}</b></div>
      ${warn ? `<div class="check warn" style="margin-top:10px"><span class="ico">${ICON.warn}</span><span>${plural(warn, 'тужба има', 'тужби имаат')} предупредување — ќе бидат означени во извештајот.</span></div>` : ''}
      ${noItems ? `<div class="check error"><span class="ico">${ICON.error}</span><span>${plural(noItems, 'тужба нема', 'тужби немаат')} фактури.</span></div>` : ''}
      ${tplMissing ? `<div class="check error"><span class="ico">${ICON.error}</span><span>Изберете Word шаблон во „Податоци“.</span></div>` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>Опции</h2></div>
      <label class="field-label" for="gPattern" style="margin-top:0">Име на датотека <span class="hint">{BROJ} {IME} {SIFRA} {MESTO}</span></label>
      <input class="inp mono" id="gPattern" value="${esc(S.pattern)}" autocomplete="off" spellcheck="false" autocapitalize="off" />
      <div style="margin-top:6px">${sw('gCombined', S.options.combined, 'Еден документ за печатење', 'сите предлози во еден .docx')}
      ${sw('gReport', S.options.report, 'Excel извештај')}</div>
    </div>

    <div id="gRun"></div>
    <div class="card" id="gHistory" ${G.history.length ? '' : 'hidden'}></div>`;
  renderRun();
  renderHistory();
  hydrateIcons(body);
}

function renderRun() {
  const el = $('#gRun');
  if (!el) return;
  const n = S.selected.size;
  if (G.running) {
    const p = G.progress || {};
    const pct = p.phase === 'docx' ? Math.round((p.done / p.total) * 100) : p.phase ? 100 : 0;
    const label = p.phase === 'docx' ? `${nf(p.done)} / ${nf(p.total)} · ${p.name || ''}` : p.phase === 'combined' ? 'Документ за печатење…' : p.phase === 'report' ? 'Excel извештај…' : p.phase === 'zip' ? 'Пакувам ZIP…' : 'Подготвувам…';
    el.innerHTML = `<div class="card"><h2>Генерирам…</h2><div class="progress"><div class="bar"><i style="width:${pct}%"></i></div>
      <div class="lbl"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span><span>${pct}%</span></div></div>
      <button class="btn ghost block" id="gCancel" style="margin-top:10px">Откажи</button></div>`;
    $('#gCancel').onclick = () => { engine.cancel(); $('#gCancel').disabled = true; $('#gCancel').textContent = 'Прекинувам…'; };
    return;
  }
  if (G.result && !G.result.cancelled) {
    const r = G.result;
    const mb = (G.blob.size / 1048576).toFixed(1).replace('.', ',');
    el.innerHTML = `<div class="card result">
      <div class="big-ico" style="${r.errors.length ? 'background:var(--warn-soft);color:var(--warn)' : ''}">${r.errors.length ? ICON.warn : ICON.ok}</div>
      <h3>${plural(r.count, 'документ е подготвен', 'документи се подготвени')}</h3>
      <p>${esc(r.name)} · ${mb} MB · ${(r.ms / 1000).toFixed(1).replace('.', ',')} s${r.warn ? `<br/>${plural(r.warn, 'со забелешка', 'со забелешка')}` : ''}${r.errors.length ? `<br/><b style="color:var(--err)">${plural(r.errors.length, 'грешка', 'грешки')}</b>` : ''}</p>
      <div class="actions">
        ${canShareFiles() ? `<button class="btn primary block big" id="gShare">${ICON.share} Сподели (е-пошта, облак, пораки…)</button>` : ''}
        <button class="btn block ${canShareFiles() ? '' : 'primary big'}" id="gSave">${ICON.download} ${isNative ? 'Зачувај во „Documents/Nalogix“' : 'Зачувај на телефонот'}</button>
        <button class="btn ghost block" id="gNew">Ново генерирање</button>
      </div></div>`;
    if ($('#gShare')) $('#gShare').onclick = share;
    $('#gSave').onclick = save;
    $('#gNew').onclick = () => { G.result = null; G.blob = null; cleanShareCache(); renderRun(); };
    return;
  }
  el.innerHTML = `<button class="btn primary block big" id="gGo" ${n && (has().standard || has().embg) ? '' : 'disabled'}>${ICON.send} Генерирај ${nf(n)} ${n === 1 ? 'документ' : 'документи'}</button>`;
  $('#gGo').onclick = generate;
}

function renderHistory() {
  const el = $('#gHistory');
  if (!el) return;
  el.hidden = !G.history.length;
  el.innerHTML = `<div class="card-head"><h2>Претходни генерирања</h2></div>` + G.history.slice(0, 8).map((h) =>
    `<div class="hist"><div>${esc(h.range)}<small>${new Date(h.at).toLocaleString('mk-MK')}</small></div><div style="text-align:right">${nf(h.count)} док.<small>${moneyShort(h.debt)} ден.</small></div></div>`).join('');
}

async function generate() {
  if (G.running) return;
  const cases = selectedCases();
  if (!cases.length) return;
  const tpl = (k) => (S.templates[k] ? { name: S.templates[k].name, data: S.templates[k].data } : null);
  G.running = true; G.progress = null; G.result = null; G.blob = null;
  engine.resetCancel(); // a stale tap on "Откажи" from an earlier run must not cancel this one
  haptic(15);
  renderRun();
  $('#gRun').scrollIntoView({ block: 'center', behavior: 'smooth' }); // progress is below the options – bring it into view
  // keep the screen on while generating (best effort; not every browser supports it)
  let lock = null;
  try { lock = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch {}
  try {
    const res = await engine.generate({
      cases, templates: { standard: tpl('standard'), embg: tpl('embg') }, mode: S.mode, pattern: S.pattern,
      options: { ...S.options }, overrides: Object.fromEntries(S.overrides),
    }, (p) => { G.progress = p; renderRun(); });
    if (res.cancelled) { toast('info', 'Генерирањето е прекинато', `${nf(res.done)} документи беа готови`); G.result = null; }
    else {
      G.result = res;
      G.blob = new Blob([res.zip], { type: 'application/zip' });
      for (const id of res.doneIds) S.generated.add(id);
      G.history.unshift({ at: Date.now(), count: res.count, range: res.name.replace(/^Nalogix_|_\d{4}-.*$/g, ''), debt: cases.filter((c) => res.doneIds.includes(c.id)).reduce((s, c) => s + c.vkupenDolg, 0) });
      G.history = G.history.slice(0, 30);
      store.set('history', G.history).catch(() => {});
      saveSession();
      emit('generated');
      haptic([20, 40, 20]);
    }
  } catch (err) {
    toast('error', 'Генерирањето не успеа', err.message, 8000);
  } finally {
    G.running = false;
    try { if (lock) await lock.release(); } catch {}
    render();
    // the result (Share / Save) is the next thing to do – make sure it is on screen
    requestAnimationFrame(() => { const r = $('#gRun'); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  }
}

// Share / save go through native.js: Web Share + download in the browser, Capacitor Share + Filesystem in the app.
async function share() {
  const btn = $('#gShare');
  if (btn) { btn.disabled = true; btn.innerHTML = `${ICON.share} Подготвувам…`; }
  try {
    await shareFile(G.blob, G.result.name, `Nalogix: ${plural(G.result.count, 'предлог', 'предлози')} за нотарски платен налог`);
  } catch (err) {
    toast('warn', 'Не може да се сподели', 'Датотеката ќе се зачува наместо тоа.');
    await save();
  } finally {
    if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = `${ICON.share} Сподели (е-пошта, облак, пораки…)`; }
  }
}
async function save() {
  try {
    const where = await saveFile(G.blob, G.result.name);
    toast('ok', 'Зачувано', where, 6000);
  } catch (err) {
    toast('error', 'Не може да се зачува', err.message, 7000);
  }
}

function reviewList() {
  const sel = selectedCases();
  const close = dialog(`<h3>${plural(sel.length, 'избрана тужба', 'избрани тужби')}</h3>
    <div style="max-height:55dvh;overflow:auto;margin:0 -4px 14px">${sel.slice(0, 300).map((c) =>
      `<div class="hist"><div style="min-width:0"><b style="font-weight:600">${esc(c.broj)} · ${esc(c.ime)}</b><small>${esc(c.mesto)}</small></div><div>${money(c.vkupenDolg)}</div></div>`).join('')}
    ${sel.length > 300 ? `<p class="note">… и уште ${nf(sel.length - 300)}</p>` : ''}</div>
    <div class="actions"><button class="btn primary block" id="rvCases">Измени го изборот</button></div>`);
  $('#rvCases').onclick = () => { close(); setTimeout(() => go('cases'), 50); };
}

// ---------- events (delegated: the screen is re-rendered often) ----------
$('#genBody').addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'gFiz') S.rules.fiz = e.target.checked;
  else if (id === 'gItems') S.rules.items = e.target.checked;
  else if (id === 'gDone') S.rules.skipDone = e.target.checked;
  else if (id === 'gCombined') S.options.combined = e.target.checked;
  else if (id === 'gReport') S.options.report = e.target.checked;
  else if (id === 'gPattern') S.pattern = e.target.value.trim() || 'NPN_{BROJ}';
  else if (id === 'gMin') S.rules.min = parseNum(e.target.value);
  else return;
  saveSession();
  if (['gFiz', 'gItems', 'gDone', 'gMin'].includes(id)) render();
});
$('#genBody').addEventListener('click', (e) => {
  if (e.target.closest('#gApply')) {
    S.selected = new Set(S.cases.filter((c) => eligible(c)).map((c) => c.id));
    haptic(12);
    saveSession();
    emit('selection');
    toast('ok', `Избрани ${plural(S.selected.size, 'тужба', 'тужби')}`, 'според правилата');
  } else if (e.target.closest('#gReview')) reviewList();
});

on('data', () => { if (App.tab === 'gen') render(); });
on('selection', () => { if (App.tab === 'gen' && !G.running) render(); });
on('mode', () => { if (App.tab === 'gen' && !G.running) render(); });
on('templates', () => { if (App.tab === 'gen' && !G.running) render(); });
on('restored', async () => { G.history = (await store.get('history')) || []; if (App.tab === 'gen') render(); });
registerScreen('gen', { show: () => { if (!G.running) render(); } });
