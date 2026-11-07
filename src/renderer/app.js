'use strict';
/* global api */

// Apply the theme before anything renders (main passes the effective theme in the URL).
(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme');
  if (q.get('mica') === '0') document.documentElement.classList.add('no-mica');
})();

// ---------------- helpers ----------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => {
  const n = Number(v) || 0;
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
};
const moneyShort = (v) => money(v).replace(/,00$/, '');
const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace('.', ',')} мил.` : v >= 1e3 ? `${Math.round(v / 1e3)} илј.` : String(Math.round(v)));
const pad = (n) => String(n).padStart(2, '0');
const fdate = (v) => {
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; }
  return String(v ?? '');
};
const ym = (v) => {
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }
  const m = String(v || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${pad(m[2])}` : '';
};
const MONTHS = ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const nf = (n) => Number(n).toLocaleString('mk-MK');
const plural = (n, one, many) => `${nf(n)} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const cleanErr = (e) => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const parseNum = (s) => Number(String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0;

const ICON = {
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8 12.5 2.7 2.7L16 9.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.3v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5.5M12 7.8v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z M8 4v5h7V4 M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V5M19 20v-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  table: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  filter: '<svg viewBox="0 0 24 24"><path d="M4 5h16l-6 7v6l-4 2v-8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------------- state ----------------
const S = {
  filePaths: [], files: [], cases: [], byId: new Map(), view: [],
  selected: new Set(), generated: new Map(), existing: new Set(),
  activeId: null, query: '', filter: 'all', source: '', mesto: '',
  sort: { key: 'broj', dir: 1 }, mode: 'auto', outDir: '',
  templates: { standard: null, embg: null },
  tab: 'doc', viewMode: 'table', highlight: true, running: false, pdf: null, lastClicked: null,
  projectPath: null, init: null, theme: 'system',
};
const rules = () => ({
  min: parseNum($('#minDolg').value), fiz: $('#ruleFiz').checked, items: $('#ruleItems').checked, done: $('#ruleDone').checked,
});
// r must be computed once per pass (rules() reads the DOM) – never per case
const eligible = (c, r) => c.vkupenDolg >= r.min && (!r.fiz || c.tip === 'fizicko') && (!r.items || c.items.length > 0) && (!r.done || !S.existing.has(c.id));
const eligibleIds = () => { const r = rules(); return S.cases.filter((c) => eligible(c, r)).map((c) => c.id); };

// ---------------- theme (system / light / dark) ----------------
const THEMES = [
  { v: 'system', label: 'Според системот', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  { v: 'light', label: 'Светла', icon: null },
  { v: 'dark', label: 'Темна', icon: null },
];
const sysDark = matchMedia('(prefers-color-scheme: dark)');
function paintTheme() {
  const dark = S.theme === 'dark' || (S.theme === 'system' && sysDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').innerHTML = S.theme === 'system' ? THEMES[0].icon : dark ? ICON.moon : ICON.sun;
  $('#themeBtn').title = `Тема: ${THEMES.find((t) => t.v === S.theme).label}`;
  if (S.viewMode === 'charts' && S.cases.length) renderCharts();
}
function setTheme(v, persist = true) {
  S.theme = THEMES.some((t) => t.v === v) ? v : 'system';
  paintTheme();
  if (persist) api.setTheme(S.theme); // main persists it and syncs the native title-bar buttons / window background
}
function toggleTheme() { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
// only follow the OS while the user chose "system" (previously an OS flip overrode an explicit choice)
sysDark.addEventListener('change', () => { if (S.theme === 'system') paintTheme(); });

function closeThemeMenu() { const m = $('#themeMenu'); if (m) m.remove(); }
$('#themeBtn').onclick = (e) => {
  e.stopPropagation();
  if ($('#themeMenu')) return closeThemeMenu();
  const r = $('#themeBtn').getBoundingClientRect();
  const m = document.createElement('div');
  m.id = 'themeMenu';
  m.className = 'menu';
  m.style.top = `${r.bottom + 6}px`;
  m.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  m.innerHTML = '<div class="menu-title">Изглед</div>' + THEMES.map((t) =>
    `<button class="menu-item ${S.theme === t.v ? 'on' : ''}" data-v="${t.v}"><span class="mi-ico">${t.icon || (t.v === 'dark' ? ICON.moon : ICON.sun)}</span><span class="mi-label">${t.label}</span>${S.theme === t.v ? `<span class="mi-check">${ICON.check}</span>` : ''}</button>`).join('');
  document.body.appendChild(m);
  m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-v]'); if (b) { setTheme(b.dataset.v); closeThemeMenu(); } });
};
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#themeMenu, #themeBtn')) closeThemeMenu(); });
window.addEventListener('blur', closeThemeMenu);

// ---------------- toasts & modal ----------------
function toast(kind, title, text = '', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${ICON[kind] || ICON.info}<div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}
function openModal(html, wide) {
  $('#modal').innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

// ---------------- session / projects ----------------
function snapshot() {
  return {
    files: S.filePaths,
    templates: { standard: S.templates.standard?.filePath || null, embg: S.templates.embg?.filePath || null },
    selected: [...S.selected],
    settings: {
      mode: S.mode, outDir: S.outDir, pattern: $('#pattern').value, subfolder: $('#subfolder').value,
      rules: rules(), combined: $('#optCombined').checked, report: $('#optReport').checked, overwrite: $('#optOverwrite').checked,
    },
  };
}
const saveSession = debounce(() => { if (S.filePaths.length) api.saveSession(snapshot()); }, 1200);

function applySettings(st = {}) {
  if (st.mode) setMode(st.mode, true);
  if (st.outDir) setOutDir(st.outDir, true);
  if (st.pattern) $('#pattern').value = st.pattern;
  if (st.subfolder) $('#subfolder').value = st.subfolder;
  if (st.rules) {
    $('#minDolg').value = st.rules.min ?? 6000; $('#ruleFiz').checked = !!st.rules.fiz;
    $('#ruleItems').checked = st.rules.items !== false; $('#ruleDone').checked = !!st.rules.done;
  }
  for (const k of ['combined', 'report', 'overwrite']) if (typeof st[k] === 'boolean') $(`#opt${k[0].toUpperCase()}${k.slice(1)}`).checked = st[k];
}

async function restore(snap, label) {
  if (snap.templates) {
    for (const kind of ['standard', 'embg']) if (snap.templates[kind]) await setTemplate(kind, () => api.loadTemplate(kind, snap.templates[kind]), true);
  }
  applySettings(snap.settings);
  S.filePaths = snap.files || [];
  await reload(snap.overrides, snap.selected);
  if (label) toast('ok', label, `${plural(S.cases.length, 'тужба', 'тужби')} · ${S.selected.size} избрани`);
}

async function openProject(path) {
  try {
    const p = await api.openProject(path);
    if (!p) return;
    if (p.missing.length) toast('warn', 'Некои датотеки недостасуваат', p.missing.map((f) => f.split(/[\\/]/).pop()).join(', '), 8000);
    p.files = p.files.filter((f) => !p.missing.includes(f));
    S.projectPath = p.filePath;
    updateProjectName();
    await restore(p, 'Проектот е отворен');
  } catch (e) { toast('error', 'Не може да се отвори проектот', cleanErr(e)); }
}
async function saveProject(as) {
  if (!S.filePaths.length) return toast('warn', 'Нема што да се зачува', 'Прво вчитајте податоци.');
  try {
    const p = await api.saveProject(snapshot(), as ? null : S.projectPath);
    if (p) { S.projectPath = p; updateProjectName(); toast('ok', 'Проектот е зачуван', p.split(/[\\/]/).pop()); }
  } catch (e) { toast('error', 'Зачувувањето не успеа', cleanErr(e)); }
}
function updateProjectName() {
  $('#projectName').textContent = S.projectPath ? S.projectPath.split(/[\\/]/).pop().replace(/\.nalogix$/i, '') : 'Предлози за нотарски платен налог';
}
$('#openProjBtn').onclick = () => openProject();
$('#saveProjBtn').onclick = () => saveProject(false);
$('#emptyProjBtn').onclick = () => openProject();

