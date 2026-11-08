# CLAUDE.md – rules for working on Nalogix

Nalogix turns two Excel exports (Листа на тужби, Ставки по тужби) and a Word template into one *Предлог за нотарски
платен налог* per case. Desktop (Electron, Windows), mobile (PWA) and Android (Capacitor) share one engine.
Read `PROGRESS.md`, `DECISIONS.md` and `docs/SPEC.md` before starting; the milestone brief is in `prompts/`.

## Rules (from the project playbook, made specific)

- **Fictional data only.** Never commit or show real Excel/Word files, names, ЕМБГ/ЕДБ, addresses or the client's
  details. Use `samples/` (regenerate with `node samples/generate.js`). `.gitignore` and `scripts/check.sh repository`
  enforce this (D-006).
- **One engine.** Business logic lives in `src/core/` and stays free of Node built-ins (D-002). Desktop-only I/O goes
  in `src/core/node.js`; mobile-only code in `mobile/src/`.
- **Output must not change by accident.** Any change to a generated document needs `node test/baseline.js --write`
  with a reason in the commit message.
- **Bugs:** write the failing test first, show it failing for the right reason, then fix.
- **Edits:** use the editor for multi-line changes. Shell-scripted edits dropped regex backslashes three times here.
- **Dependencies:** exact versions, at least two weeks old (check `npm view <pkg> time`); log exceptions in DECISIONS.md.
- **Git:** `main` = releases, `dev` = work, one branch per milestone (`#00nn-three-to-seven-words`). Push branches
  only; the owner opens and merges PRs. Never force-push shared branches. Git identity is set per repository.
- **Secrets:** none in the repo. The Android release key and its properties file live outside it (`NALOGIX_SIGNING`).
- **Never claim what was not run.** PDF export (needs Word or LibreOffice) and iOS are not verified.

## Verified commands

| Command | What it does | Last verified |
|---------|--------------|---------------|
| `npm ci` | install exact dependencies | 2026-11-07 |
| `npx --no install-electron` | download the Electron binary (Electron 44 has no install script) | 2026-11-07 |
| `npm start` | run the desktop app | 2026-11-07 |
| `node samples/generate.js` | regenerate the fictional samples | 2026-11-07 |
| `node test/baseline.js` | output baseline (240 sample cases × 2 templates) | 2026-11-07 |
| `node test/core.js` | engine unit tests | 2026-11-07 |
| `node test/run.js` | engine end-to-end (Excel → Word, print document) | 2026-11-07 |
| `npm run test:all` | engine suites + mobile build + mobile phases 1–5 in Electron phone emulation | 2026-11-07 |
| `npm run mobile:build` | build the PWA into `mobile/dist` | 2026-11-07 |
| `npm run mobile:lan` | build and serve the PWA on the local network (plain http) | 2026-11-07 |
| `npm run dist` | build `dist/Nalogix.exe` + `dist/Nalogix-Setup.exe` | 2026-11-07 |
| `npm run android:build` | signed `dist/Nalogix.apk` (needs JAVA_HOME, ANDROID_HOME, NALOGIX_SIGNING) | 2026-11-07 |
| `npm run android:test` | 16 checks on an emulator/phone with the debug APK installed | 2026-11-07 |
| `bash scripts/check.sh` | everything CI runs (engine, app, repository: gitleaks, actionlint, editorconfig) | 2026-11-07 |

Electron from the VS Code terminal: unset `ELECTRON_RUN_AS_NODE` first.
