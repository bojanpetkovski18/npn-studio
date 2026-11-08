// Phase 1 acceptance: shell renders at phone width, tabs switch, theme menu works, no horizontal scroll.
module.exports = async ({ js, shot, tap, wait, log, noHScroll }) => {
  await shot('data');
  await noHScroll('data');
  for (const t of ['cases', 'stats', 'gen']) {
    await tap(`#tabbar [data-tab="${t}"]`);
    const ok = await js(`location.hash === '#${t}' && !document.querySelector('#scr-${t}').hidden`);
    log(ok ? `ok tab ${t}` : `FAIL tab ${t}`);
    await noHScroll(t);
  }
  // back button returns to the previous tab
  await js('history.back()'); await wait(300);
  log((await js('location.hash')) === '#stats' ? 'ok back → stats' : `FAIL back → ${await js('location.hash')}`);
  // theme menu
  await tap('#themeBtn');
  await shot('theme-menu');
  await tap('#dialog [data-v="dark"]');
  log((await js('document.documentElement.dataset.theme')) === 'dark' ? 'ok dark theme' : 'FAIL dark theme');
  log((await js('localStorage.getItem("nalogix.theme")')) === 'dark' ? 'ok theme persisted' : 'FAIL theme persisted');
  await tap('#tabbar [data-tab="data"]');
  await shot('data-dark');
};
