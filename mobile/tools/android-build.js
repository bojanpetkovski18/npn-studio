'use strict';
// One command for the Android app:  npm run android:build  [-- --debug]
// web bundle → Capacitor sync → Gradle (signed release by default) → dist/Nalogix.apk
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const debug = process.argv.includes('--debug');
const env = {
  ...process.env,
};
for (const k of ['JAVA_HOME', 'ANDROID_HOME']) if (!env[k]) throw new Error(`${k} is not set – see docs/ANDROID.md`);
// On Windows, .bat / .cmd files (gradlew.bat, npx) need cmd.exe; call it explicitly instead of `shell: true`
// (which concatenates arguments unescaped, DEP0190). node itself runs directly.
const run = (cmd, args, cwd = root) => (process.platform === 'win32' && cmd !== process.execPath
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmd, ...args], { cwd, env, stdio: 'inherit' })
  : execFileSync(cmd, args, { cwd, env, stdio: 'inherit' }));

run(process.execPath, ['mobile/build.mjs']);
run('npx', ['cap', 'sync', 'android']);
const android = path.join(root, 'mobile', 'android');
if (!fs.existsSync(path.join(android, 'local.properties'))) fs.writeFileSync(path.join(android, 'local.properties'), `sdk.dir=${env.ANDROID_HOME.replace(/\\/g, '/')}\n`);
run(path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), [debug ? 'assembleDebug' : 'assembleRelease', '--console=plain'], android);

const apk = path.join(android, 'app', 'build', 'outputs', 'apk', debug ? 'debug' : 'release', debug ? 'app-debug.apk' : 'app-release.apk');
if (!debug && !fs.existsSync(apk)) throw new Error('release APK not produced – is the signing key present (NALOGIX_SIGNING)?');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', debug ? 'Nalogix-debug.apk' : 'Nalogix.apk');
fs.copyFileSync(apk, out);
console.log(`\n→ ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