function renderResume() {
  const init = S.init || {};
  let html = '';
  if (init.session) {
    const s = init.session;
    html += `<div class="resume-title">Продолжи</div><div class="resume-item" data-act="session"><div class="ri-ico">${ICON.history}</div>
      <div><b>Последна сесија</b><span>${s.files.length} датотеки · ${(s.selected || []).length} избрани · ${new Date(s.savedAt).toLocaleString('mk-MK')}</span></div></div>`;
  }
  if (init.recent && init.recent.length) {
    html += '<div class="resume-title" style="margin-top:10px">Неодамнешни проекти</div>' + init.recent.map((p) =>
      `<div class="resume-item" data-proj="${esc(p)}"><div class="ri-ico">${ICON.file}</div><div><b>${esc(p.split(/[\\/]/).pop().replace(/\.nalogix$/i, ''))}</b><span>${esc(p)}</span></div></div>`).join('');
  }
  $('#resume').innerHTML = html;
  $$('#resume [data-proj]').forEach((el) => el.onclick = () => openProject(el.dataset.proj));
  const s = $('#resume [data-act=session]');
  if (s) s.onclick = () => restore(init.session, 'Сесијата е вратена');
}

// ---------------- data loading ----------------
async function addPaths(paths) {
  const excel = [];
  for (const p of paths) {
    if (/\.(xls|xlsx|xlsm|csv)$/i.test(p)) excel.push(p);
    else if (/\.nalogix$/i.test(p)) return openProject(p);
    else if (/\.docx$/i.test(p)) {
      const kind = /embg|ембг/i.test(p.split(/[\\/]/).pop()) ? 'embg' : 'standard';
      await setTemplate(kind, () => api.loadTemplate(kind, p));
    } else {
      try { await scanFolder(p); } catch { toast('warn', 'Непознат тип датотека', p); }
    }
  }
  if (excel.length) { S.filePaths = [...new Set([...S.filePaths, ...excel])]; await reload(); }
}
async function scanFolder(dir) {
  const r = await api.scanFolder(dir);
  if (r.standard) await setTemplate('standard', () => api.loadTemplate('standard', r.standard), true);
  if (r.embg) await setTemplate('embg', () => api.loadTemplate('embg', r.embg), true);
  if (!r.excel.length) { toast('warn', 'Нема Excel датотеки во папката', dir); return; }
  S.filePaths = [...new Set([...S.filePaths, ...r.excel])];
  await reload();
}

async function reload(overrides, selectedIds) {
  if (!S.filePaths.length) {
    S.files = []; S.cases = []; S.byId.clear(); S.selected.clear();
    renderFiles(); renderFilters(); refresh(); return;
  }
  $('#fileList').innerHTML = `<li><div class="spinner"></div><div class="fname">Вчитувам ${S.filePaths.length} датотеки…</div><span></span></li>`;
  const seq = ++reload.seq; // a newer reload (e.g. a second quick drop) wins; stale responses are ignored
  try {
    const t0 = performance.now();
    const ov = overrides || (S.cases.length ? currentOverrides() : undefined);
    const prev = S.cases.length ? { ids: new Set(S.cases.map((c) => c.id)), selected: new Set(S.selected) } : null;
    const res = await api.loadData(S.filePaths, ov);
    if (seq !== reload.seq) return;
    S.files = res.files; S.cases = res.cases;
    S.byId = new Map(res.cases.map((c) => [c.id, c]));
    S.generated.clear();
    await scanExisting();
    if (selectedIds) S.selected = new Set(selectedIds.filter((id) => S.byId.has(id)));
    else {
      // keep the user's manual choices for cases that were already loaded; apply the rules only to new ones
      const r = rules();
      S.selected = new Set(S.cases.filter((c) => (prev && prev.ids.has(c.id) ? prev.selected.has(c.id) : eligible(c, r))).map((c) => c.id));
    }
    renderFiles(); renderFilters(); refresh();
    const bad = res.files.filter((f) => f.error);
    if (bad.length) toast('warn', bad.length === 1 ? 'Една датотека не е вчитана' : `${bad.length} датотеки не се вчитани`, bad.map((f) => `${f.name}: ${f.error}`).join(' · '), 9000);
    const lists = res.files.filter((f) => f.kind === 'list').length;
    const items = res.files.filter((f) => f.kind === 'items').length;
    const legal = S.cases.filter((c) => c.tip === 'pravno').length;
    if (lists && !items) toast('warn', 'Недостасува „Ставки по тужби“', 'Додадете ја датотеката со ставки за да се пополнат фактурите.');
    else if (!lists && items) toast('warn', 'Недостасува „Листа на тужби“', 'Додадете ја листата на тужби.');
    else if (!selectedIds) toast('ok', `Вчитани ${plural(res.cases.length, 'тужба', 'тужби')}`,
      `${plural(res.itemCount, 'фактура', 'фактури')} за ${Math.round(performance.now() - t0)} ms` +
      (legal ? ` · ${legal} правни лица препознаени` : '') + (res.duplicatesSkipped ? ` · ${res.duplicatesSkipped} дупликати` : '') +
      (res.overridesApplied ? ` · ${res.overridesApplied} рачни измени` : ''));
    saveSession();
  } catch (err) {
    if (seq !== reload.seq) return;
    toast('error', 'Грешка при читање', cleanErr(err), 8000);
    renderFiles();
  }
}
reload.seq = 0;
const currentOverrides = () => Object.fromEntries(S.cases.filter((c) => c.edited.length).map((c) => [c.id, Object.fromEntries(c.edited.map((k) => [k, c[k]]))]));

async function scanExisting() {
  try { S.existing = new Set(await api.existing(S.outDir, $('#pattern').value || 'NPN_{BROJ}')); } catch { S.existing = new Set(); }
}

function renderFiles() {
  $('#fileList').innerHTML = S.files.map((f) => {
    const kind = f.kind === 'list' ? ['list', 'Листа'] : f.kind === 'items' ? ['items', 'Ставки'] : ['unknown', f.error ? 'Грешка' : '?'];
    return `<li title="${esc(f.filePath)}${f.error ? `\n${esc(f.error)}` : ''}" class="${f.error ? 'has-error' : ''}"><span class="badge ${kind[0]}">${kind[1]}</span>
      <div style="min-width:0"><div class="fname">${esc(f.name)}</div><div class="fmeta">${f.error ? esc(f.error) : `${nf(f.rows || 0)} редови`}</div></div>
      <button class="x-btn" data-path="${esc(f.filePath)}" title="Отстрани">${ICON.x}</button></li>`;
  }).join('');
  // remove by path, not by index (indexes drift if a load failed half-way)
  $$('#fileList .x-btn').forEach((b) => b.onclick = () => { S.filePaths = S.filePaths.filter((p) => p !== b.dataset.path); reload(); });
}

function renderFilters() {
  const sources = [...new Set(S.cases.map((c) => c.source))];
  if (!sources.includes(S.source)) S.source = '';
  $('#sourceSel').innerHTML = '<option value="">Сите листи</option>' + sources.map((s) => `<option ${s === S.source ? 'selected' : ''} value="${esc(s)}">${esc(s.replace(/\.xlsx?$/i, ''))}</option>`).join('');
  $('#sourceSel').style.display = sources.length > 1 ? '' : 'none';
  const places = {};
  for (const c of S.cases) places[c.mesto] = (places[c.mesto] || 0) + 1;
  const list = Object.entries(places).sort((a, b) => b[1] - a[1]);
  if (!places[S.mesto]) S.mesto = '';
  $('#mestoSel').innerHTML = '<option value="">Сите места</option>' + list.map(([m, n]) => `<option ${m === S.mesto ? 'selected' : ''} value="${esc(m)}">${esc(m)} (${n})</option>`).join('');
  $('#mestoSel').style.display = list.length > 1 ? '' : 'none';
}

