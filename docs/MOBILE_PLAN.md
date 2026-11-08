# Mobile version – phased plan and status

Goal: the same job as the desktop app (Листа на тужби + Ставки по тужби + Word template → one *Предлог за нотарски
платен налог* per case), on a phone. Everything runs **on the device**: no server, the data never leaves the phone,
and it works **offline**.

## Architecture

- **One shared engine** (`src/core/*`) for desktop and mobile, so the two can never drift. It has no Node built-ins;
  Node-only file access lives in `src/core/node.js` (D-002).
- **Mobile app** = installable PWA in `mobile/`, bundled with esbuild. Parsing and generation run in a Web Worker.
- **Android app** = the same bundle wrapped with Capacitor (`mobile/android`), with native share and save (D-008).
- Output on a phone: one **ZIP** with every `.docx` (+ optional combined print document + Excel report), handed to
  the system share sheet or saved to the device.

## Phases

| # | Phase | Status | Acceptance (checked by `npm run test:all` unless noted) |
|---|-------|--------|---------------------------------------------------------|
| 0 | Shared core: pure engine, Node I/O split out | done | output baseline unchanged for every sample case × 2 templates; core unit tests |
| 1 | Mobile shell: layout, tabs, back button, light/dark/system theme | done | 10 checks: tabs, back, theme menu and persistence, no horizontal scroll at 390 px |
| 2 | Import: Excel/Word on the phone, kind detection, IndexedDB persistence | done | 7 checks: same case count as desktop, broken file flagged without aborting, restored after restart |
| 3 | Cases: windowed list, search, filters, selection, detail sheet, edit | done | 14 checks: ~11 DOM cards for 240 cases, preview text identical to desktop, edit/revert, back closes the sheet |
| 4 | Generate: worker, progress, cancel, ZIP + print doc + report, share/save | done | 8 checks: **document.xml identical to desktop for every case**, UI stall ≤ 21 ms, cancel at start and mid-run |
| 5 | Offline and install: manifest, icons, service worker, analytics | done | 9 checks: Chromium reports no installability errors, restart and generate with the network off |
| 6 | Native Android: Capacitor, native share/save, back button, system bars | done | `npm run android:test` on an Android 16 emulator: 16 checks (see PROGRESS.md) |
| 7 | Release: publish the PWA on GitHub Pages (HTTPS) | next | owner creates the Pages site; see prompts/0001-github-pages.md |

## Test strategy

- `test/baseline.js`, `test/core.js`, `test/run.js`: the shared engine, on the fictional `samples/`.
- `mobile/test/e2e.js` + `phaseN.js`: the real mobile UI in Electron with phone emulation (390×844, touch). They load
  the sample Excel files, generate, unzip the result and compare every `document.xml` with the desktop engine's.
- `mobile/test/android.js`: the debug APK on an emulator or USB phone, driven over the WebView's DevTools protocol
  plus `adb` (real taps, hardware back, share sheet, files pulled back from the device).
