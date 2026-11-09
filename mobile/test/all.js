'use strict';
// Runs the engine tests and every mobile phase's acceptance scenario; exits non-zero on any FAIL.
//   node mobile/test/all.js [dataDir] [outDir]     (dataDir defaults to the fictional samples/)
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const dataDir = process.argv[2] || path.join(__dirname, '..', '..', 'samples');
const outDir = process.argv[3] || path.join(os.tmpdir(), 'nalogix-mobile-test');
const root = path.join(__dirname, '..', '..');
const electron = require('electron'); // path to the binary when required from Node
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Chromium's Linux sandbox is checked before any JavaScript runs, so on CI (Ubuntu 24.04 runners block the user
// namespaces it needs) the switch must be on the command line; app.commandLine in the test file is too late.
const electronFlags = process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : [];

const run = (label, cmd, args, { minChecks = 0 } = {}) => {
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, env, encoding: 'utf8', timeout: 600000 });
  const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}`;
  const lines = out.split('\n').filter((l) => /\[e2e\] (ok|FAIL|ERROR)|OK|MISMATCH|AssertionError|Error:/.test(l));
  const fails = lines.filter((l) => /FAIL|ERROR|MISMATCH|AssertionError|Error:/.test(l));
  const oks = lines.filter((l) => /\[e2e\] ok|OK/.test(l)).length;
  // a run that exits cleanly without any check is not a pass
  const pass = r.status === 0 && !fails.length && oks >= minChecks;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(28)} ${String(oks).padStart(3)} checks  ${((Date.now() - t) / 1000).toFixed(1)} s`);
  for (const f of fails) console.log('      ', f.trim());
  if (!pass) {
    // show why: the tail of the run's output (crashes before the first check print nothing else)
    console.log(`       exit ${r.status}${r.signal ? `, signal ${r.signal}` : ''}; last output:`);
    for (const l of out.trim().split('\n').slice(-15)) console.log('       |', l.slice(0, 300));
  }
  return pass;
};

let ok = true;
ok = run('engine: output baseline', process.execPath, ['test/baseline.js']) && ok;
ok = run('engine: core unit tests', process.execPath, ['test/core.js', dataDir]) && ok;
ok = run('engine: desktop e2e', process.execPath, ['test/run.js', dataDir, path.join(outDir, 'desktop')]) && ok;
// the real desktop window with an empty settings folder: fresh-install state, restore defaults, clear everything
ok = run('desktop: defaults and reset', electron, [...electronFlags, 'test/desktop-defaults.js'], { minChecks: 19 }) && ok;
const build = spawnSync(process.execPath, ['mobile/build.mjs'], { cwd: root, encoding: 'utf8' });
console.log(build.stdout.trim());
for (const p of ['1', '2', '3', '4', '5']) {
  ok = run(`mobile phase ${p}`, electron, [...electronFlags, 'mobile/test/e2e.js', dataDir, outDir, p, 'light'], { minChecks: 1 }) && ok;
}
console.log(ok ? '\nALL GREEN' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
