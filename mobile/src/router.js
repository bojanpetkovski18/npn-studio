// Router + theme. Kept separate from main.js so screens can import go()/registerScreen() without a circular import.
import { $, $$, ICON, hydrateIcons, dialog, esc } from './ui.js';
import { syncSystemBars } from './native.js';

export const App = {
  tab: 'data',
  theme: 'system',
  screens: {}, // name -> { show() } registered by screen modules
};

// ---------------- theme: system / light / dark (stored per device) ----------------
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const THEMES = [
  { v: 'system', label: 'Според системот', icon: 'system' },
  { v: 'light', label: 'Светла', icon: 'sun' },
  { v: 'dark', label: 'Темна', icon: 'moon' },
];
function paintTheme() {
  const dark = App.theme === 'dark' || (App.theme === 'system' && sysDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  syncSystemBars(dark);
  // status-bar / browser chrome colour follows the app theme, not only the OS
  for (const m of $$('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#121319' : '#f2f3f7');
  $('#themeBtn').innerHTML = ICON[THEMES.find((t) => t.v === App.theme).icon];
  $('#themeBtn').setAttribute('aria-label', `Тема: ${THEMES.find((t) => t.v === App.theme).label}`);
}
export function setTheme(v) {
  App.theme = THEMES.some((t) => t.v === v) ? v : 'system';
  try { localStorage.setItem('nalogix.theme', App.theme); } catch {}
  paintTheme();
}
sysDark.addEventListener('change', () => { if (App.theme === 'system') paintTheme(); });
$('#themeBtn').onclick = () => {
  const close = dialog(`<h3>Изглед</h3><div>${THEMES.map((t) =>
    `<button class="menu-opt ${App.theme === t.v ? 'on' : ''}" data-v="${t.v}"><span class="ico">${ICON[t.icon]}</span>${esc(t.label)}${App.theme === t.v ? `<span class="ico chk">${ICON.check}</span>` : ''}</button>`).join('')}</div>`);
  // listener on the freshly created .dialog element (the host is reused – listening there leaked a handler per open)
  $('#dialog .dialog').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { setTheme(b.dataset.v); close(); } });
};

// ---------------- tabs / routing (hash-based so the Android back button works) ----------------
const TABS = ['data', 'cases', 'stats', 'gen'];
export function go(tab, { replace = false } = {}) {
  if (!TABS.includes(tab)) tab = 'data';
  const changed = App.tab !== tab;
  App.tab = tab;
  for (const t of TABS) $(`#scr-${t}`).hidden = t !== tab;
  for (const b of $$('#tabbar button')) {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  if (`#${tab}` !== location.hash) history[replace ? 'replaceState' : 'pushState']({ tab }, '', `#${tab}`);
  if (changed) window.scrollTo({ top: 0 });
  const s = App.screens[tab];
  if (s && s.show) s.show();
}
$('#tabbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.dialog) return;
  const tab = (location.hash || '#data').slice(1);
  if (TABS.includes(tab) && tab !== App.tab) go(tab, { replace: true });
});

// app bar gets a hairline once content scrolls under it
const onScroll = () => $('.appbar').classList.toggle('scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });

// ---------------- boot ----------------
export function registerScreen(name, impl) { App.screens[name] = impl; }

export function startRouter() {
  try { App.theme = localStorage.getItem('nalogix.theme') || 'system'; } catch {}
  paintTheme();
  hydrateIcons();
  const start = (location.hash || '#data').slice(1);
  go(TABS.includes(start) ? start : 'data', { replace: true });
}