// ---------------- templates ----------------
async function setTemplate(kind, loader, quiet) {
  try {
    const t = await loader();
    if (!t) return;
    S.templates[kind] = t;
    renderTemplates();
    if (!quiet) toast('ok', 'Шаблонот е вчитан', `${t.name} · ${t.placeholders.length} полиња`);
    if (S.activeId) renderDrawer();
    saveSession();
  } catch (err) { toast('error', 'Неважечки шаблон', cleanErr(err)); }
}
function renderTemplates() {
  for (const kind of ['standard', 'embg']) {
    const t = S.templates[kind];
    const title = kind === 'embg' ? 'Шаблон со ЕМБГ' : 'Стандарден шаблон';
    $(`#tpl-${kind}`).innerHTML = t
      ? `<div class="tpl-ico ${kind === 'embg' ? 'embg' : ''}">W</div>
         <div style="min-width:0"><div class="tpl-title">${title}</div><div class="tpl-name" title="${esc(t.filePath)}">${esc(t.name)}</div>
         <div class="tpl-ph" title="${esc(t.placeholders.join(', '))}">${t.placeholders.length} полиња</div></div>
         <button class="small-btn" data-k="${kind}">Промени</button>`
      : `<div class="tpl-ico missing">W</div><div><div class="tpl-title">${title}</div><div class="tpl-name" style="color:var(--text-3)">Не е избран</div></div>
         <button class="small-btn" data-k="${kind}">Избери</button>`;
  }
  $$('.tpl .small-btn').forEach((b) => b.onclick = () => setTemplate(b.dataset.k, () => api.pickTemplate(b.dataset.k)));
  $('#datumWrap').hidden = !Object.values(S.templates).some((t) => t && t.placeholders.includes('DATUM'));
  refresh(false);
}
function templateFor(c) {
  const { standard, embg } = S.templates;
  if (S.mode === 'embg') return embg ? 'emb' : standard ? 'std' : null;
  if (S.mode === 'standard') return standard ? 'std' : embg ? 'emb' : null;
  return c.embg && !c.edb && c.tip === 'fizicko' && embg ? 'emb' : standard ? 'std' : embg ? 'emb' : null;
}
function setMode(m, quiet) {
  S.mode = m;
  $$('#modeSeg button').forEach((x) => x.classList.toggle('on', x.dataset.v === m));
  if (!quiet) { api.setSettings({ mode: m }); saveSession(); }
  renderRows(true);
  if (S.activeId) renderDrawer();
}
$$('#modeSeg button').forEach((b) => b.onclick = () => setMode(b.dataset.v));

// ---------------- filtering / sorting ----------------
const FILTERS = {
  all: () => true,
  fiz: (c) => c.tip === 'fizicko',
  pravno: (c) => c.tip === 'pravno',
  warn: (c) => c.warnings.some((w) => w.level !== 'info'),
  todo: (c) => !S.existing.has(c.id) && S.generated.get(c.id) !== 'ok',
  edited: (c) => c.edited.length > 0,
};
function applyView() {
  const terms = S.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const f = FILTERS[S.filter];
  const v = S.cases.filter((c) => {
    if (S.source && c.source !== S.source) return false;
    if (S.mesto && c.mesto !== S.mesto) return false;
    if (!f(c)) return false;
    if (!terms.length) return true;
    if (!c._hay) c._hay = [c.broj, c.ime, c.adresa, c.sifra, c.embg, c.mesto, ...c.items.map((i) => i.faktura)].join(' ').toLowerCase();
    return terms.every((t) => c._hay.includes(t));
  });
  const { key, dir } = S.sort;
  const val = (c) => key === 'items' ? c.items.length : key === 'warn' ? c.warnings.length : key === 'broj' ? Number(c.broj) : c[key];
  v.sort((a, b) => {
    const x = val(a), y = val(b);
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x || '').localeCompare(String(y || ''), 'mk')) * dir;
  });
  S.view = v;
}
function refresh(recompute = true) {
  if (recompute) applyView();
  const has = S.cases.length > 0;
  $('#empty').classList.toggle('hidden', has);
  if (!has) renderResume();
  $('#searchCount').textContent = has && (S.query || S.filter !== 'all' || S.source || S.mesto) ? `${nf(S.view.length)} / ${nf(S.cases.length)}` : '';
  $$('.thead .sortable').forEach((h) => { h.classList.toggle('asc', h.dataset.s === S.sort.key && S.sort.dir === 1); h.classList.toggle('desc', h.dataset.s === S.sort.key && S.sort.dir === -1); });
  // one pass over the data for all chip counts
  const counts = {};
  if (has) {
    const keys = Object.keys(FILTERS).filter((k) => k !== 'all');
    for (const k of keys) counts[k] = 0;
    for (const c of S.cases) for (const k of keys) if (FILTERS[k](c)) counts[k]++;
  }
  $$('#filterChips button').forEach((b) => {
    if (!b.dataset.label) b.dataset.label = b.textContent.trim();
    const n = has && b.dataset.f !== 'all' ? counts[b.dataset.f] : null;
    b.innerHTML = `${esc(b.dataset.label)}${n !== null ? `<span class="n">${nf(n)}</span>` : ''}`;
    b.classList.toggle('on', b.dataset.f === S.filter);
  });
  renderRows(true); renderStats(); renderSelection(); renderRuleCount();
  if (S.viewMode === 'charts') renderCharts();
}

// ---------------- virtual table ----------------
const ROW_H = 58;
const tbody = $('#tbody');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Escapes text and wraps regex matches – matching happens on the RAW text, so "amp" never hits "&amp;". */
function markText(text, re, open, close) {
  const s = String(text ?? '');
  if (!re) return esc(s);
  re.lastIndex = 0;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(s.slice(last, m.index)) + open + esc(m[0]) + close;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}
let hlCache = { q: null, re: null };
function hl(text) {
  if (hlCache.q !== S.query) {
    const terms = S.query.trim().split(/\s+/).filter((x) => x.length > 1);
    hlCache = { q: S.query, re: terms.length ? new RegExp(terms.map(reEsc).join('|'), 'gi') : null };
  }
  return markText(text, hlCache.re, '<mark>', '</mark>');
}
function statusPill(c) {
  const gen = S.generated.get(c.id);
  if (gen === 'ok') return '<span class="pill done">Генериран</span>';
  if (gen === 'error') return '<span class="pill err">Грешка</span>';
  if (gen === 'skipped') return '<span class="pill warn">Прескокнат</span>';
  if (c.warnings.some((w) => w.level === 'error')) return '<span class="pill err">Грешка</span>';
  if (c.warnings.some((w) => w.level === 'warn')) return '<span class="pill warn">Провери</span>';
  if (S.existing.has(c.id)) return '<span class="pill exist">Постои</span>';
  return '<span class="pill ok">Во ред</span>';
}
function rowHtml(c, idx) {
  const tpl = templateFor(c);
  const sel = S.selected.has(c.id);
  return `<div class="row ${sel ? 'sel' : ''} ${S.activeId === c.id ? 'active' : ''}" data-id="${esc(c.id)}" data-idx="${idx}" style="transform:translateY(${idx * ROW_H}px);position:absolute;left:0;right:0">
    <div class="c-chk"><input type="checkbox" ${sel ? 'checked' : ''} tabindex="-1"/></div>
    <div class="num">${hl(c.broj)}</div>
    <div style="min-width:0"><div class="nm">${c.tip === 'pravno' ? '<span class="tag legal">ПРАВНО</span>' : ''}${c.edited.length ? '<span class="tag edited">ИЗМЕНЕТО</span>' : ''}${hl(c.ime)}</div>
      <div class="ad">${hl(c.adresa)} · <span class="muted">${hl(c.sifra)}${c.embg ? ` · ${hl(c.embg)}` : ''}</span></div></div>
    <div class="place">${hl(c.mesto)}</div>
    <div class="cnt">${c.items.length}</div>
    <div class="amt">${money(c.vkupenDolg)}</div>
    <div class="amt2">${money(c.vkupnoTroshoci)}</div>
    <div>${tpl ? `<span class="pill ${tpl}">${tpl === 'emb' ? 'ЕМБГ' : 'Стандарден'}</span>` : '<span class="pill err">Нема</span>'}</div>
    <div title="${esc(c.warnings.map((w) => w.text).join('\n'))}">${statusPill(c)}</div>
  </div>`;
}
function renderRows(force) {
  $('#vpad').style.height = `${S.view.length * ROW_H}px`;
  const top = tbody.scrollTop;
  const h = tbody.clientHeight || 600;
  const start = Math.max(0, Math.floor(top / ROW_H) - 6);
  const end = Math.min(S.view.length, Math.ceil((top + h) / ROW_H) + 6);
  const key = `${start}:${end}`;
  if (!force && renderRows.key === key) return;
  renderRows.key = key;
  let html = '';
  for (let i = start; i < end; i++) html += rowHtml(S.view[i], i);
  $('#rows').innerHTML = html;
}
tbody.addEventListener('scroll', () => requestAnimationFrame(() => renderRows(false)), { passive: true });
window.addEventListener('resize', debounce(() => renderRows(true), 60));

