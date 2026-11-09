'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { Worker } = require('worker_threads');
const XLSX = require('xlsx');
const { applyOverride: applyOverrideCore, applyOverrides, templateKind, reportRow } = require('./core/cases');
const { loadAll } = require('./core/node');
const { enrich } = require('./core/analyze');
const { Template, buildValues, previewParagraphs, fileNameFor, safeFileName } = require('./core/docx');

app.setName('Nalogix');
// a separate settings folder (tests, support); it also gets its own single-instance lock
if (process.env.NALOGIX_USER_DATA) app.setPath('userData', process.env.NALOGIX_USER_DATA);
let win;
const state = {
  cases: new Map(),
  overrides: new Map(), // id -> patch of edited fields
  templates: { standard: null, embg: null },
  cancel: false,
  running: false,
};

// ---------- persistence ----------
const userFile = (n) => path.join(app.getPath('userData'), n);
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {} }
const readSettings = () => readJson(userFile('settings.json'), {});
function writeSettings(patch) { const s = { ...readSettings(), ...patch }; writeJson(userFile('settings.json'), s); return s; }

/** Folder the .exe lives in (portable build extracts to temp, so use the env var it sets). */
function appDir() {
  return process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(process.execPath) : process.cwd());
}
/** Where file dialogs open until the user has picked a folder (an installed exe lives deep in AppData). */
const startDir = () => readSettings().lastDataDir || app.getPath('documents');

// Mica needs Windows 11 22H2+ (build 22621). Elsewhere a transparent window would render black, so use a solid colour.
const MICA = process.platform === 'win32' && Number((os.release().split('.')[2]) || 0) >= 22621;
const SOLID_BG = { light: '#f3f4f8', dark: '#16171e' };
const SYMBOL = { light: '#1d1d24', dark: '#e6e6eb' };
const effectiveTheme = () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

function createWindow() {
  const pref = readSettings().theme;
  nativeTheme.themeSource = pref === 'dark' || pref === 'light' ? pref : 'system';
  const t = effectiveTheme();
  win = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 680, show: false, title: 'Nalogix',
    ...(MICA ? { backgroundColor: '#00000000', backgroundMaterial: 'mica' } : { backgroundColor: SOLID_BG[t] }),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: SYMBOL[t], height: 44 },
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  // theme + mica passed in the URL so the first paint already has the right colours (no flash)
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { theme: t, mica: MICA ? '1' : '0' } });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// Opening a .nalogix project by double-click / "Open with"
const argProject = () => process.argv.find((a) => /\.nalogix$/i.test(a) && fs.existsSync(a)) || null;
// One instance only: a second launch (e.g. opening a .nalogix file) is forwarded to the running window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const proj = argv.find((a) => /\.nalogix$/i.test(a) && fs.existsSync(a));
    if (proj) win.webContents.send('open-project', proj);
  });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => app.quit());

// Keep the native title-bar buttons readable when the OS theme flips while following the system theme.
nativeTheme.on('updated', () => {
  if (!win || win.isDestroyed()) return;
  const t = effectiveTheme();
  try { win.setTitleBarOverlay({ color: '#00000000', symbolColor: SYMBOL[t], height: 44 }); } catch {}
  if (!MICA) win.setBackgroundColor(SOLID_BG[t]);
});

// ---------- helpers ----------
function caseSummary(c) {
  return {
    id: c.id, broj: c.broj, godina: c.godina, serija: c.serija, sifra: c.sifra, ime: c.ime, adresa: c.adresa,
    embg: c.embg, vkupenDolg: c.vkupenDolg, tekovna: c.tekovna, notarNagrada: c.notarNagrada,
    notarTrosok: c.notarTrosok, materijal: c.materijal, advokat: c.advokat, vkupnoTroshoci: c.vkupnoTroshoci,
    zbirStavki: c.zbirStavki, warnings: c.warnings, source: c.source,
    tip: c.tip, mesto: c.mesto, edb: c.edb, embgInfo: c.embgInfo,
    edited: c._orig ? Object.keys(state.overrides.get(c.id) || {}) : [],
    orig: c._orig || null,
    items: c.items.map((it) => ({ faktura: it.faktura, ddo: it.ddo, valuta: it.valuta, iznos: it.iznos })),
  };
}

