// Phase 5 acceptance: installable (manifest + SW, checked by Chromium itself), works fully offline after the first
// visit (restart with the network off → data restored → documents generated), analytics tab works.
const path = require('path');
const { loadAll } = require('../../src/core/node');
const { dataFiles, until, setup } = require('./helpers');

module.exports = async (ctx) => {
  const { js, shot, tap, wait, log, wc } = ctx;
  const check = (ok, msg) => log(ok ? `ok ${msg}` : `FAIL ${msg}`);
  const cdp = (m, p = {}) => wc.debugger.sendCommand(m, p);

  const { lists: [LIST], items: [ITEMS] } = dataFiles(ctx.dataDir);
  const n = loadAll([LIST, ITEMS].map((f) => path.join(ctx.dataDir, f))).cases.length;
  const prefix = String(Math.min(...loadAll([LIST, ITEMS].map((f) => path.join(ctx.dataDir, f))).cases.map((c) => Number(c.broj)))).slice(0, -1); // ~10 cases
  await setup(ctx, [LIST, ITEMS]);
  check(await until(js, wait, 'navigator.serviceWorker.ready.then(() => true)', 15000), 'service worker installed');

  // Chromium's own verdicts
  const man = await cdp('Page.getAppManifest');
  check(!man.errors || !man.errors.length, `manifest parses without errors${man.errors && man.errors.length ? ': ' + JSON.stringify(man.errors) : ''}`);
  try {
    const inst = await cdp('Page.getInstallabilityErrors');
    const errs = (inst.installabilityErrors || []).map((e) => e.errorId);
    check(!errs.length, `installable (Chromium installability errors: ${errs.length ? errs.join(', ') : 'none'})`);
  } catch (e) { log('note: installability check unavailable:', e.message); }

  // reload once so the SW controls the page, then go offline and restart
  await js('location.reload()'); await wait(1500);
  check(await until(js, wait, '!!navigator.serviceWorker.controller', 10000), 'page controlled by the service worker');
  await cdp('Network.enable');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check(!(await js('navigator.onLine')), 'network is OFF');
  await js('location.reload()'); await wait(1500);
  check(await until(js, wait, `((document.querySelector("#dataHero h1")||{}).textContent||"").startsWith("${n} ")`, 15000), 'offline restart: app and data restored');
  await shot('offline-data');

  // generate offline (the worker script must come from the cache)
  await tap('#tabbar [data-tab="cases"]');
  // clear the selection: "select all" first if only some are selected, then "remove all"
  await js('document.querySelector("#selectAllBtn").dataset.mode === "all" && document.querySelector("#selectAllBtn").click(); 0');
  await js('document.querySelector("#selectAllBtn").dataset.mode === "none" && document.querySelector("#selectAllBtn").click(); 0');
  check(await until(js, wait, '/ 0 избрани/.test(document.querySelector("#listMeta").textContent)', 5000), 'selection cleared');
  await js('const s=document.querySelector("#search"); s.value="' + prefix + '"; s.dispatchEvent(new Event("input"))'); await wait(400);
  await tap('#selectAllBtn');
  await tap('#tabbar [data-tab="gen"]');
  await tap('#gGo');
  check(await until(js, wait, '!!document.querySelector("#gSave")', 60000), 'offline generation finished');
  log('  offline result:', await js('__nalogix.result.count + " docs, " + (__nalogix.blob.size/1024|0) + " KB"'));
  await shot('offline-done');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // analytics
  await tap('#tabbar [data-tab="stats"]');
  await until(js, wait, '!!document.querySelector("#statsBody .tiles")');
  await shot('stats');
  const place = await js('document.querySelector("[data-place]").dataset.place');
  await tap('[data-place]');
  check((await js('location.hash')) === '#cases' && (await js(`[...document.querySelectorAll("#vrows .case .ad")].every((a) => a.textContent.startsWith(${JSON.stringify(place)}))`)), `tap on "${place}" opens the filtered list`);
  await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await tap('#tabbar [data-tab="stats"]');
  await shot('stats-dark');
};