const selChanged = () => { renderRows(true); renderSelection(); renderStats(); saveSession(); };
$('#rows').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const id = row.dataset.id;
  const idx = Number(row.dataset.idx);
  if (e.target.matches('input[type=checkbox]') || e.ctrlKey) {
    if (e.shiftKey && S.lastClicked !== null) {
      const [a, b] = [Math.min(S.lastClicked, idx), Math.max(S.lastClicked, idx)];
      const on = !S.selected.has(id);
      for (let i = a; i <= b; i++) on ? S.selected.add(S.view[i].id) : S.selected.delete(S.view[i].id);
    } else S.selected.has(id) ? S.selected.delete(id) : S.selected.add(id);
    S.lastClicked = idx;
    selChanged();
    return;
  }
  S.lastClicked = idx;
  openDrawer(id);
});
$$('.thead .sortable').forEach((h) => h.onclick = () => { S.sort = { key: h.dataset.s, dir: S.sort.key === h.dataset.s ? -S.sort.dir : 1 }; refresh(); });
$('#chkAll').onchange = (e) => { for (const c of S.view) e.target.checked ? S.selected.add(c.id) : S.selected.delete(c.id); selChanged(); };

// ---------------- stats / selection / rules ----------------
function renderStats() {
  if (!S.cases.length) { $('#stats').innerHTML = ''; return; }
  const sel = S.cases.filter((c) => S.selected.has(c.id));
  const sum = (arr, f) => arr.reduce((s, c) => s + f(c), 0);
  const warn = S.cases.filter(FILTERS.warn).length;
  const items = sum(S.cases, (c) => c.items.length);
  const legal = S.cases.filter((c) => c.tip === 'pravno').length;
  const done = S.cases.filter((c) => S.existing.has(c.id) || S.generated.get(c.id) === 'ok').length;
  $('#stats').innerHTML = `
    <div class="stat hero"><div class="lbl"><i></i>Избрани за генерирање</div><div class="val">${nf(sel.length)}<small>/ ${nf(S.cases.length)}</small></div><div class="sub">${moneyShort(sum(sel, (c) => c.vkupenDolg))} ден. главен долг</div></div>
    <div class="stat"><div class="lbl"><i></i>Тужби</div><div class="val">${nf(S.cases.length)}</div><div class="sub">${nf(S.cases.length - legal)} физички · ${nf(legal)} правни</div></div>
    <div class="stat"><div class="lbl"><i style="background:var(--accent-2)"></i>Фактури</div><div class="val">${nf(items)}</div><div class="sub">${nf(done)} тужби веќе генерирани</div></div>
    <div class="stat"><div class="lbl"><i style="background:var(--ok)"></i>Вкупен долг</div><div class="val">${moneyShort(sum(S.cases, (c) => c.vkupenDolg))}<small>ден.</small></div><div class="sub">+ ${moneyShort(sum(S.cases, (c) => c.vkupnoTroshoci))} ден. трошоци</div></div>
    <div class="stat clickable" id="warnStat" title="Прикажи ги само тужбите со предупредување"><div class="lbl"><i style="background:${warn ? 'var(--warn)' : 'var(--ok)'}"></i>Предупредувања</div><div class="val">${warn}</div><div class="sub">${warn ? 'кликнете за преглед' : 'сите податоци се усогласени'}</div></div>`;
  $('#warnStat').onclick = () => setFilter(S.filter === 'warn' ? 'all' : 'warn');
}
function renderSelection() {
  const n = S.selected.size;
  const visSel = S.view.filter((c) => S.selected.has(c.id)).length;
  const all = $('#chkAll');
  all.checked = S.view.length > 0 && visSel === S.view.length;
  all.indeterminate = visSel > 0 && visSel < S.view.length;
  $('#selInfo').innerHTML = n ? `<b>${nf(n)}</b> избрани · ${plural(S.cases.filter((c) => S.selected.has(c.id)).reduce((s, c) => s + c.items.length, 0), 'фактура', 'фактури')}` : 'Ништо не е избрано';
  $('#genBtn').disabled = !(n > 0 && (S.templates.standard || S.templates.embg) && S.outDir && !S.running);
  $('#genLabel').textContent = n ? `Генерирај ${nf(n)} ${n === 1 ? 'документ' : 'документи'}` : 'Генерирај';
}
function renderRuleCount() {
  if (!S.cases.length) { $('#ruleCount').textContent = 'Нема податоци'; return; }
  const r = rules();
  const n = S.cases.filter((c) => eligible(c, r)).length;
  $('#ruleCount').innerHTML = `<span><b>${nf(n)}</b> од ${nf(S.cases.length)} ги исполнуваат</span>`;
}
function applyRules() {
  S.selected = new Set(eligibleIds());
  selChanged();
  toast('info', `Избрани ${plural(S.selected.size, 'тужба', 'тужби')}`, 'според правилата за избор');
}
$('#applyRules').onclick = applyRules;
['#minDolg', '#ruleFiz', '#ruleItems', '#ruleDone'].forEach((s) => $(s).addEventListener(s === '#minDolg' ? 'input' : 'change', () => { renderRuleCount(); saveSession(); }));

function setFilter(f) { S.filter = f; tbody.scrollTop = 0; refresh(); }
$$('#filterChips button').forEach((b) => b.onclick = () => setFilter(b.dataset.f));
$('#sourceSel').onchange = (e) => { S.source = e.target.value; tbody.scrollTop = 0; refresh(); };
$('#mestoSel').onchange = (e) => { S.mesto = e.target.value; tbody.scrollTop = 0; refresh(); };
$('#search').addEventListener('input', debounce((e) => { S.query = e.target.value; tbody.scrollTop = 0; refresh(); }, 90));
$('#exportBtn').onclick = async () => {
  if (!S.view.length) return;
  try { const f = await api.exportView(S.view.map((c) => c.id)); if (f) toast('ok', 'Табелата е извезена', f.split(/[\\/]/).pop()); }
  catch (e) { toast('error', 'Извозот не успеа', cleanErr(e)); }
};

// ---------------- views ----------------
function setView(v) {
  S.viewMode = v;
  $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  $('#tableCard').hidden = v !== 'table';
  $('#charts').hidden = v !== 'charts';
  if (v === 'charts') renderCharts(); else renderRows(true);
}
$$('#viewSeg button').forEach((b) => b.onclick = () => setView(b.dataset.v));