/** Template for a case – the rule lives in core/cases.js (shared with the mobile app). */
function pickTemplate(c, mode) {
  const kind = templateKind(c, mode, { standard: !!state.templates.standard, embg: !!state.templates.embg });
  return kind ? state.templates[kind] : null;
}

async function loadTemplate(kind, filePath) {
  const t = await Template.load(filePath);
  state.templates[kind] = t;
  writeSettings({ [`template_${kind}`]: filePath });
  return templateInfo(kind);
}
function templateInfo(kind) {
  const t = state.templates[kind];
  return t ? { kind, name: t.name, filePath: t.filePath, placeholders: t.placeholders } : null;
}

const applyOverride = (id, patch) => applyOverrideCore(state.cases, state.overrides, id, patch);

const SUBFOLDER = {
  none: () => '',
  template: (c, tpl) => (tpl === state.templates.embg ? 'Со ЕМБГ' : 'Стандарден'),
  mesto: (c) => c.mesto || 'Непознато',
  tip: (c) => (c.tip === 'pravno' ? 'Правни лица' : 'Физички лица'),
  source: (c) => String(c.source || 'Листа').replace(/\.xlsx?$/i, ''),
};
const safeDir = (s) => (s ? safeFileName(s, 80) : '');

// ---------- PDF ----------
function sofficePath() {
  const c = [
    process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], 'LibreOffice', 'program', 'soffice.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'LibreOffice', 'program', 'soffice.exe'),
  ].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || null;
}
function wordAvailable() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "if ([type]::GetTypeFromProgID('Word.Application')) { 'yes' } else { 'no' }"],
      { windowsHide: true, timeout: 15000 }, (err, out) => resolve(!err && String(out).trim() === 'yes'));
  });
}
async function pdfEngine() {
  if (await wordAvailable()) return 'word';
  if (sofficePath()) return 'libreoffice';
  return null;
}

function convertWithWord(files, onProgress) {
  return new Promise((resolve, reject) => {
    const list = path.join(os.tmpdir(), `nalogix_pdf_${Date.now()}.txt`);
    fs.writeFileSync(list, files.join('\r\n'), 'utf8');
    const script = `
$ErrorActionPreference = 'Stop'
$files = Get-Content -LiteralPath '${list.replace(/'/g, "''")}' -Encoding UTF8
$w = New-Object -ComObject Word.Application
$w.Visible = $false; $w.DisplayAlerts = 0
try { $i = 0
  foreach ($f in $files) { $i++
    $d = $w.Documents.Open($f, $false, $true, $false)
    $d.ExportAsFixedFormat([IO.Path]::ChangeExtension($f, '.pdf'), 17)
    $d.Close(0)
    [Console]::Out.WriteLine("P $i"); [Console]::Out.Flush() }
} finally { $w.Quit() }`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    ps.stdout.on('data', (d) => { const m = String(d).match(/P (\d+)/g); if (m) onProgress(Number(m[m.length - 1].slice(2))); });
    let err = ''; ps.stderr.on('data', (d) => { err += d; });
    ps.on('close', (code) => { try { fs.unlinkSync(list); } catch {} code === 0 ? resolve() : reject(new Error(err.trim().split('\n')[0] || `exit ${code}`)); });
  });
}
async function convertWithLibreOffice(files, onProgress) {
  const exe = sofficePath();
  const byDir = new Map();
  for (const f of files) { const d = path.dirname(f); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(f); }
  let done = 0;
  for (const [dir, list] of byDir) {
    for (let i = 0; i < list.length; i += 40) {
      const chunk = list.slice(i, i + 40);
      await new Promise((resolve, reject) => execFile(exe, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, ...chunk],
        { windowsHide: true, timeout: 600000 }, (e) => (e ? reject(e) : resolve())));
      done += chunk.length; onProgress(done);
    }
  }
}

