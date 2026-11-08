// Dev-only: launches the app, loads a data folder, exercises features and saves screenshots.
// electron build/shot.js <dataFolder> <outDir> [dark|light]
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const [dataDir, outDir, theme] = process.argv.slice(-3);
require('../src/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('browser-window-created', async (_e, win) => {
  win.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.log('RENDERER:', e.message); });
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const snap = async (name) => fs.writeFileSync(path.join(outDir, name), (await win.webContents.capturePage()).toPNG());
    try {
      await wait(1200);
      await js(`setTheme(${JSON.stringify(theme)}, false)`);
      await js(`setOutDir(${JSON.stringify(path.join(outDir, 'gen'))}, true)`);
      await wait(300);
      await snap('0-empty.png');
      await js(`(async()=>{ const r = await api.scanFolder(${JSON.stringify(dataDir)});
        await setTemplate('standard', () => api.loadTemplate('standard', r.standard), true);
        await setTemplate('embg', () => api.loadTemplate('embg', r.embg), true);
        S.filePaths = r.excel; await reload(); })()`);
      await wait(1500);
      await snap('1-loaded.png');
      await js(`setFilter('pravno')`); await wait(300);
      await js(`openDrawer(S.view[0].id); S.tab='checks'; renderDrawer()`); await wait(600);
      await snap('2-legal-checks.png');
      await js(`setFilter('all'); S.tab='edit'; openDrawer(S.view[3].id)`); await wait(500);
      await js(`document.querySelector('#f_adresa').value += ' (ИЗМЕНЕТО)'; document.querySelector('#fSave').click()`); await wait(800);
      await snap('3-edit.png');
      await js(`closeDrawer(); setView('charts')`); await wait(800);
      await snap('4-charts.png');
      await js(`setView('table'); openPalette(); document.querySelector('#palInput').value='6780'; document.querySelector('#palInput').dispatchEvent(new Event('input'))`); await wait(400);
      await snap('5-palette.png');
      await js(`closePalette(); document.querySelector('#subfolder').value='tip'; document.querySelector('#optCombined').checked = true; S.selected = new Set(S.view.slice(0, 300).map(c=>c.id)); refresh(); generate();`);
      // hammer the preview while generating (this used to corrupt generated files)
      for (let k = 0; k < 25; k++) { await js(`S.tab='doc'; openDrawer(S.view[${k*7 % 300}].id)`); await wait(60); }
      await js(`closeDrawer()`);
      await wait(5000);
      await snap('6-done.png');
      await js(`closeModal(); document.querySelector('#themeBtn').click()`); await wait(300);
      await snap('8-thememenu.png');
      await js(`closeThemeMenu()`);
      await js(`closeModal(); setFilter('todo')`); await wait(400);
      await snap('7-todo.png');
      console.log('EXISTING', await js('S.existing.size'), 'TODO view', await js('S.view.length'));
    } catch (e) { console.error('SHOT ERROR', e); }
    app.quit();
  });
});
