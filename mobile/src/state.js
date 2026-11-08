// Shared app state + a tiny event bus so screens stay in sync without knowing about each other.
import { Template } from '../../src/core/docx.js';
import { applyOverride, applyOverrides, templateKind } from '../../src/core/cases.js';
import { enrich } from '../../src/core/analyze.js';
import { store } from './store.js';
import { engine } from './engine.js';
import { debounce } from './ui.js';

export const S = {
  files: [],                  // [{ name, size, data: ArrayBuffer }]
  fileInfo: [],               // result.files from the engine (kind / rows / error)
  cases: [], byId: new Map(),
  overrides: new Map(),       // id -> patch (manual corrections)
  selected: new Set(),
  generated: new Set(),       // ids written in a ZIP on this device
  templates: { standard: null, embg: null },  // { name, data, tpl: Template }
  mode: 'auto',
  rules: { min: 6000, fiz: false, items: true, skipDone: false },
  pattern: 'NPN_{BROJ}',
  options: { combined: true, report: true },
  loading: false,
  itemCount: 0, duplicatesSkipped: 0,
};

const listeners = new Map();
export const on = (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); };
export const emit = (ev, data) => { for (const fn of listeners.get(ev) || []) fn(data); };

export const has = () => ({ standard: !!S.templates.standard, embg: !!S.templates.embg });
export const kindFor = (c) => templateKind(c, S.mode, has());
export const tplFor = (c) => { const k = kindFor(c); return k ? S.templates[k].tpl : null; };

// ---------- persistence ----------
export const saveSession = debounce(() => {
  store.set('session', {
    selected: [...S.selected], generated: [...S.generated], overrides: Object.fromEntries(S.overrides),
    mode: S.mode, rules: S.rules, pattern: S.pattern, options: S.options, savedAt: Date.now(),
  }).catch(() => {});
}, 400);

export async function setTemplate(kind, name, data, persist = true) {
  const tpl = await Template.fromData(data, name); // throws a readable error for non-.docx
  S.templates[kind] = { name, data, tpl };
  if (persist) await store.set(`tpl:${kind}`, { name, data });
  emit('templates');
}
export async function removeTemplate(kind) {
  S.templates[kind] = null;
  await store.del(`tpl:${kind}`);
  emit('templates');
}

/** Parses S.files in the worker, joins, applies saved overrides and selection. */
export async function reloadData({ session } = {}) {
  if (!S.files.length) {
    Object.assign(S, { cases: [], byId: new Map(), fileInfo: [], itemCount: 0, duplicatesSkipped: 0 });
    S.selected.clear();
    emit('data');
    return null;
  }
  S.loading = true;
  emit('loading');
  const t0 = performance.now();
  try {
    const prevIds = S.cases.length ? new Set(S.cases.map((c) => c.id)) : null;
    const prevSel = new Set(S.selected);
    const prevOverrides = Object.fromEntries(S.overrides);
    const res = await engine.load(S.files.map((f) => ({ name: f.name, data: f.data })));
    S.fileInfo = res.files;
    S.cases = res.cases;
    S.byId = new Map(res.cases.map((c) => [c.id, c]));
    S.itemCount = res.itemCount;
    S.duplicatesSkipped = res.duplicatesSkipped;
    S.overrides = new Map();
    const applied = applyOverrides(S.byId, S.overrides, session ? session.overrides : prevOverrides);
    if (session) {
      S.selected = new Set((session.selected || []).filter((id) => S.byId.has(id)));
      S.generated = new Set((session.generated || []).filter((id) => S.byId.has(id)));
    } else {
      // keep manual choices for cases that were already loaded; apply the rules to new ones
      S.selected = new Set(S.cases.filter((c) => (prevIds && prevIds.has(c.id) ? prevSel.has(c.id) : eligible(c))).map((c) => c.id));
    }
    return { ms: Math.round(performance.now() - t0), applied, files: res.files };
  } finally {
    S.loading = false;
    emit('data');
    saveSession();
  }
}

export function eligible(c, r = S.rules) {
  return c.vkupenDolg >= r.min && (!r.fiz || c.tip === 'fizicko') && (!r.items || c.items.length > 0) && (!r.skipDone || !S.generated.has(c.id));
}

/** Manual correction (patch) or revert (null); re-validates every case (duplicates can change elsewhere). */
export function updateCase(id, patch) {
  const c = applyOverride(S.byId, S.overrides, id, patch);
  if (!c) return null;
  enrich(S.cases);
  for (const x of S.cases) x._hay = null;
  emit('cases');
  saveSession();
  return c;
}

export async function restore() {
  const [files, std, emb, session] = await Promise.all([store.get('files'), store.get('tpl:standard'), store.get('tpl:embg'), store.get('session')]);
  for (const [kind, t] of [['standard', std], ['embg', emb]]) {
    if (t) { try { await setTemplate(kind, t.name, t.data, false); } catch {} }
  }
  if (session) {
    S.mode = session.mode || 'auto';
    Object.assign(S.rules, session.rules || {});
    S.pattern = session.pattern || S.pattern;
    Object.assign(S.options, session.options || {});
  }
  if (files && files.length) {
    S.files = files;
    await reloadData({ session });
  }
  emit('restored');
}

export async function addFiles(list) {
  const added = [];
  for (const f of list) {
    const data = await f.arrayBuffer();
    const i = S.files.findIndex((x) => x.name === f.name);
    const entry = { name: f.name, size: f.size, data };
    if (i >= 0) S.files[i] = entry; else S.files.push(entry); // same name = replace (newer export)
    added.push(f.name);
  }
  await store.set('files', S.files);
  return added;
}
export async function removeFile(name) {
  S.files = S.files.filter((f) => f.name !== name);
  await store.set('files', S.files);
}
export async function resetAll() {
  await store.clear();
  Object.assign(S, { files: [], fileInfo: [], cases: [], byId: new Map(), overrides: new Map(), selected: new Set(), generated: new Set(), templates: { standard: null, embg: null } });
  emit('templates'); emit('data');
}
