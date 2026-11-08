// Renders the app icon (SVG -> 512px PNG) with Electron's offscreen renderer: npx electron build/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b5bfd"/><stop offset="1" stop-color="#7a4dff"/></linearGradient>
<linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b5bfd"/><stop offset="1" stop-color="#6a46e0"/></linearGradient></defs>
<rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/>
<path d="M150 96h146l86 86v234a24 24 0 0 1-24 24H150a24 24 0 0 1-24-24V120a24 24 0 0 1 24-24z" fill="#fff"/>
<path d="M296 96v62a24 24 0 0 0 24 24h62" fill="#dfe4ff"/>
<path d="M178 330V200h34l58 82v-82h40v130h-34l-58-82v82z" fill="url(#n)"/>
<circle cx="372" cy="380" r="70" fill="#18c08f" stroke="#fff" stroke-width="14"/>
<circle cx="372" cy="380" r="46" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="7 7" opacity=".75"/>
<path d="m348 381 16 16 32-33" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 400));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const png = img.resize({ width: 512, height: 512 }).toPNG();
  fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'renderer', 'icon.png'), img.resize({ width: 256, height: 256 }).toPNG());
  app.quit();
});
