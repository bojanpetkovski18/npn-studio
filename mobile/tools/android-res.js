// Renders Android launcher icons + splash screens into mobile/android/app/src/main/res.
//   electron mobile/tools/android-res.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const BG = '#4a55fd';
const art = (scale) => `
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
  <path d="M150 96h146l86 86v234a24 24 0 0 1-24 24H150a24 24 0 0 1-24-24V120a24 24 0 0 1 24-24z" fill="#fff"/>
  <path d="M296 96v62a24 24 0 0 0 24 24h62" fill="#dfe4ff"/>
  <path d="M178 330V200h34l58 82v-82h40v130h-34l-58-82v82z" fill="url(#n)"/>
  <circle cx="372" cy="380" r="70" fill="#18c08f" stroke="#fff" stroke-width="14"/>
  <circle cx="372" cy="380" r="46" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="7 7" opacity=".75"/>
  <path d="m348 381 16 16 32-33" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;
const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b5bfd"/><stop offset="1" stop-color="#7a4dff"/></linearGradient>
<linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b5bfd"/><stop offset="1" stop-color="#6a46e0"/></linearGradient></defs>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${body}</svg>`;

// icon variants on a 512 canvas
const ICONS = {
  legacy: svg(512, 512, `<rect x="24" y="24" width="464" height="464" rx="104" fill="url(#g)"/>${art(0.92)}`),
  round: svg(512, 512, `<circle cx="256" cy="256" r="240" fill="url(#g)"/>${art(0.8)}`),
  // adaptive foreground: 108dp canvas, only the inner 66 % is guaranteed visible -> keep the art small
  foreground: svg(512, 512, art(0.6)),
};
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function render(w, html, width, height) {
  w.setContentSize(width, height);
  await w.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${html}</body></html>`));
  await new Promise((r) => setTimeout(r, 250));
  return w.webContents.capturePage({ x: 0, y: 0, width, height });
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  const out = [];
  for (const [kind, s] of Object.entries(ICONS)) {
    const img = await render(w, s, 512, 512);
    for (const [d, f] of Object.entries(DENS)) {
      const size = Math.round((kind === 'foreground' ? 108 : 48) * f);
      const name = { legacy: 'ic_launcher.png', round: 'ic_launcher_round.png', foreground: 'ic_launcher_foreground.png' }[kind];
      fs.writeFileSync(path.join(RES, `mipmap-${d}`, name), img.resize({ width: size, height: size, quality: 'best' }).toPNG());
      out.push(`mipmap-${d}/${name}`);
    }
  }
  // splash: gradient + centred icon (pre-Android-12 devices show this image)
  const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  for (const [d, [pw, ph]] of Object.entries(SPLASH)) {
    for (const [orient, W, H] of [['port', pw, ph], ['land', ph, pw]]) {
      const icon = Math.round(Math.min(W, H) * 0.32);
      const html = `<div style="width:${W}px;height:${H}px;background:linear-gradient(135deg,#3b5bfd,#7a4dff);display:grid;place-items:center">
        <div style="width:${icon}px;height:${icon}px">${svg(512, 512, art(1)).replace('<svg ', `<svg style="width:${icon}px;height:${icon}px" `)}</div></div>`;
      const img = await render(w, html, W, H);
      fs.writeFileSync(path.join(RES, `drawable-${orient}-${d}`, 'splash.png'), img.toPNG());
      if (d === 'mdpi' && orient === 'port') fs.writeFileSync(path.join(RES, 'drawable', 'splash.png'), img.toPNG());
      out.push(`drawable-${orient}-${d}/splash.png`);
    }
  }
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
  console.log(`android resources: ${out.length} images`);
  app.quit();
});