// ---------------- analytics ----------------
function hbars(rows, max, fmt, attr) {
  return rows.map((r) => `<div class="hbar ${r.active ? 'active' : ''}" ${attr(r)} data-tt="${esc(r.label)}" data-t1="${esc(r.t1 || '')}" data-t2="${esc(r.t2 || '')}">
    <div class="hl">${esc(r.label)}</div><div><div class="ht" style="width:${Math.max(0.5, (r.value / max) * 100)}%"></div></div><div class="hv">${fmt(r.value)}</div></div>`).join('');
}
function columns(rows, fmtAxis) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const grid = [1, 2, 3, 4].map((k) => k * step).filter((v) => v <= top).map((v) => `<div class="gl" style="bottom:${(v / top) * 100}%"><span>${fmtAxis(v)}</span></div>`).join('');
  return `<div class="cols-wrap"><div class="cols">${grid}${rows.map((r) => `<div class="col" data-tt="${esc(r.tt)}" data-t1="${esc(r.t1)}" data-t2="${esc(r.t2 || '')}"><i style="height:${(r.value / top) * 100}%"></i></div>`).join('')}</div>
    <div class="xlabels">${rows.map((r, i) => `<span>${rows.length > 14 && i % 2 ? '' : esc(r.label)}</span>`).join('')}</div></div>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function renderCharts() {
  const V = S.view;
  const el = $('#charts');
  if (!V.length) { el.innerHTML = '<div class="chart-card wide"><div class="pal-empty">Нема податоци за приказ</div></div>'; return; }
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  // 1. Debt by place
  const byPlace = new Map();
  for (const c of V) { const p = byPlace.get(c.mesto) || { n: 0, d: 0 }; p.n++; p.d += c.vkupenDolg; byPlace.set(c.mesto, p); }
  let places = [...byPlace.entries()].map(([label, p]) => ({ label, value: p.d, n: p.n })).sort((a, b) => b.value - a.value);
  let restNote = '';
  if (places.length > 12) {
    const rest = places.slice(12);
    restNote = `<div class="csub" style="margin:10px 0 0">+ ${plural(rest.length, 'друго место', 'други места')} · ${moneyShort(sum(rest, (r) => r.value))} ден. · ${plural(sum(rest, (r) => r.n), 'тужба', 'тужби')} — изберете ги од „Сите места“</div>`;
    places = places.slice(0, 12);
  }
  places.forEach((p) => { p.active = p.label === S.mesto; p.t1 = `${moneyShort(p.value)} ден.`; p.t2 = plural(p.n, 'тужба', 'тужби'); });
  const maxP = Math.max(...places.map((p) => p.value));

  // 2. Debt bands
  const bands = [[0, 6000, '< 6 илј.'], [6000, 10000, '6–10 илј.'], [10000, 20000, '10–20 илј.'], [20000, 50000, '20–50 илј.'], [50000, 100000, '50–100 илј.'], [100000, Infinity, '> 100 илј.']]
    .map(([a, b, label]) => { const xs = V.filter((c) => c.vkupenDolg >= a && c.vkupenDolg < b); return { label, value: xs.length, tt: label + ' ден.', t1: plural(xs.length, 'тужба', 'тужби'), t2: `${moneyShort(sum(xs, (c) => c.vkupenDolg))} ден.` }; });

  // 3. Invoices by month
  const byMonth = new Map();
  for (const c of V) for (const it of c.items) { const k = ym(it.ddo); if (!k) continue; const m = byMonth.get(k) || { s: 0, n: 0 }; m.s += it.iznos; m.n++; byMonth.set(k, m); }
  const months = [...byMonth.keys()].sort().slice(-24).map((k) => {
    const m = byMonth.get(k); const [y, mo] = k.split('-');
    return { label: `${MONTHS[Number(mo) - 1]} ${y.slice(2)}`, value: m.s, tt: `${MONTHS[Number(mo) - 1]} ${y}`, t1: `${moneyShort(m.s)} ден.`, t2: plural(m.n, 'фактура', 'фактури') };
  });

  // 4. Person type
  const fiz = V.filter((c) => c.tip === 'fizicko'); const pr = V.filter((c) => c.tip === 'pravno');
  const dF = sum(fiz, (c) => c.vkupenDolg); const dP = sum(pr, (c) => c.vkupenDolg); const dT = dF + dP || 1;

  // 5. Top debtors
  const top = [...V].sort((a, b) => b.vkupenDolg - a.vkupenDolg).slice(0, 8).map((c) => ({ label: c.ime, value: c.vkupenDolg, id: c.id, t1: `${moneyShort(c.vkupenDolg)} ден.`, t2: `Тужба ${c.broj} · ${c.items.length} фактури` }));

  // 6. Costs
  const costs = [['Адвокатска награда', 'advokat'], ['Нотарска награда', 'notarNagrada'], ['Нотарски трошок', 'notarTrosok'], ['Тековна состојба', 'tekovna'], ['Материјален трошок', 'materijal']]
    .map(([label, k]) => ({ label, value: sum(V, (c) => c[k]) })).filter((r) => r.value > 0);
  costs.forEach((r) => { r.t1 = `${moneyShort(r.value)} ден.`; });
  const scope = V.length === S.cases.length ? 'сите тужби' : `${nf(V.length)} прикажани тужби (според филтрите)`;

  el.innerHTML = `
    <div class="chart-card wide"><h4>Долг по место</h4><div class="csub">${scope} · кликнете на место за филтрирање</div>
      ${hbars(places, maxP, (v) => `${compact(v)} ден.`, (r) => `data-mesto="${esc(r.label)}"`)}${restNote}</div>
    <div class="chart-card"><h4>Распределба по висина на долг</h4><div class="csub">Број на тужби по опсег на главен долг</div>${columns(bands, (v) => nf(v))}</div>
    <div class="chart-card"><h4>Физички и правни лица</h4><div class="csub">Удел во вкупниот главен долг</div>
      <div class="split"><div class="sp" data-filter="fiz"><span>Физички лица</span><b>${nf(fiz.length)}</b><small>${moneyShort(dF)} ден. · ${Math.round((dF / dT) * 100)}%</small></div>
      <div class="sp" data-filter="pravno"><span>Правни лица</span><b>${nf(pr.length)}</b><small>${moneyShort(dP)} ден. · ${Math.round((dP / dT) * 100)}%</small></div></div>
      <div class="meter"><i style="width:${(dF / dT) * 100}%"></i><i style="width:${(dP / dT) * 100}%"></i></div></div>
    <div class="chart-card wide"><h4>Неплатени фактури по месец на издавање</h4><div class="csub">Збир на износите по месец (последни ${months.length} месеци)</div>${columns(months, (v) => compact(v))}</div>
    <div class="chart-card"><h4>Најголеми должници</h4><div class="csub">Кликнете за преглед на документот</div>${hbars(top, top[0] ? top[0].value : 1, (v) => moneyShort(v), (r) => `data-open="${esc(r.id)}"`)}</div>
    <div class="chart-card"><h4>Трошоци по постапката</h4><div class="csub">Вкупно ${moneyShort(sum(costs, (r) => r.value))} ден. за ${scope}</div>${hbars(costs, Math.max(...costs.map((r) => r.value), 1), (v) => `${compact(v)} ден.`, () => '')}</div>`;

  $$('#charts [data-mesto]').forEach((b) => b.onclick = () => { S.mesto = S.mesto === b.dataset.mesto ? '' : b.dataset.mesto; renderFilters(); refresh(); });
  $$('#charts [data-open]').forEach((b) => b.onclick = () => openDrawer(b.dataset.open));
  $$('#charts [data-filter]').forEach((b) => b.onclick = () => setFilter(S.filter === b.dataset.filter ? 'all' : b.dataset.filter));
}
// hover tooltips for charts
const tip = $('#tip');
$('#charts').addEventListener('mousemove', (e) => {
  const t = e.target.closest('[data-tt]');
  if (!t) { tip.hidden = true; return; }
  tip.innerHTML = `<b>${esc(t.dataset.tt)}</b>${t.dataset.t1 ? `<span>${esc(t.dataset.t1)}</span>` : ''}${t.dataset.t2 ? `<span>${esc(t.dataset.t2)}</span>` : ''}`;
  tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.min(window.innerWidth - w - 12, e.clientX + 14)}px`;
  tip.style.top = `${e.clientY + 14}px`;
});
$('#charts').addEventListener('mouseleave', () => { tip.hidden = true; });

// ---------------- drawer ----------------
function openDrawer(id) { S.activeId = id; $('#drawer').classList.add('open'); renderRows(true); renderDrawer(); }
function closeDrawer() { S.activeId = null; $('#drawer').classList.remove('open'); renderRows(true); }
function stepDrawer(d) {
  if (!S.view.length) return;
  let i = S.view.findIndex((c) => c.id === S.activeId);
  i = Math.max(0, Math.min(S.view.length - 1, i + d));
  openDrawer(S.view[i].id);
  const top = i * ROW_H;
  if (top < tbody.scrollTop) tbody.scrollTop = top;
  else if (top + ROW_H > tbody.scrollTop + tbody.clientHeight) tbody.scrollTop = top + ROW_H - tbody.clientHeight;
}
$('#dClose').onclick = closeDrawer;
$('#dPrev').onclick = () => stepDrawer(-1);
$('#dNext').onclick = () => stepDrawer(1);
$$('#dTabs button').forEach((b) => b.onclick = () => { S.tab = b.dataset.t; renderDrawer(); });

const EDIT_FIELDS = [
  ['ime', 'Назив / име и презиме', 'full'], ['adresa', 'Адреса', 'full'], ['embg', 'ЕМБГ / ЕДБ'], ['sifra', 'Шифра на корисник'],
  ['vkupenDolg', 'Вкупен долг', 'num'], ['advokat', 'Адвокатска награда', 'num'], ['notarNagrada', 'Нотарска награда', 'num'],
  ['notarTrosok', 'Нотарски трошок', 'num'], ['materijal', 'Материјален трошок', 'num'], ['tekovna', 'Тековна состојба', 'num'],
];

