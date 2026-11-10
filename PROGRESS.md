# Progress

## Milestones

| # | Branch | Scope | Status |
|---|--------|-------|--------|
| 0 | `#0-npn-implementation` | Shared engine, desktop app (Windows), mobile PWA, Android app, fictional samples, tests, CI | done – PR to `dev` |
| 1 | `#0001-github-pages-deploy` | Publish the PWA (`mobile/dist`) on GitHub Pages over HTTPS; verify install + offline on a real phone | next – waits for the owner's Pages site |
| 2 | `#0002-demo-and-portfolio` | README screenshots in both themes, portfolio kit, release notes | planned |
| 3 | `#0003-fresh-install-defaults-and-reset` | Desktop: fresh install with no templates or output folder; "Врати почетни поставки" and "Исчисти сè"; a simple screen for lawyers (D-016); every start empty, key column, one-table source, no overwritten documents (D-017) | done – PR to `dev` |

## Measured results

Machine A: AMD Ryzen 7 8840HS, 14 GB RAM, Windows 11 Pro (build 26200), Node 24.20.0, Electron 44.9.3.
Emulator: Android 16 (API 36) x86_64 image, Pixel 7 profile, WHPX acceleration, on machine A.
Data: the fictional `samples/` (240 cases, 1 377 invoices) unless stated otherwise. All measured on 2026-11-07.

| Result | Value | Method |
|--------|-------|--------|
| Output baseline | 240 cases × 2 templates unchanged | `node test/baseline.js` (SHA-256 over every filled document.xml + analysis) |
| Engine render time | 40 documents in 127 ms (~3.2 ms each) | `node test/run.js` |
| Mobile acceptance checks | 48 of 48 pass (phases 1–5) | `npm run test:all` |
| Mobile output = desktop output | 240 of 240 document.xml byte-identical | `mobile/test/phase4.js` |
| Mobile generation, emulated phone | 240 documents in 1.9 s; longest UI-thread stall 19–21 ms | phase 4, Electron phone emulation (390×844) |
| Cancel | stops at start and mid-run; 3 of 3 runs | phase 4 run three times in a row |
| Offline | restart + generate with the network off | phase 5 (Chromium network emulation) |
| PWA installability | 0 Chromium installability errors | phase 5, `Page.getInstallabilityErrors` |
| Android checks | 16 of 16 pass, twice in a row | `npm run android:test` on the emulator |
| Android generation | 222 documents in 2.7 s | same run (222 = cases chosen by the default rules) |
| Desktop start | 0.7 s installed / unpacked; 6.7 s portable exe | time to the main window, PowerShell stopwatch |
| Sizes | portable exe 102 MB, installer 112 MB, APK 4.7 MB | `ls -la dist/` |
| Shipped dependencies | 0 known vulnerabilities | `npm audit --omit=dev --audit-level=moderate` |
| All dependencies, high+ | 0 | `npm audit --audit-level=high` |
| CI `app` job on Linux | 48 of 48, twice in a row (2026-11-08) | `CI=true bash scripts/check.sh app` in an `ubuntu:24.04` container as a non-root user, fresh clone, `xvfb-run` |
| Desktop start, reset, simple view, key column, file names | 38 of 38 checks (2026-11-10) | `npx electron test/desktop-defaults.js`: real window, empty settings folder; template files next to the exe are ignored; simple layout; key column only with 2+ tables; one table = whole source; 12 documents with a pattern without a unique field = 12 files; `NPN_{2}` refused |
| Real data, owner's machine only (never committed) | 1 179 cases, 9 219 invoices joined, 1 179 of 1 179 documents written to disk in 7.1 s (2026-11-10) | a local script (not in the repo) generated every case into a temp folder, counted the files and deleted the folder |
| CI on GitHub (PR run 42498565848, commit e6860ed) | engine, app, repository: all green (2026-11-08); app job 51 s | GitHub Actions jobs API. The first run (7c711da) failed: Chromium's Linux sandbox aborted before the tests; fixed with `--no-sandbox` on Linux CI |

## Known issues

| Issue | Plan |
|-------|------|
| PDF export (desktop) needs Word or LibreOffice; neither is installed on machine A, so it is untested | test on a machine with Word before relying on it |
| iOS native app not built (needs a Mac) | iPhone users use the PWA after milestone 1 |
| The demo video, README screenshots and the Macedonian user guide show the desktop layout before D-016 | re-record and update in milestone 2 |
| The mobile app still has its own rules screen and statistics (D-016 covers the desktop only) | simplify it the same way if users ask |
| Windows exe is unsigned (SmartScreen warning) | code-signing certificate is the owner's decision |
| `npm audit` moderate advisories in dev-only tooling (Capacitor CLI → `xcode`, electron-builder) | re-check when newer versions are two weeks old |
| CI has run only on the PR branch so far | check CI on `dev` after the merge |
| No licence chosen | owner's choice before a release (playbook §16) |
| Real-data checks (the owner's own files) run only locally, never in CI | by design (D-006) |
| CSP allows `style-src 'unsafe-inline'` (desktop and mobile); scripts are same-origin only | move inline styles to classes, then drop it (polish milestone) |

## Next step

Milestone 1: when the owner's GitHub Pages site exists, publish `mobile/dist` there and check install + offline on a real phone.
