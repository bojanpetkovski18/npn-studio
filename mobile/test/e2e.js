// Drives the real mobile app in Electron with phone emulation (390×844, touch, DPR 3) and saves screenshots.
//   electron mobile/test/e2e.js <dataDir> <outDir> <phase> [light|dark]
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve');

const [dataDir, outDir, phase = '1', theme = 'light'] = process.argv.slice(-4);
// GitHub's Ubuntu 24.04 runners block the user namespaces Chromium's sandbox needs. Tests only load the local
// test server, so the sandbox is switched off on CI only.
if (process.env.CI) app.commandLine.appendSwitch('no-sandbox');
// The test window sits off-screen; since Electron 44 Chromium treats that as occluded and stops producing frames
// (screenshots and animation waits then hang). Keep it painting like a visible window.
for (const sw of ['disable-backgrounding-occluded-windows', 'disable-renderer-backgrounding', 'disable-background-timer-throttling']) app.commandLine.appendSwitch(sw);
const W = 390, H = 844;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[e2e]', ...a);

process.on('uncaughtException', (e) => { console.log('[e2e] UNCAUGHT', e && e.stack); });
process.on('unhandledRejection', (e) => { console.log('[e2e] UNHANDLED', e && e.stack); });
log('args', JSON.stringify({ dataDir, outDir, phase, theme }));
app.whenReady().then(async () => {
  log('ready');
  fs.mkdirSync(outDir, { recursive: true });
  await session.defaultSession.clearStorageData(); // fresh install every run
  const { server, url } = await start(0, dataDir);
  log('server', url);
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: false, backgroundThrottling: false } }); // hidden windows otherwise get ~1 frame/s
  win.setPosition(-4000, 0); win.showInactive(); // visible (real frames) but off-screen
  const wc = win.webContents;
  wc.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  // Electron 44 event object: level is 'debug' | 'info' | 'warning' | 'error'
  wc.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') log('CONSOLE', e.message, e.sourceId ? `${e.sourceId.split('/').pop()}:${e.lineNumber}` : ''); });
  wc.on('render-process-gone', (_e, d) => log('RENDERER GONE', d.reason));
  await win.loadURL('about:blank'); // the DevTools target must exist before emulation commands
  wc.debugger.attach('1.3');
  log('debugger attached');
  await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });

  const js = (code) => wc.executeJavaScript(code);
  const shot = async (name) => { await js("Promise.all(document.getAnimations().map((x) => x.finished.catch(() => {}))).then(() => 0)"); await wait(60); fs.writeFileSync(path.join(outDir, `${phase}-${name}.png`), (await wc.capturePage()).toPNG()); log('shot', name); };
  const tap = async (sel) => {
    // let entrance animations (sheets, dialogs) settle first – a real finger can't hit a moving target either
    await js('Promise.all(document.getAnimations().map((x) => x.finished.catch(() => {}))).then(() => 0)');
    const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) throw new Error(`tap: ${sel} not found`);
    // what would a finger actually hit? (overlays like toasts or the tab bar can cover the target)
    const hit = await js(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); const h = document.elementFromPoint(${r.x}, ${r.y}); return !h ? 'nothing' : (t === h || t.contains(h)) ? 'ok' : (h.closest('.toast') ? 'toast' : h.className || h.tagName); })()`);
    if (hit !== 'ok') log(`note: tap on ${sel} is covered by "${hit}"`);
    await wc.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
    await wc.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(250);
  };
  const noHScroll = async (where) => {
    const w = await js('[document.documentElement.scrollWidth, window.innerWidth]');
    if (w[0] > w[1]) log(`FAIL horizontal scroll on ${where}: ${w[0]} > ${w[1]}`); else log(`ok no horizontal scroll (${where})`);
  };
  /** Feeds real files to an <input type=file> through DataTransfer (what the OS picker would do). */
  const pick = async (inputSel, names) => {
    await js(`(async () => {
      const dt = new DataTransfer();
      for (const n of ${JSON.stringify(names)}) {
        const r = await fetch('/__data/' + encodeURIComponent(n));
        dt.items.add(new File([await r.blob()], n));
      }
      const i = document.querySelector(${JSON.stringify(inputSel)});
      i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  };
  const ctx = { js, shot, tap, wait, log, pick, noHScroll, dataDir, outDir, url, wc };

  try {
    await win.loadURL(url);
    await wait(800);
    const scenario = require(`./phase${phase}.js`);
    await scenario(ctx);
    log('PHASE', phase, 'DONE');
  } catch (e) {
    log('ERROR', e && e.stack || e);
    process.exitCode = 1;
  }
  server.close();
  app.quit();
});