const caseRow = (c, extra = {}) => reportRow(c, state.overrides, extra);
function writeXlsx(file, rows, sheetName) {
  if (!rows.length) throw new Error('Нема редови за извоз');
  const sheet = XLSX.utils.json_to_sheet(rows);
  const sample = rows.slice(0, 300);
  sheet['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.min(60, sample.reduce((m, r) => Math.max(m, String(r[k] ?? '').length + 1), k.length + 2)) }));
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  XLSX.writeFile(wb, file);
  return file;
}

// ---------- IPC: app ----------
ipcMain.handle('app:init', async () => {
  const s = readSettings();
  const dir = appDir();
  const tryLoad = async (kind, candidates) => {
    for (const p of candidates) if (p && fs.existsSync(p)) { try { return await loadTemplate(kind, p); } catch {} }
    return null;
  };
  // only what the user chose earlier: a fresh install starts with no templates and no output folder
  await tryLoad('standard', [s.template_standard]);
  await tryLoad('embg', [s.template_embg]);
  const session = readJson(userFile('session.json'), null);
  return {
    settings: s, appDir: dir, defaultOut: s.outDir || '',
    templates: { standard: templateInfo('standard'), embg: templateInfo('embg') },
    version: app.getVersion(),
    mica: MICA,
    session: session && Array.isArray(session.files) && session.files.some((f) => fs.existsSync(f)) ? session : null,
    recent: (s.recent || []).filter((p) => fs.existsSync(p)),
    openProject: argProject(),
  };
});
ipcMain.handle('app:pdfEngine', () => pdfEngine());
ipcMain.handle('settings:set', (_e, patch) => writeSettings(patch));
// Back to a fresh install. The theme and the recent-projects list are kept; `all` also forgets the loaded data
// and the remembered session. Generation history is never deleted.
const KEEP_ON_RESET = ['theme', 'recent'];
ipcMain.handle('settings:reset', (_e, { all = false } = {}) => {
  const s = readSettings();
  writeJson(userFile('settings.json'), Object.fromEntries(KEEP_ON_RESET.filter((k) => k in s).map((k) => [k, s[k]])));
  state.templates = { standard: null, embg: null };
  if (all) {
    state.cases = new Map();
    state.overrides = new Map();
    try { fs.rmSync(userFile('session.json'), { force: true }); } catch {}
  }
  return true;
});
/** theme: 'system' | 'light' | 'dark' → returns the effective theme ('light' | 'dark'). */
ipcMain.handle('theme:set', (_e, theme) => {
  nativeTheme.themeSource = theme === 'dark' || theme === 'light' ? theme : 'system';
  writeSettings({ theme: nativeTheme.themeSource });
  const t = effectiveTheme();
  try { win.setTitleBarOverlay({ color: '#00000000', symbolColor: SYMBOL[t], height: 44 }); } catch {}
  if (!MICA) win.setBackgroundColor(SOLID_BG[t]);
  return t;
});

// ---------- IPC: dialogs / files ----------
ipcMain.handle('dialog:excel', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Избери „Листа на тужби“ и „Ставки по тужби“', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Excel', extensions: ['xls', 'xlsx', 'xlsm', 'csv'] }], defaultPath: startDir(),
  });
  if (!r.canceled && r.filePaths[0]) writeSettings({ lastDataDir: path.dirname(r.filePaths[0]) });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:folder', async (_e, title) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'], defaultPath: startDir() });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:template', async (_e, kind) => {
  const r = await dialog.showOpenDialog(win, {
    title: kind === 'embg' ? 'Шаблон со ЕМБГ' : 'Стандарден шаблон', properties: ['openFile'],
    filters: [{ name: 'Word', extensions: ['docx'] }], defaultPath: startDir(),
  });
  return r.canceled ? null : loadTemplate(kind, r.filePaths[0]);
});
ipcMain.handle('template:load', (_e, kind, filePath) => loadTemplate(kind, filePath));
ipcMain.handle('folder:scan', (_e, dir) => {
  const entries = fs.readdirSync(dir).filter((f) => !f.startsWith('~$'));
  const find = (re) => { const f = entries.find((x) => re.test(x)); return f ? path.join(dir, f) : null; };
  return {
    excel: entries.filter((f) => /\.(xls|xlsx)$/i.test(f) && !f.startsWith('_')).map((f) => path.join(dir, f)),
    standard: find(/^template\.docx$/i), embg: find(/template.*embg.*\.docx$/i),
  };
});
ipcMain.handle('shell:open', (_e, p) => shell.openPath(p));
ipcMain.handle('shell:show', (_e, p) => shell.showItemInFolder(p));

