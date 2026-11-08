# Progress

## Milestones

| # | Branch | Scope | Status |
|---|--------|-------|--------|
| 0 | `#0-npn-implementation` | Shared engine, desktop app (Windows), mobile PWA, Android app, fictional samples, tests, CI | done – PR to `dev` |
| 1 | `#0001-github-pages-deploy` | Publish the PWA (`mobile/dist`) on GitHub Pages over HTTPS; verify install + offline on a real phone | next – waits for the owner's Pages site |
| 2 | `#0002-demo-and-portfolio` | README screenshots in both themes, portfolio kit, release notes | planned |

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

## Known issues

| Issue | Plan |
|-------|------|
| PDF export (desktop) needs Word or LibreOffice; neither is installed on machine A, so it is untested | test on a machine with Word before relying on it |
| iOS native app not built (needs a Mac) | iPhone users use the PWA after milestone 1 |
| Windows exe is unsigned (SmartScreen warning) | code-signing certificate is the owner's decision |
| `npm audit` moderate advisories in dev-only tooling (Capacitor CLI → `xcode`, electron-builder) | re-check when newer versions are two weeks old |
| First CI run on the PR failed in the `app` job: Chromium's Linux sandbox aborted before the tests started. Fixed (`--no-sandbox` on the command line on Linux CI) and verified in an Ubuntu 24.04 container | confirm the PR's next CI run is green; check CI on `dev` after the merge |
| No licence chosen | owner's choice before a release (playbook §16) |
| Real-data checks (the owner's own files) run only locally, never in CI | by design (D-006) |
| CSP allows `style-src 'unsafe-inline'` (desktop and mobile); scripts are same-origin only | move inline styles to classes, then drop it (polish milestone) |

## Next step

Milestone 1: when the owner's GitHub Pages site exists, publish `mobile/dist` there and check install + offline on a real phone.
