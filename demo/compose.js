// Composes the demo frames (1920×1080) and the thumbnail (1280×960) from the captured screenshots and
// demo/captions.json. Captions are drawn on their own page, so the app itself is never modified.
//   electron demo/compose.js <desktopShotsDir> <phoneShotsDir> <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const [desktopDir, phoneDir, outDir] = process.argv.slice(-3);
const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'captions.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(desktopDir, 'desktop.json'), 'utf8'));
// numbers in captions come from the recorded run itself, so a caption can never disagree with its screenshot
const seconds = (meta.summary.match(/за ([\d.,]+) секунди/) || [])[1];
if (!seconds) throw new Error(`no timing in the recorded summary: ${meta.summary}`);
for (const f of C.frames) f.text = f.text.replace('{selected}', meta.selected).replace('{seconds}', seconds);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const img = (dir, name) => pathToFileURL(path.join(dir, `${name}.png`)).href;

const BASE = `
*{box-sizing:border-box;margin:0}
body{width:1920px;height:1080px;overflow:hidden;font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;color:#eef0ff;
  background:radial-gradient(1200px 800px at 72% 42%,rgba(91,104,255,.30),transparent 60%),radial-gradient(900px 700px at 10% 100%,rgba(122,77,255,.18),transparent 60%),#0b0d1c}
.word{font-weight:800;letter-spacing:-.03em;line-height:1}.word i{font-style:normal;background:linear-gradient(135deg,#8fa2ff,#b493ff);-webkit-background-clip:text;color:transparent}
.stack{letter-spacing:.32em;color:#9aa3d6;font-size:24px}
`;

function titlePage() {
  const t = C.title;
  return `<style>${BASE}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center}
  .logo{width:120px;height:120px;border-radius:30px;box-shadow:0 20px 60px -20px rgba(91,104,255,.9)}
  .word{font-size:150px}.line{font-size:38px;color:#cfd4f6;max-width:1300px;line-height:1.3;text-wrap:balance}
  .chips{display:flex;gap:18px}.chips span{border:2px solid rgba(143,162,255,.55);border-radius:40px;padding:12px 28px;font-size:28px;color:#e2e6ff}
  </style><div class="wrap"><img class="logo" src="${pathToFileURL(path.join(__dirname, '..', 'build', 'icon.png')).href}">
  <div class="word">${esc(t.word[0])}<i>${esc(t.word[1])}</i></div><div class="line">${esc(t.line)}</div>
  <div class="chips">${t.chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div><div class="stack">${esc(t.stack)}</div></div>`;
}