// ---------- IPC: data ----------
/** Runs loadAll in a worker thread (falls back to in-process if workers are unavailable). */
function loadAllAsync(filePaths) {
  // spawning a worker costs ~200 ms, so small inputs are parsed in-process (they take < 300 ms anyway)
  const bytes = filePaths.reduce((s, f) => { try { return s + fs.statSync(f).size; } catch { return s; } }, 0);
  if (bytes < 3 * 1024 * 1024) return Promise.resolve().then(() => loadAll(filePaths));
  return new Promise((resolve, reject) => {
    let w;
    try {
      // inside app.asar the worker script must be read through Electron's asar-aware fs, which Worker supports
      w = new Worker(path.join(__dirname, 'core', 'worker.js'), { workerData: { filePaths } });
    } catch { try { return resolve(loadAll(filePaths)); } catch (e) { return reject(e); } }
    w.once('message', (m) => (m.ok ? resolve(m.result) : reject(new Error(m.error))));
    w.once('error', () => { try { resolve(loadAll(filePaths)); } catch (e) { reject(e); } });
  });
}

ipcMain.handle('data:load', async (_e, filePaths, overrides) => {
  if (state.running) throw new Error('Почекајте да заврши генерирањето');
  const res = await loadAllAsync(filePaths);
  state.cases = new Map(res.cases.map((c) => [c.id, c]));
  state.overrides = new Map();
  const applied = applyOverrides(state.cases, state.overrides, overrides);
  return {
    files: res.files, cases: [...state.cases.values()].map(caseSummary), itemCount: res.itemCount,
    duplicatesSkipped: res.duplicatesSkipped, overridesApplied: applied,
  };
});

ipcMain.handle('case:update', (_e, id, patch) => {
  const c = applyOverride(id, patch);
  if (!c) return null;
  // re-enrich everything: an edited шифра/ЕМБГ can add or remove duplicate warnings on *other* cases
  enrich([...state.cases.values()]);
  return { updated: caseSummary(c), cases: [...state.cases.values()].map(caseSummary) };
});
ipcMain.handle('case:overrides', () => Object.fromEntries(state.overrides));

ipcMain.handle('out:existing', (_e, outDir, pattern) => {
  if (!outDir || !fs.existsSync(outDir)) return [];
  const names = new Set();
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory() && depth < 1) walk(path.join(d, e.name), depth + 1);
      else if (e.isFile()) names.add(e.name.toLowerCase());
    }
  };
  try { walk(outDir, 0); } catch { return []; }
  return [...state.cases.values()].filter((c) => names.has(fileNameFor(c, pattern).toLowerCase())).map((c) => c.id);
});

ipcMain.handle('preview', async (_e, id, mode, datum) => {
  const c = state.cases.get(id);
  const tpl = c && pickTemplate(c, mode);
  if (!tpl) return { error: !c ? 'Не е пронајдена тужбата' : 'Нема вчитано шаблон' };
  const r = tpl.fill(buildValues(c, { datum })); // text only – no zip needed for a preview
  return { template: tpl.name, unknown: r.unknown, paragraphs: previewParagraphs(r.documentXml) };
});

ipcMain.handle('export:view', async (_e, ids) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Извези ја табелата', defaultPath: path.join(readSettings().outDir || startDir(), `Nalogix_табела_${new Date().toISOString().slice(0, 10)}.xlsx`),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (r.canceled) return null;
  return writeXlsx(r.filePath, ids.map((id) => caseRow(state.cases.get(id))), 'Тужби');
});