let previewSeq = 0;
async function renderDrawer() {
  const c = S.byId.get(S.activeId);
  if (!c) return closeDrawer();
  $('#dKicker').textContent = `ТУЖБА ${c.broj}/${c.godina}  ·  ШИФРА ${c.sifra}  ·  ${c.mesto}`;
  $('#dTitle').textContent = c.ime;
  $$('#dTabs button').forEach((b) => {
    const t = b.dataset.t;
    const cnt = t === 'items' ? c.items.length : t === 'checks' ? c.warnings.length : t === 'edit' ? c.edited.length : null;
    b.innerHTML = { doc: 'Документ', items: 'Фактури', edit: 'Уреди', checks: 'Проверки' }[t] + (cnt ? `<span class="cnt">${cnt}</span>` : '');
    b.classList.toggle('on', t === S.tab);
  });
  const body = $('#dBody');

  if (S.tab === 'items') {
    body.innerHTML = `
      <div class="kv"><div><span>Вкупен долг</span><b>${money(c.vkupenDolg)}</b></div><div><span>Збир на фактури</span><b style="color:${Math.abs(c.zbirStavki - c.vkupenDolg) > 0.005 ? 'var(--warn)' : 'inherit'}">${money(c.zbirStavki)}</b></div><div><span>Трошоци</span><b>${money(c.vkupnoTroshoci)}</b></div></div>
      <table class="items"><thead><tr><th>#</th><th>Фактура бр.</th><th>Датум</th><th>Валута</th><th class="r">Износ</th></tr></thead>
      <tbody>${c.items.map((it, i) => `<tr><td>${i + 1}</td><td class="mono">${esc(it.faktura)}</td><td>${fdate(it.ddo)}</td><td>${fdate(it.valuta)}</td><td class="r">${money(it.iznos)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td colspan="3">Вкупно</td><td class="r">${money(c.zbirStavki)}</td></tr></tfoot></table>
      <div class="kv" style="margin-top:18px">
        <div><span>Адвокатска награда</span><b>${money(c.advokat)}</b></div><div><span>Нотарска награда</span><b>${money(c.notarNagrada)}</b></div><div><span>Нотарски трошок</span><b>${money(c.notarTrosok)}</b></div>
        <div><span>Материјален трошок</span><b>${money(c.materijal)}</b></div><div><span>Тековна состојба</span><b>${money(c.tekovna)}</b></div><div><span>Долг + трошоци</span><b>${money(c.vkupenDolg + c.vkupnoTroshoci)}</b></div>
      </div>`;
    return;
  }

  if (S.tab === 'edit') {
    const fmtv = (k, v) => (EDIT_FIELDS.find((f) => f[0] === k)[2] === 'num' ? money(v) : v);
    body.innerHTML = `<div class="form">${EDIT_FIELDS.map(([k, label, kind]) => {
      const changed = c.edited.includes(k);
      return `<div class="${kind === 'full' ? 'full' : ''}"><label for="f_${k}"><span>${label}</span>${changed ? `<s title="Оригинал">${esc(fmtv(k, c.orig[k]))}</s>` : ''}</label>
        <input class="inp ${kind === 'num' ? 'mono' : ''} ${changed ? 'changed' : ''}" id="f_${k}" data-k="${k}" value="${esc(fmtv(k, c[k]))}" spellcheck="false"/></div>`;
    }).join('')}</div>
      <div class="form-actions"><button class="btn ghost" id="fRevert" ${c.edited.length ? '' : 'disabled'}>Врати ги оригиналните</button><button class="btn primary" id="fSave">${ICON.check} Зачувај измени</button></div>
      <p class="form-note">Измените важат само во Nalogix (Excel датотеките не се менуваат). Се паметат во сесијата и во проектот, а се означени во табелата и во Excel извештајот.</p>`;
    $('#fSave').onclick = async () => {
      const patch = {};
      $$('#dBody .form .inp').forEach((i) => { patch[i.dataset.k] = EDIT_FIELDS.find((f) => f[0] === i.dataset.k)[2] === 'num' ? parseNum(i.value) : i.value; });
      await updateCase(c.id, patch);
    };
    $('#fRevert').onclick = () => updateCase(c.id, null);
    $$('#dBody .form .inp').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#fSave').click(); }));
    return;
  }

  if (S.tab === 'checks') {
    const ei = c.embgInfo;
    const idcard = ei && ei.birth ? `<div class="section-title">Податоци од ЕМБГ</div><div class="idcard">
      <div><span>Датум на раѓање</span><b>${esc(ei.birth)}</b></div><div><span>Возраст</span><b>${ei.age} год.</b></div>
      <div><span>Пол</span><b>${ei.sex === 'М' ? 'Машки' : 'Женски'}</b></div><div><span>Контролна цифра</span><b style="color:${ei.valid ? 'var(--ok)' : 'var(--warn)'}">${ei.valid ? 'Точна' : 'Неточна'}</b></div></div>` : '';
    const ok = `<div class="check ok">${ICON.ok}<span>Сите проверки се поминати — збирот на фактурите одговара на вкупниот долг.</span></div>`;
    const real = c.warnings;
    body.innerHTML = idcard + '<div class="section-title">Проверки</div>' +
      (real.length ? real.map((w) => `<div class="check ${w.level}">${ICON[w.level === 'error' ? 'error' : w.level === 'info' ? 'info' : 'warn']}<span>${esc(w.text)}</span></div>`).join('') : ok) +
      `<div class="section-title">Детали</div><div class="check" style="background:var(--surface-2);box-shadow:0 0 0 1px var(--line)">${ICON.file}<span>
        Тип: <b>${c.tip === 'pravno' ? 'Правно лице' : 'Физичко лице'}</b> (автоматски препознаено)<br/>Место: ${esc(c.mesto)}<br/>Извор: ${esc(c.source)}<br/>
        Шаблон: ${templateFor(c) === 'emb' ? 'со ЕМБГ' : 'стандарден'} (${S.mode === 'auto' ? 'паметен избор' : 'рачно избран'})<br/>
        Излезна датотека: ${S.existing.has(c.id) ? '<b>веќе постои</b> во излезната папка' : 'сè уште не е генерирана'}</span></div>`;
    return;
  }

  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const seq = ++previewSeq;
  const r = await api.preview(c.id, S.mode, $('#datum').value);
  if (seq !== previewSeq || S.tab !== 'doc') return;
  if (r.error) { body.innerHTML = `<div class="check warn">${ICON.warn}<span>${esc(r.error)}</span></div>`; return; }
  const needles = [c.ime, c.adresa, c.embg, c.sifra, money(c.vkupenDolg), money(c.vkupnoTroshoci), money(c.advokat), money(c.notarTrosok), money(c.notarNagrada), money(c.materijal), ...c.items.map((i) => i.faktura)]
    .filter((x) => x && String(x).length > 2).sort((a, b) => b.length - a.length);
  const reNeedle = S.highlight && needles.length ? new RegExp(needles.map((n) => reEsc(String(n))).join('|'), 'g') : null;
  const mark = (t) => markText(t, reNeedle, '<span class="fill">', '</span>');
  body.innerHTML = `
    <div class="paper-meta"><span>${esc(r.template)}${r.unknown.length ? ` · <b style="color:var(--warn)">непознати: ${esc(r.unknown.join(', '))}</b>` : ''}</span>
      <label class="toggle"><input type="checkbox" id="hlTog" ${S.highlight ? 'checked' : ''}/><span class="sw"></span>Означи пополнети</label></div>
    <div class="paper">${r.paragraphs.map((p) => `<p class="${p.center ? 'c' : p.right ? 'r' : ''}">${p.runs.map((x) => (x.bold ? `<b>${mark(x.text)}</b>` : mark(x.text))).join('') || '&nbsp;'}</p>`).join('')}</div>`;
  $('#hlTog').onchange = (e) => { S.highlight = e.target.checked; renderDrawer(); };
}

async function updateCase(id, patch) {
  try {
    const res = await api.updateCase(id, patch);
    if (!res) return;
    const nc = res.updated;
    // the main process re-validated every case (duplicate шифра/ЕМБГ warnings can change on other rows too)
    S.cases = res.cases;
    S.byId = new Map(S.cases.map((c) => [c.id, c]));
    renderFilters(); refresh(); renderDrawer(); saveSession();
    toast('ok', patch === null ? 'Вратени оригиналните податоци' : 'Измените се зачувани', `Тужба ${nc.broj}`);
  } catch (e) { toast('error', 'Не може да се зачува', cleanErr(e)); }
}

// ---------------- generation ----------------
api.onProgress((p) => {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  $('#progFill').style.width = `${p.phase === 'combined' ? 100 : pct}%`;
  if (p.phase === 'docx') {
    const rate = p.elapsed / Math.max(1, p.done);
    const eta = Math.max(0, Math.round(((p.total - p.done) * rate) / 1000));
    $('#progLabel').textContent = `Генерирам ${nf(p.done)} / ${nf(p.total)}  ·  ${p.last ? p.last.ime : ''}`;
    $('#progEta').textContent = eta ? `уште ~${eta}s` : '';
    if (p.last) S.generated.set(p.last.id, p.last.status === 'warn' ? 'ok' : p.last.status);
    renderRows(true);
  } else if (p.phase === 'combined') { $('#progLabel').textContent = 'Составувам заеднички документ за печатење…'; $('#progEta').textContent = ''; }
  else if (p.phase === 'pdf') { $('#progLabel').textContent = `PDF преку ${p.engine === 'word' ? 'Word' : 'LibreOffice'} ${p.done} / ${p.total}`; $('#progEta').textContent = ''; }
});

async function generate() {
  if (S.running || !S.selected.size || $('#genBtn').disabled) return;
  const ids = S.cases.filter((c) => S.selected.has(c.id)).sort((a, b) => Number(a.broj) - Number(b.broj)).map((c) => c.id);
  const noItems = ids.filter((id) => !S.byId.get(id).items.length).length;
  if (noItems) toast('warn', `${noItems} тужби немаат фактури`, 'Тие документи ќе имаат празна листа на фактури.');
  S.running = true;
  $('#progress').hidden = false; $('#cancelBtn').hidden = false; $('#selInfo').style.display = 'none';
  $('#progFill').style.width = '0%';
  renderSelection();
  try {
    const sum = await api.generate({
      ids, outDir: S.outDir, pattern: $('#pattern').value || 'NPN_{BROJ}', mode: S.mode, subfolder: $('#subfolder').value,
      overwrite: $('#optOverwrite').checked, combined: $('#optCombined').checked, pdf: $('#optPdf').checked && !!S.pdf,
      report: $('#optReport').checked, datum: $('#datum').value,
    });
    // progress events are batched, so take the final status of every case from the summary
    for (const id of sum.doneIds || []) S.generated.set(id, 'ok');
    for (const id of sum.skippedIds || []) S.generated.set(id, 'skipped');
    for (const e of sum.errors) S.generated.set(e.id, 'error');
    await scanExisting();
    showSummary(sum);
  } catch (err) { toast('error', 'Генерирањето не успеа', cleanErr(err), 9000); }
  finally {
    S.running = false;
    $('#progress').hidden = true; $('#cancelBtn').hidden = true; $('#selInfo').style.display = '';
    refresh();
  }
}
function showSummary(s) {
  const secs = (s.elapsed / 1000).toFixed(1);
  const failed = s.errors.length;
  const links = [];
  (s.combined || []).forEach((f) => links.push(`<a data-open="${esc(f)}">📄 ${esc(f.split(/[\\/]/).pop())}</a>`));
  if (s.report) links.push(`<a data-open="${esc(s.report)}">📊 ${esc(s.report.split(/[\\/]/).pop())}</a>`);
  if (s.pdf) links.push(`<span>✓ ${s.pdf} PDF копии</span>`);
  for (const [k, l] of [['pdfError', 'PDF'], ['combinedError', 'Заеднички документ'], ['reportError', 'Извештај']]) if (s[k]) links.push(`<span style="color:var(--err)">${l}: ${esc(s[k])}</span>`);
  openModal(`
    <div class="hero-ico" style="${failed || s.cancelled ? 'background:var(--warn-soft);color:var(--warn)' : ''}">${failed || s.cancelled ? ICON.warn : ICON.ok}</div>
    <h3>${s.cancelled ? 'Генерирањето е прекинато' : failed ? 'Завршено со грешки' : 'Документите се подготвени'}</h3>
    <p>${nf(s.ok + s.warn)} документи се зачувани за ${secs} секунди во<br/><b style="color:var(--text);user-select:text">${esc(s.outDir)}</b></p>
    <div class="grid"><div><b>${s.ok}</b><span>Во ред</span></div><div><b style="color:var(--warn)">${s.warn}</b><span>Со забелешка</span></div><div><b>${s.skipped}</b><span>Прескокнати</span></div><div><b style="color:${failed ? 'var(--err)' : 'inherit'}">${failed}</b><span>Грешки</span></div></div>
    ${failed ? `<div class="errs">${s.errors.map((e) => `<div><b>${esc(e.broj)}</b> ${esc(e.ime)} — ${esc(e.message)}</div>`).join('')}</div>` : ''}
    ${links.length ? `<div class="extra">${links.map((l) => `<div>${l}</div>`).join('')}</div>` : ''}
    <div class="row-btns"><button class="btn ghost" id="mClose">Затвори</button><button class="btn primary" id="mOpen">Отвори папка</button></div>`);
  $('#mClose').onclick = closeModal;
  $('#mOpen').onclick = () => { api.open(s.outDir); closeModal(); };
  $$('#modal [data-open]').forEach((a) => a.onclick = () => api.open(a.dataset.open));
}
$('#genBtn').onclick = generate;
$('#cancelBtn').onclick = () => { api.cancel(); $('#progLabel').textContent = 'Прекинувам…'; };

async function showHistory() {
  const h = await api.history();
  openModal(`<h3>Историја на генерирања</h3><p>Последните ${h.length} генерирања на овој компјутер.</p>
    <div class="scroll">${h.length ? `<table class="hist-table"><thead><tr><th>Кога</th><th>Тужби</th><th class="r">Документи</th><th class="r">Главен долг</th><th>Излез</th></tr></thead><tbody>
    ${h.map((r, i) => `<tr><td>${new Date(r.at).toLocaleString('mk-MK')}${r.cancelled ? '<br/><span style="color:var(--warn)">прекинато</span>' : ''}</td><td>${esc(r.range)}</td>
      <td class="r">${nf(r.count)}${r.errors ? `<br/><span style="color:var(--err)">${r.errors} грешки</span>` : ''}</td><td class="r">${moneyShort(r.debt || 0)}</td>
      <td><a data-h="${i}" data-k="dir">Папка</a>${r.report ? ` · <a data-h="${i}" data-k="report">Извештај</a>` : ''}${(r.combined || []).length ? ` · <a data-h="${i}" data-k="combined">За печатење</a>` : ''}</td></tr>`).join('')}
    </tbody></table>` : '<div class="pal-empty">Сè уште нема генерирања</div>'}</div>
    <div class="row-btns"><button class="btn ghost" id="mClose">Затвори</button></div>`, true);
  $('#mClose').onclick = closeModal;
  $$('#modal [data-h]').forEach((a) => a.onclick = () => {
    const r = h[Number(a.dataset.h)];
    api.open(a.dataset.k === 'dir' ? r.outDir : a.dataset.k === 'report' ? r.report : r.combined[0]);
  });
}
$('#historyBtn').onclick = showHistory;

// ---------------- command palette ----------------
const COMMANDS = [
  { t: 'Генерирај ги избраните', k: 'Ctrl+Enter', i: 'play', run: generate },
  { t: 'Примени ги правилата за избор', i: 'filter', run: applyRules },
  { t: 'Отвори проект…', k: 'Ctrl+O', i: 'folder', run: () => openProject() },
  { t: 'Зачувај проект', k: 'Ctrl+S', i: 'save', run: () => saveProject(false) },
  { t: 'Зачувај проект како…', i: 'save', run: () => saveProject(true) },
  { t: 'Додај Excel датотеки…', i: 'file', run: () => $('#dropzone').click() },
  { t: 'Вчитај сè од папка…', i: 'folder', run: () => $('#scanFolderBtn').click() },
  { t: 'Прикажи табела', i: 'table', run: () => setView('table') },
  { t: 'Прикажи аналитика', i: 'chart', run: () => setView('charts') },
  { t: 'Избери ги сите прикажани', k: 'Ctrl+A', i: 'check', run: () => { S.view.forEach((c) => S.selected.add(c.id)); selChanged(); } },
  { t: 'Поништи го изборот', i: 'x', run: () => { S.selected.clear(); selChanged(); } },
  { t: 'Филтер: само предупредувања', i: 'warn', run: () => setFilter('warn') },
  { t: 'Филтер: само правни лица', i: 'filter', run: () => setFilter('pravno') },
  { t: 'Филтер: негенерирани', i: 'filter', run: () => setFilter('todo') },
  { t: 'Исчисти ги филтрите', i: 'x', run: () => { S.query = ''; $('#search').value = ''; S.mesto = ''; S.source = ''; renderFilters(); setFilter('all'); } },
  { t: 'Извези ја табелата во Excel', i: 'download', run: () => $('#exportBtn').click() },
  { t: 'Отвори ја излезната папка', i: 'folder', run: () => api.open(S.outDir) },
  { t: 'Историја на генерирања', i: 'history', run: showHistory },
  { t: 'Тема: светла', i: 'sun', run: () => setTheme('light') },
  { t: 'Тема: темна', i: 'moon', run: () => setTheme('dark') },
  { t: 'Тема: според системот', i: 'table', run: () => setTheme('system') },
];
let palItems = [];
let palIdx = 0;
function openPalette() {
  $('#palette').hidden = false;
  $('#palInput').value = '';
  renderPalette();
  setTimeout(() => $('#palInput').focus(), 10);
}
function closePalette() { $('#palette').hidden = true; }
function renderPalette() {
  const q = $('#palInput').value.trim().toLowerCase();
  const cmds = COMMANDS.filter((c) => !q || c.t.toLowerCase().includes(q)).map((c) => ({ ...c, group: 'Команди' }));
  let cases = [];
  if (q.length >= 2) {
    const terms = q.split(/\s+/);
    cases = S.cases.filter((c) => {
      if (!c._hay) c._hay = [c.broj, c.ime, c.adresa, c.sifra, c.embg, c.mesto, ...c.items.map((i) => i.faktura)].join(' ').toLowerCase();
      return terms.every((t) => c._hay.includes(t));
    }).sort((a, b) => (a.broj === q ? -1 : b.broj === q ? 1 : 0)).slice(0, 8)
      .map((c) => ({ t: `${c.broj} · ${c.ime}`, sub: `${c.adresa} · ${moneyShort(c.vkupenDolg)} ден.`, i: 'user', group: 'Тужби', run: () => { setView('table'); openDrawer(c.id); } }));
  }
  palItems = /^\d/.test(q) ? [...cases, ...cmds] : [...cmds, ...cases];
  palIdx = Math.min(palIdx, Math.max(0, palItems.length - 1));
  if (!palItems.length) { $('#palList').innerHTML = '<div class="pal-empty">Нема резултати</div>'; return; }
  let html = ''; let g = '';
  palItems.forEach((it, i) => {
    if (it.group !== g) { g = it.group; html += `<div class="pal-group">${g}</div>`; }
    html += `<div class="pal-item ${i === palIdx ? 'on' : ''}" data-i="${i}"><div class="pi">${ICON[it.i] || ICON.info}</div><div class="pt">${esc(it.t)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>${it.k ? `<span class="pk">${it.k}</span>` : ''}</div>`;
  });
  $('#palList').innerHTML = html;
  const on = $('#palList .pal-item.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}
function runPal(i) { const it = palItems[i]; closePalette(); if (it) it.run(); }
$('#palInput').addEventListener('input', () => { palIdx = 0; renderPalette(); });
$('#palInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(palItems.length - 1, palIdx + 1); renderPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); renderPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); runPal(palIdx); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
});
$('#palList').addEventListener('click', (e) => { const it = e.target.closest('.pal-item'); if (it) runPal(Number(it.dataset.i)); });
$('#palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') closePalette(); });
$('#cmdBtn').onclick = openPalette;

// ---------------- sidebar controls ----------------
function setOutDir(d, quiet) {
  S.outDir = d; $('#outPath').textContent = d; $('#outBtn').title = d;
  if (!quiet) { api.setSettings({ outDir: d }); scanExisting().then(() => refresh()); saveSession(); }
}
$('#dropzone').onclick = async () => { const p = await api.pickExcel(); if (p.length) addPaths(p); };
$('#dropzone').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') $('#dropzone').click(); };
const pickFolder = async () => { const d = await api.pickFolder('Папка со Листа, Ставки и шаблони'); if (d) scanFolder(d); };
$('#scanFolderBtn').onclick = pickFolder;
$('#emptyFolderBtn').onclick = pickFolder;
$('#outBtn').onclick = async () => { const d = await api.pickFolder('Излезна папка'); if (d) setOutDir(d); };
$('#pattern').addEventListener('change', async (e) => { api.setSettings({ pattern: e.target.value }); await scanExisting(); refresh(); saveSession(); });
$('#subfolder').addEventListener('change', (e) => { api.setSettings({ subfolder: e.target.value }); saveSession(); });
['optCombined', 'optReport', 'optPdf', 'optOverwrite'].forEach((id) => $(`#${id}`).addEventListener('change', (e) => { api.setSettings({ [id]: e.target.checked }); saveSession(); }));
$('#datum').addEventListener('change', () => S.activeId && renderDrawer());

// ---------------- drag & drop ----------------
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  if (paths.length) addPaths(paths);
});

// ---------------- keyboard ----------------
window.addEventListener('keydown', (e) => {
  if (!$('#palette').hidden) return;
  if (e.key === 'Escape' && $('#themeMenu')) return closeThemeMenu();
  // while a dialog is open only Esc works (Ctrl+Enter must not start a run behind the summary dialog)
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  const inInput = e.target.matches('input:not([type=checkbox]), select, textarea');
  const onControl = e.target.matches('button, a, [role=button], summary');
  const k = e.key.toLowerCase();
  if (e.ctrlKey && (k === 'k' || k === 'p')) { e.preventDefault(); return openPalette(); }
  if (e.ctrlKey && k === 'f') { e.preventDefault(); setView('table'); $('#search').focus(); $('#search').select(); return; }
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); return generate(); }
  if (e.ctrlKey && k === 's') { e.preventDefault(); return saveProject(e.shiftKey); }
  if (e.ctrlKey && k === 'o') { e.preventDefault(); return openProject(); }
  if (e.key === 'Escape') {
    if (inInput && e.target.id === 'search' && S.query) { e.target.value = ''; S.query = ''; refresh(); return; }
    if (S.activeId) return closeDrawer();
  }
  if (inInput) return;
  if (e.ctrlKey && k === 'a') { e.preventDefault(); S.view.forEach((c) => S.selected.add(c.id)); selChanged(); }
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && S.view.length && S.viewMode === 'table') { e.preventDefault(); stepDrawer(e.key === 'ArrowDown' ? 1 : -1); }
  if (e.key === ' ' && S.activeId && !onControl) { e.preventDefault(); S.selected.has(S.activeId) ? S.selected.delete(S.activeId) : S.selected.add(S.activeId); selChanged(); }
});
// flush the debounced session save when the window closes
window.addEventListener('beforeunload', () => { if (S.filePaths.length) api.saveSession(snapshot()); });

// ---------------- init ----------------
(async () => {
  const init = await api.init();
  S.init = init;
  const s = init.settings || {};
  document.documentElement.classList.toggle('no-mica', !init.mica);
  setTheme(s.theme || 'system', false); // main already applied it before the window was shown
  api.onOpenProject((p) => openProject(p));
  S.templates = init.templates;
  setOutDir(init.defaultOut, true);
  setMode(s.mode || 'auto', true);
  if (s.pattern) $('#pattern').value = s.pattern;
  if (s.subfolder) $('#subfolder').value = s.subfolder;
  for (const id of ['optCombined', 'optReport', 'optOverwrite']) if (typeof s[id] === 'boolean') $(`#${id}`).checked = s[id];
  renderTemplates();
  renderFilters();
  refresh();
  if (init.openProject) openProject(init.openProject);

  S.pdf = await api.pdfEngine();
  $('#pdfNote').textContent = S.pdf === 'word' ? '(преку Microsoft Word)' : S.pdf === 'libreoffice' ? '(преку LibreOffice)' : '(потребен е Word или LibreOffice)';
  $('#pdfToggle').classList.toggle('disabled', !S.pdf);
  $('#optPdf').checked = !!S.pdf && !!s.optPdf;
})();