function captionPage(f, i, n) {
  const dashes = Array.from({ length: n }, (_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('');
  const left = `<div class="left"><div class="num"><b>${String(i + 1).padStart(2, '0')}</b> / ${String(n).padStart(2, '0')}</div>
    <h1>${esc(f.title)}</h1><p>${esc(f.text)}</p></div>
    <div class="dashes">${dashes}</div><div class="foot">Nalogix · all data is fictional</div>`;
  let right;
  if (f.phones) {
    right = `<div class="phones">${f.phones.map((p) => `<div class="phone"><img src="${img(phoneDir, p)}"></div>`).join('')}</div>`;
  } else {
    const s = meta.shots.find((x) => x.name === f.shot);
    const [w, h] = s.size;
    const W = 1260, scale = W / w, H = Math.round(h * scale), X = 600, Y = Math.round((1080 - H) / 2) - 20;
    const r = s.rect;
    const pad = 6;
    const hl = r ? `<div class="hl" style="left:${X + r.x * scale - pad}px;top:${Y + Math.max(0, r.y) * scale - pad}px;width:${Math.min(r.w, w - r.x) * scale + pad * 2}px;height:${Math.min(r.h, h - Math.max(0, r.y)) * scale + pad * 2}px"></div>` : '';
    right = `<div class="shot" style="left:${X}px;top:${Y}px;width:${W}px;height:${H}px"><img src="${img(desktopDir, f.shot)}"></div>${hl}`;
  }
  return `<style>${BASE}
  .left{position:absolute;left:72px;top:96px;width:470px}
  .num{font-size:30px;letter-spacing:.12em;color:#8fa2ff;font-family:"Cascadia Mono",Consolas,monospace}.num b{color:#fff}
  h1{font-size:62px;line-height:1.08;margin:28px 0 30px;font-weight:800;letter-spacing:-.02em}
  p{font-size:31px;line-height:1.45;color:#cfd4f6;font-weight:400}
  .dashes{position:absolute;left:72px;top:962px;display:flex;gap:10px}.dashes i{width:34px;height:6px;border-radius:3px;background:rgba(143,162,255,.28)}.dashes i.on{background:linear-gradient(90deg,#8fa2ff,#b493ff)}
  .foot{position:absolute;left:72px;top:994px;font-size:22px;color:#8fa2ff}
  .shot{position:absolute;border-radius:16px;overflow:hidden;box-shadow:0 30px 90px -20px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.12)}.shot img{width:100%;height:100%;display:block}
  .hl{position:absolute;border:4px solid #ffcc4d;border-radius:12px;box-shadow:0 0 0 6px rgba(255,204,77,.18),0 0 40px rgba(255,204,77,.35)}
  .phones{position:absolute;left:620px;top:70px;display:flex;gap:44px}
  .phone{width:392px;height:846px;border-radius:52px;padding:14px;background:#1b1e2e;box-shadow:0 30px 90px -20px rgba(0,0,0,.85),0 0 0 2px rgba(255,255,255,.12)}
  .phone img{width:100%;height:100%;border-radius:40px;display:block;object-fit:cover}
  </style>${left}${right}`;
}

function endPage() {
  const e = C.end;
  return `<style>${BASE}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;text-align:center}
  .word{font-size:120px}.facts{font-size:36px;line-height:1.6;color:#e2e6ff}.facts div:last-child{font-size:26px;color:#9aa3d6}
  .repo{font-size:40px;color:#8fa2ff;font-family:"Cascadia Mono",Consolas,monospace}.note{font-size:30px;color:#cfd4f6}
  </style><div class="wrap"><div class="word">Nalo<i>gix</i></div><div class="facts">${e.facts.map((x) => `<div>${esc(x)}</div>`).join('')}</div>
  <div class="repo">${esc(e.repo)}</div><div class="note">${esc(e.note)}</div></div>`;
}

function thumbPage() {
  const t = C.title;
  return `<style>${BASE}
  body{width:1280px;height:960px}
  .word{position:absolute;left:72px;top:80px;font-size:130px}
  .line{position:absolute;left:76px;top:240px;width:1100px;font-size:36px;color:#dfe3ff;line-height:1.3}
  .stack{position:absolute;left:78px;top:350px;font-size:19px;letter-spacing:.22em}
  .desk{position:absolute;left:72px;top:430px;width:900px;border-radius:14px;overflow:hidden;box-shadow:0 30px 80px -20px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.14)}.desk img{width:100%;display:block}
  .phone{position:absolute;left:930px;top:400px;width:300px;height:700px;border-radius:44px;padding:12px;background:#1b1e2e;box-shadow:0 30px 80px -20px rgba(0,0,0,.9),0 0 0 2px rgba(255,255,255,.14)}
  .phone img{width:100%;height:100%;border-radius:34px;object-fit:cover;object-position:top}
  </style><div class="word">${esc(t.word[0])}<i>${esc(t.word[1])}</i></div><div class="line">Notarial payment orders from two Excel exports</div>
  <div class="stack">${esc(t.stack)}</div><div class="desk"><img src="${img(desktopDir, 'd04-preview')}"></div><div class="phone"><img src="${img(phoneDir, 'demo-cases')}"></div>`;
}

app.whenReady().then(async () => {
  const framesDir = path.join(outDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const w = new BrowserWindow({ width: 1920, height: 1080, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  const tmp = path.join(outDir, '_page.html');
  const render = async (html, file, width = 1920, height = 1080) => {
    w.setContentSize(width, height);
    fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8">${html}`);
    await w.loadFile(tmp);
    await w.webContents.executeJavaScript('Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => document.fonts.ready).then(() => 0)');
    await new Promise((r) => setTimeout(r, 300));
    fs.writeFileSync(file, (await w.webContents.capturePage({ x: 0, y: 0, width, height })).toPNG());
    console.log('[compose]', path.basename(file));
  };
  const n = C.frames.length;
  await render(titlePage(), path.join(framesDir, '00-title.png'));
  for (let i = 0; i < n; i++) {
    const slug = C.frames[i].title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await render(captionPage(C.frames[i], i, n), path.join(framesDir, `${String(i + 1).padStart(2, '0')}-${slug}.png`));
  }
  await render(endPage(), path.join(framesDir, `${String(n + 1).padStart(2, '0')}-end.png`));
  await render(thumbPage(), path.join(outDir, 'thumbnail.png'), 1280, 960);
  fs.rmSync(tmp, { force: true });
  // captions.md, as in the earlier demos
  const md = ['# Nalogix demo: captions', '', ...C.frames.map((f, i) => `${i + 1}. **${f.title}.** ${f.text}`), '',
    `Title slide: Nalogix, ${C.title.line.charAt(0).toLowerCase()}${C.title.line.slice(1)}.`,
    `End slide: ${C.end.facts.join(', ')}, ${C.end.repo}, built with AI assistance, all data is fictional.`, ''];
  fs.writeFileSync(path.join(outDir, 'captions.md'), md.join('\n'));
  // per-frame durations: longer captions stay longer on screen
  const durations = [4.0, ...C.frames.map((f) => Math.round((3.4 + (f.title.length + f.text.length) * 0.036) * 10) / 10), 6.0];
  fs.writeFileSync(path.join(outDir, '_durations.json'), JSON.stringify(durations));
  app.quit();
});
