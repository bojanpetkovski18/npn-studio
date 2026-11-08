'use strict';
// Phase 6 acceptance on a real Android system (emulator or USB phone with the DEBUG apk installed):
// drives the app's WebView over the DevTools protocol, loads the real Excel files, generates, and checks the
// native share sheet + "Save to Documents" through adb.
//   node mobile/test/android.js <dataDir> <outDir>
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dataDir = process.argv[2] || path.join(__dirname, '..', '..', 'samples');
const outDir = process.argv[3] || path.join(require('os').tmpdir(), 'nalogix-android-test');
const SDK = process.env.ANDROID_HOME;
if (!SDK) throw new Error('ANDROID_HOME is not set – see docs/ANDROID.md');
const ADB = path.join(SDK, 'platform-tools', 'adb.exe');
const PKG = 'mk.nalogix.app';
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[android]', ...a);
const check = (ok, msg) => log(ok ? `ok ${msg}` : `FAIL ${msg}`);
const shot = (name) => { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `6-${name}.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 })); log('shot', name); };

async function cdpConnect() {
  const pid = adb('shell', 'pidof', PKG).split(/\s+/)[0];
  if (!pid) throw new Error('app not running');
  adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
  let targets;
  for (let i = 0; i < 20; i++) {
    try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); if (targets.length) break; } catch {}
    await wait(500);
  }
  const page = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  return { js, close: () => ws.close() };
}
const until = async (js, cond, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(cond)) return true; await wait(300); } return false; };

/** Injects files into an <input type=file> (what the Android picker would hand back). */
async function inject(js, sel, names) {
  await js('window.__inj = []; 0');
  for (const n of names) {
    const b64 = fs.readFileSync(path.join(dataDir, n)).toString('base64');
    for (let i = 0; i < b64.length; i += 400000) await js(`window.__inj.push(${JSON.stringify(b64.slice(i, i + 400000))}); 0`);
    await js(`(() => { const s = atob(window.__inj.join('')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      (window.__files = window.__files || []).push(new File([u], ${JSON.stringify(n)})); window.__inj = []; return 0; })()`);
  }
  await js(`(() => { const dt = new DataTransfer(); for (const f of window.__files) dt.items.add(f); window.__files = [];
    const i = document.querySelector(${JSON.stringify(sel)}); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()`);
}

/** A real finger tap (adb input) on an element – needed where Android requires a genuine user gesture. */
async function tapEl(js, sel) {
  const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' });
    const b = e.getBoundingClientRect(); return { x: (b.left + b.width / 2) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio, vh: innerHeight * devicePixelRatio }; })()`);
  // the WebView may sit below the status bar: offset = screen height - WebView height - navigation bar
  const screenH = Number((adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/) || [])[2] || 0);
  const top = Math.max(0, Math.round((screenH - r.vh) / 2)); // status bar ≈ nav bar region split
  adb('shell', 'input', 'tap', String(Math.round(r.x)), String(Math.round(r.y + top)));
}
const focused = () => (adb('shell', 'dumpsys', 'window').split('\n').find((l) => /mCurrentFocus/.test(l)) || '').trim();

(async () => {
  adb('shell', 'pm', 'clear', PKG); // fresh install state
  adb('shell', 'rm', '-rf', '/sdcard/Documents/Nalogix');
  adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
  await wait(2500);
  let { js, close } = await cdpConnect();
  check((await js('document.documentElement.dataset.platform')) === 'android', 'running as native Android app (Capacitor)');
  check(!(await js('"serviceWorker" in navigator && !!navigator.serviceWorker.controller')), 'no service worker in the native app');
  const insets = await js('getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-top")');
  log('  safe-area top inset from Capacitor:', insets || '(none)');

  // the real system file picker opens from a real finger tap (Android blocks scripted clicks on file inputs)
  await tapEl(js, '.file-btn');
  await wait(3000);
  const focus = focused();
  check(/documentsui|DocumentsActivity|PickActivity|files/i.test(focus), `real tap opens the Android file picker (${focus.slice(0, 80)})`);
  shot('picker');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await wait(1200);

  const { lists: [LIST], items: [ITEMS] } = require('./helpers').dataFiles(dataDir);
  const loaded = require('../../src/core/node').loadAll([LIST, ITEMS].map((x) => path.join(dataDir, x))).cases;
  const N = loaded.length;
  // the app pre-selects by its default rules: main debt ≥ 6 000 ден. and at least one invoice
  const SELECTED = loaded.filter((c) => c.vkupenDolg >= 6000 && c.items.length > 0).length;
  const heroIs = `((document.querySelector("#dataHero h1")||{}).textContent||"").startsWith("${N} ")`;
  await inject(js, '#excelInput', [LIST, ITEMS]);
  check(await until(js, heroIs), `Excel files parsed on the device: ${N} тужби`);
  // template inputs: the screen module listens for the click to remember which slot is being filled
  for (const [slot, file] of [['standard', 'template.docx'], ['embg', 'template_NPN_EMBG.docx']]) {
    await js(`document.querySelector("[data-tpl=${slot}]").click(); 0`);
    await wait(1500);
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // close the picker the click opened
    await wait(1000);
    await inject(js, '#tplInput', [file]);
    check(await until(js, `document.querySelector("#tpl-${slot} b").textContent === ${JSON.stringify(file)}`, 20000), `template ${file} loaded`);
  }
  shot('data');

  // restart the app: data must come back from IndexedDB
  close();
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
  await wait(2500);
  ({ js, close } = await cdpConnect());
  check(await until(js, `${heroIs} && document.querySelector("#tpl-embg b").textContent === "template_NPN_EMBG.docx"`, 30000), 'after app restart: files + templates restored');

  // cases + detail sheet
  await js('location.hash = "#cases"; 0');
  await until(js, 'document.querySelectorAll("#vrows .case").length > 0');
  shot('cases');
  await js('document.querySelector("#vrows .case .main").click(); 0');
  await until(js, '!!document.querySelector("#sheetBody .paper")');
  await wait(500);
  shot('sheet');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // hardware back closes the sheet, app stays open
  await wait(800);
  check(await js('document.querySelector("#sheet").hidden && location.hash === "#cases"'), 'Android back: closes the sheet, stays on Тужби');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await wait(800);
  check((await js('location.hash')) === '#data', 'Android back: from Тужби returns to Податоци');

  // generate all of them
  await js('location.hash = "#gen"; 0');
  await until(js, '!!document.querySelector("#gGo")');
  const t0 = Date.now();
  await js('document.querySelector("#gGo").click(); 0');
  check(await until(js, '!!document.querySelector("#gShare")', 180000), `generated on the device in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  log('  result:', await js('__nalogix.result.count + " docs, " + (__nalogix.blob.size / 1048576).toFixed(1) + " MB, errors " + __nalogix.result.errors.length'));
  shot('done');

  // native save → Documents/Nalogix
  await js('document.querySelector("#gSave").click(); 0');
  await wait(4000);
  const saved = adb('shell', 'ls', '-l', '/sdcard/Documents/Nalogix/').split('\n').filter((l) => /\.zip/.test(l));
  check(saved.length === 1, `saved to Documents/Nalogix: ${saved.join(' ').replace(/\s+/g, ' ').slice(-70)}`);
  if (saved.length) {
    const name = saved[0].trim().split(/\s+/).slice(7).join(' ');
    const local = path.join(outDir, 'from-device.zip');
    execFileSync(ADB, ['pull', `/sdcard/Documents/Nalogix/${name}`, local]);
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(local));
    const docs = Object.keys(zip.files).filter((f) => f.startsWith('Предлози/') && f.endsWith('.docx')).length;
    check(docs === SELECTED, `ZIP pulled from the phone contains ${docs} documents (the ${SELECTED} selected by the default rules)`);
  }

  // native share sheet
  await js('document.querySelector("#gShare").click(); 0');
  await wait(3500);
  const focus2 = adb('shell', 'dumpsys', 'window').split('\n').find((l) => /mCurrentFocus/.test(l)) || '';
  check(/chooser|ResolverActivity|intentresolver|ChooserActivity/i.test(focus2), `Android share sheet opened (${focus2.trim().slice(0, 90)})`);
  shot('share-sheet');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await wait(1000);

  // dark theme follows the system
  adb('shell', 'cmd', 'uimode', 'night', 'yes');
  await wait(2000);
  check((await js('document.documentElement.dataset.theme')) === 'dark', 'follows Android dark mode');
  await js('location.hash = "#stats"; 0');
  await wait(1200);
  shot('stats-dark');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  await js('location.hash = "#data"; 0');
  await wait(600);
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await wait(1500);
  const bg = focused();
  const alive = adb('shell', 'pidof', PKG);
  check(!/mk\.nalogix\.app/.test(bg) && !!alive, `Android back on Податоци minimises the app (still running, pid ${alive})`);
  close();
  log('DONE');
})().catch((e) => { log('ERROR', e.stack || e); process.exitCode = 1; });
