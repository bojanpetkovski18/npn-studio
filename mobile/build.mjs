// Builds the mobile PWA into mobile/dist.   node mobile/build.mjs [--dev]
// - main.js            UI (imports only the light engine modules: cases/analyze/docx/format)
// - engine-worker.js   Web Worker: Excel parsing (SheetJS) + document generation + ZIP, off the UI thread
// - sw.js              offline service worker, cache name derived from the build hash
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const out = join(here, 'dist');
const dev = process.argv.includes('--dev');
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: { main: join(src, 'main.js'), 'engine-worker': join(src, 'engine-worker.js') },
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020', 'chrome90', 'safari15'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(pkg.version) },
  // the engine must never pull Node built-ins into the phone bundle
  external: [],
  logLevel: 'warning',
});

// static files
for (const f of ['index.html', 'styles.css', 'manifest.webmanifest']) cpSync(join(src, f), join(out, f));
cpSync(join(src, 'icons'), join(out, 'icons'), { recursive: true });

// service worker: precache every built file; cache name changes whenever any file changes
const files = [];
const walk = (d, rel = '') => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p, `${rel}${name}/`);
    else files.push(`${rel}${name}`);
  }
};
walk(out);
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(readFileSync(join(out, f)));
const version = hash.digest('hex').slice(0, 10);
const sw = readFileSync(join(src, 'sw.js'), 'utf8')
  .replace('__CACHE__', `nalogix-${pkg.version}-${version}`)
  .replace('__FILES__', JSON.stringify(['./', ...files.filter((f) => f !== 'index.html')]));
writeFileSync(join(out, 'sw.js'), sw);
writeFileSync(join(out, 'version.json'), JSON.stringify({ version: pkg.version, build: version }));

const size = (f) => `${(statSync(join(out, f)).size / 1024).toFixed(0)} KB`;
console.log(`mobile build ${pkg.version}+${version}: main.js ${size('main.js')}, engine-worker.js ${size('engine-worker.js')}`);