// ---------- IPC: projects / session / history ----------
ipcMain.handle('session:save', (_e, data) => { writeJson(userFile('session.json'), { ...data, overrides: Object.fromEntries(state.overrides), savedAt: new Date().toISOString() }); });

ipcMain.handle('project:save', async (_e, data, filePath) => {
  let target = filePath;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Зачувај проект', defaultPath: path.join(startDir(), 'Проект.nalogix'),
      filters: [{ name: 'Nalogix проект', extensions: ['nalogix'] }],
    });
    if (r.canceled) return null;
    target = r.filePath;
  }
  const project = { app: 'Nalogix', version: 1, savedAt: new Date().toISOString(), ...data, overrides: Object.fromEntries(state.overrides) };
  fs.writeFileSync(target, JSON.stringify(project, null, 2), 'utf8');
  const s = readSettings();
  writeSettings({ recent: [target, ...(s.recent || []).filter((p) => p !== target)].slice(0, 6) });
  return target;
});
ipcMain.handle('project:open', async (_e, filePath) => {
  let target = filePath;
  if (!target) {
    const r = await dialog.showOpenDialog(win, { title: 'Отвори проект', properties: ['openFile'], filters: [{ name: 'Nalogix проект', extensions: ['nalogix'] }], defaultPath: startDir() });
    if (r.canceled) return null;
    target = r.filePaths[0];
  }
  const project = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (project.app !== 'Nalogix') throw new Error('Ова не е Nalogix проект');
  const s = readSettings();
  writeSettings({ recent: [target, ...(s.recent || []).filter((p) => p !== target)].slice(0, 6) });
  project.files = Array.isArray(project.files) ? project.files : [];
  project.missing = project.files.filter((f) => !fs.existsSync(f));
  project.filePath = target;
  return project;
});
ipcMain.handle('history:get', () => readJson(userFile('history.json'), []));

// ---------- IPC: generation ----------
ipcMain.handle('gen:cancel', () => { state.cancel = true; });
ipcMain.handle('gen:run', async (_e, opts) => {
  if (state.running) throw new Error('Генерирањето веќе е во тек');
  state.running = true;
  try { return await runGeneration(opts); } finally { state.running = false; }
});

