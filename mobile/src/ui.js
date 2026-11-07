// Small UI helpers shared by all mobile screens.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const money = (v) => {
  const n = Number(v) || 0;
  const [i, d] = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
};
export const moneyShort = (v) => money(v).replace(/,00$/, '');
export const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace('.', ',')} мил.` : v >= 1e3 ? `${Math.round(v / 1e3)} илј.` : String(Math.round(v)));
export const nf = (n) => Number(n).toLocaleString('mk-MK');
export const plural = (n, one, many) => `${nf(n)} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const pad = (n) => String(n).padStart(2, '0');
export const fdate = (v) => {
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; }
  return String(v ?? '');
};
export const parseNum = (s) => {
  let t = String(s ?? '').replace(/[\s ]/g, '').replace(/ден\.?$/i, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t) || 0;
};

/** Escapes text and wraps regex matches (matching runs on the raw text, never inside entities). */
export function markText(text, re, open = '<mark>', close = '</mark>') {
  const s = String(text ?? '');
  if (!re) return esc(s);
  re.lastIndex = 0;
  let out = '', last = 0, m;
  while ((m = re.exec(s))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(s.slice(last, m.index)) + open + esc(m[0]) + close;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

const P = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}/></svg>`;
export const ICON = {
  plus: P('M12 5v14M5 12h14'),
  upload: P('M12 15V4m0 0-4 4m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'),
  list: P('M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'),
  chart: P('M5 20V11M12 20V5M19 20v-6'),
  send: P('M5 12h14m-6-6 6 6-6 6'),
  search: P('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-3.5-3.5'),
  x: P('M6 6l12 12M18 6 6 18'),
  check: P('m5 12.5 4.5 4.5L19 7.5'),
  down: P('m6 9 6 6 6-6'),
  left: P('m15 6-6 6 6 6'),
  right: P('m9 6 6 6-6 6'),
  sun: P('M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4'),
  moon: P('M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z'),
  system: P('M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 20h8M12 16v4'),
  ok: P('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-4-8.5 2.7 2.7L16 9.8'),
  warn: P('M12 3 2 20h20zM12 10v4.5M12 17.3v.2'),
  error: P('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13.5v5.5M12 16.2v.3'),
  info: P('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v5.5M12 7.8v.2'),
  file: P('M6 3h8l4 4v14H6zM14 3v4h4'),
  share: P('M12 3v12M12 3 8 7m4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'),
  download: P('M12 4v11m0 0-4-4m4 4 4-4M5 19h14'),
  trash: P('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'),
  filter: P('M4 5h16l-6 7v6l-4 2v-8z'),
  doc: P('M6 3h8l4 4v14H6zM9 12h6M9 15.5h6M9 19h3.5'),
};
/** Fills every <span class="ico" data-icon="name"> in a root. */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) if (!el.firstChild) el.innerHTML = ICON[el.dataset.icon] || '';
}

export function toast(kind, title, text = '', ms = 3800) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="ico">${ICON[kind] || ICON.info}</span><div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
  $('#toasts').appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  el.addEventListener('click', kill);
  setTimeout(kill, ms);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}

/** Bottom-sheet dialog. Returns a close() function. onClose runs once on any close (backdrop / back button / close()). */
export function dialog(html, { onClose } = {}) {
  const host = $('#dialog');
  host.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`;
  host.hidden = false;
  hydrateIcons(host);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    host.hidden = true;
    host.innerHTML = '';
    window.removeEventListener('popstate', onPop);
    if (history.state && history.state.dialog) history.back();
    if (onClose) onClose();
  };
  const onPop = () => { if (!closed) { closed = true; host.hidden = true; host.innerHTML = ''; window.removeEventListener('popstate', onPop); if (onClose) onClose(); } };
  history.pushState({ dialog: true }, ''); // Android back button closes the dialog
  window.addEventListener('popstate', onPop);
  host.onclick = (e) => { if (e.target === host) close(); };
  return close;
}

// Toasts get out of the way as soon as the user scrolls (otherwise they can cover controls near the bottom).
let scrollHide = null;
window.addEventListener('scroll', () => {
  const host = document.querySelector('#toasts');
  if (!host || !host.children.length) return;
  host.classList.add('away');
  clearTimeout(scrollHide);
  scrollHide = setTimeout(() => host.classList.remove('away'), 1200);
}, { passive: true });

export const haptic = (ms = 8) => /* number or pattern */ { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