async function runGeneration(opts) {
  const { ids, outDir, pattern, mode, overwrite, combined, pdf, report, datum, subfolder = 'none' } = opts;
  state.cancel = false;
  fs.mkdirSync(outDir, { recursive: true });
  const send = (p) => win && !win.isDestroyed() && win.webContents.send('gen:progress', p);
  const results = [];
  const written = [];
  const combinedXml = { standard: [], embg: [] };
  const started = Date.now();
  const usedNames = new Set();

  for (let i = 0; i < ids.length; i++) {
    if (state.cancel) break;
    const c = state.cases.get(ids[i]);
    if (!c) continue; // data was reloaded since the selection was made
    const tpl = pickTemplate(c, mode);
    const row = { id: c.id, broj: c.broj, ime: c.ime, status: 'ok', file: '', template: tpl ? tpl.name : '', message: '' };
    try {
      if (!tpl) throw new Error('Нема шаблон');
      const dir = path.join(outDir, safeDir(SUBFOLDER[subfolder] ? SUBFOLDER[subfolder](c, tpl) : ''));
      fs.mkdirSync(dir, { recursive: true });
      let name = fileNameFor(c, pattern);
      const key = path.join(dir, name).toLowerCase();
      if (usedNames.has(key)) name = name.replace(/\.docx$/, `_${c.godina || i}.docx`);
      usedNames.add(path.join(dir, name).toLowerCase());
      const file = path.join(dir, name);
      row.file = file;
      if (!overwrite && fs.existsSync(file)) { row.status = 'skipped'; row.message = 'Веќе постои'; }
      else {
        const r = await tpl.render(buildValues(c, { datum }));
        fs.writeFileSync(file, r.buffer);
        written.push(file);
        if (combined) combinedXml[tpl === state.templates.embg ? 'embg' : 'standard'].push(r.documentXml);
        if (r.unknown.length) { row.status = 'warn'; row.message = `Непознати полиња: ${r.unknown.join(', ')}`; }
        else if (c.warnings.some((w) => w.level !== 'info')) { row.status = 'warn'; row.message = c.warnings.map((w) => w.text).join('; '); }
      }
    } catch (err) {
      row.status = 'error';
      row.message = err.code === 'EBUSY' || err.code === 'EPERM' ? 'Датотеката е отворена во друга програма' : err.message;
    }
    results.push(row);
    if (i % 3 === 0 || i === ids.length - 1 || row.status === 'error') send({ phase: 'docx', done: i + 1, total: ids.length, last: row, elapsed: Date.now() - started });
    if (i % 25 === 0) await new Promise((r) => setImmediate(r));
  }

  const extra = {};
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  if (combined && !state.cancel) {
    send({ phase: 'combined', done: 0, total: 1 });
    for (const kind of ['standard', 'embg']) {
      const xmls = combinedXml[kind];
      if (!xmls.length) continue;
      const suffix = combinedXml.standard.length && combinedXml.embg.length ? (kind === 'embg' ? '_ЕМБГ' : '_стандарден') : '';
      const file = path.join(outDir, `_СИТЕ_ЗА_ПЕЧАТЕЊЕ${suffix}_${stamp}.docx`);
      try { fs.writeFileSync(file, await state.templates[kind].combine(xmls)); (extra.combined = extra.combined || []).push(file); }
      catch (err) { extra.combinedError = err.message; }
    }
  }
  if (pdf && !state.cancel && written.length) {
    const engine = await pdfEngine();
    send({ phase: 'pdf', done: 0, total: written.length, engine });
    try {
      if (!engine) throw new Error('Потребен е Microsoft Word или LibreOffice');
      const onP = (n) => send({ phase: 'pdf', done: n, total: written.length, engine });
      await (engine === 'word' ? convertWithWord(written, onP) : convertWithLibreOffice(written, onP));
      extra.pdf = written.length;
    } catch (err) { extra.pdfError = err.message; }
  }
  if (report) {
    try {
      extra.report = writeXlsx(path.join(outDir, `_Извештај_${stamp}.xlsx`), results.map((r) => caseRow(state.cases.get(r.id), {
        'Шаблон': r.template, 'Датотека': r.file ? path.relative(outDir, r.file) : '',
        'Статус': { ok: 'Генериран', warn: 'Со забелешка', skipped: 'Прескокнат', error: 'Грешка' }[r.status], 'Забелешка': r.message,
      })), 'Извештај');
    } catch (err) { extra.reportError = err.message; }
  }

  const summary = {
    cancelled: state.cancel, total: ids.length,
    ok: results.filter((r) => r.status === 'ok').length, warn: results.filter((r) => r.status === 'warn').length,
    skipped: results.filter((r) => r.status === 'skipped').length, errors: results.filter((r) => r.status === 'error'),
    elapsed: Date.now() - started, outDir, doneIds: results.filter((r) => r.status === 'ok' || r.status === 'warn').map((r) => r.id),
    skippedIds: results.filter((r) => r.status === 'skipped').map((r) => r.id), ...extra,
  };
  const hist = readJson(userFile('history.json'), []);
  hist.unshift({
    at: new Date().toISOString(), count: summary.ok + summary.warn, errors: summary.errors.length, skipped: summary.skipped,
    outDir, report: extra.report || null, combined: extra.combined || [], pdf: extra.pdf || 0, cancelled: summary.cancelled,
    debt: results.reduce((s, r) => s + (r.status === 'ok' || r.status === 'warn' ? state.cases.get(r.id).vkupenDolg : 0), 0),
    range: results.length ? `${results[0].broj}–${results[results.length - 1].broj}` : '',
  });
  writeJson(userFile('history.json'), hist.slice(0, 100));
  send({ phase: 'done', done: ids.length, total: ids.length });
  return summary;
}
