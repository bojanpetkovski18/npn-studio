# Decisions

Numbered, never renumbered. Each entry: date, decision, why, alternatives, trade-offs.

### D-001 · 2026-11-06 · Electron for the desktop app
**Decision:** Electron with a plain HTML/CSS/JS renderer (no framework), packaged by electron-builder.
**Why:** a Windows 11-native look (Mica, title-bar overlay, dark/light) and the same JavaScript engine can later run in a browser.
**Alternatives:** .NET WPF/WinUI (smaller exe, but a second engine for mobile), Tauri (needs Rust; not installed).
**Trade-offs:** ~100 MB exe; the portable build self-extracts on every start (D-010).

### D-002 · 2026-11-07 · One pure engine shared by desktop and mobile
**Decision:** `src/core/*` contains no Node built-ins; file access is in `src/core/node.js`. Desktop and mobile import the same modules.
**Why:** generated documents must be identical on every platform; a second implementation would drift.
**Alternatives:** a separate mobile engine.
**Trade-offs:** small wrappers for I/O. Guarded by `test/baseline.js` and the mobile parity test (phase 4).

### D-003 · 2026-11-06 · Fill Word templates by editing their XML in place
**Decision:** replace `{{PLACEHOLDERS}}` inside the template's own runs (JSZip), merging placeholders that Word split across runs.
**Why:** keeps every bit of the template's formatting (bold, fonts, sizes); the original tool flattened it.
**Alternatives:** docx templating libraries (extra dependencies, own syntax), rebuilding documents from scratch.
**Trade-offs:** regex-based XML handling, so it is covered by unit and baseline tests.

### D-004 · 2026-11-06 · "Smart" template choice
**Decision:** the ЕМБГ template is used only for natural persons with a real ЕМБГ; companies whose ЕМБГ column holds a tax number (ЕДБ) get the standard template.
**Why:** otherwise a company document would print "ЕМБГ <tax number>".
**Alternatives:** always use one template; let the user pick per case.
**Trade-offs:** detection is heuristic (legal-form words, ЕДБ pattern); users can force a template.

### D-005 · 2026-11-07 · Mobile as a PWA first, Android via Capacitor
**Decision:** an installable offline PWA (`mobile/`), then the same bundle wrapped with Capacitor for an APK.
**Why:** one UI for Android and iPhone; everything runs on the device; no app-store dependency.
**Alternatives:** React Native / Flutter (second UI and engine), Capacitor only (no iPhone path without a Mac).
**Trade-offs:** iOS native build needs a Mac (not available); iPhone users use the PWA.

### D-006 · 2026-11-07 · Fictional sample data only in the repository
**Decision:** `samples/generate.js` creates an invented dataset (seeded) and two original templates; tests, CI and the demo use only these. `.gitignore` blocks every other Excel/Word/PDF/ZIP file and `scripts/check.sh repository` fails if one is tracked.
**Why:** the real files contain personal data (names, ЕМБГ, addresses) and a client's details (playbook §12).
**Alternatives:** anonymising real files (risk of leftovers).
**Trade-offs:** sample ЕМБГ numbers use region 99 so they cannot be real.

### D-007 · 2026-11-07 · Generation runs off the UI thread and is cancellable per job
**Decision:** parsing and generation run in a Web Worker (mobile) or a worker thread for large files (desktop). Cancel is tied to a job id, and a cancel that arrives before the job starts is remembered.
**Why:** a 1 000+ document run must not freeze the UI; a regression showed that a cancel sent during the wake-lock wait was lost.
**Trade-offs:** the worker yields to the event loop every 8 documents, which costs a little throughput.

### D-008 · 2026-11-07 · Native share/save on Android
**Decision:** in the Capacitor app the ZIP is written in ~3 MB chunks to the cache (share) or `Documents/Nalogix` (save), through `@capacitor/filesystem` and `@capacitor/share`.
**Why:** the Android WebView has no Web Share API and ignores `<a download>`.
**Trade-offs:** base64 over the bridge; chunking keeps memory bounded.

### D-009 · 2026-11-07 · Electron 44 instead of 38
**Decision:** upgrade the desktop runtime from Electron 38.8.6 to 44.9.3 (Chromium 152, Node 24.22).
**Why:** Electron 38 is out of support (last release 2026-03-11) and `npm audit` reported a high-severity use-after-free fixed only from 39.8.1. 44.9.3 is the newest release of a supported line that is at least two weeks old (playbook §6).
**Alternatives:** Electron 45.0.0 (a .0 release), 44.10.x (under two weeks old).
**Trade-offs:** the exe grew from 87 MB to 102 MB; the test harness needed Chromium's occlusion switches (off-screen window).

### D-010 · 2026-11-07 · Ship a portable exe and a per-user installer
**Decision:** `npm run dist` builds `Nalogix.exe` (portable) and `Nalogix-Setup.exe` (one-click, per-user, no admin).
**Why:** the portable build self-extracts on every launch (6.7 s); installed, it starts in 0.7 s (PROGRESS.md).

### D-011 · 2026-11-07 · Android release key outside the repository
**Decision:** the keystore and its password file live outside the repo; Gradle reads them through `NALOGIX_SIGNING`.
**Why:** no secrets in the repository (playbook §11); losing the key would block updates, so the owner backs it up.

### D-012 · 2026-11-07 · Dependency versions
**Decision:** exact versions only, each at least two weeks old on 2026-11-07: Capacitor core/cli/android 8.5.3 (not 8.6.0, 9 days old), electron-builder 26.18.0 (not 26.18.1, 11 days). SheetJS comes from its official CDN tarball (0.20.3), because the npm registry copy is outdated.
**Trade-offs:** `npm audit` still reports moderate advisories in dev-only tooling (Capacitor CLI's iOS `xcode` dependency, electron-builder); shipped dependencies have none (PROGRESS.md).

### D-013 · 2026-11-07 · Branch name given by the owner
**Decision:** the first milestone branch is `#0-npn-implementation`, as the owner asked, instead of the playbook's `#00nn-…` pattern. Later milestones follow `#00nn-three-to-seven-words`.

### D-014 · 2026-11-07 · Public repository from the first push
**Decision:** the owner chose to push to the existing public repository instead of starting private (playbook §2, Phase 1).
**Why:** owner's decision. Before the push: gitleaks over all commits (no leaks), a scan for personal data and local paths (none; only the public GitHub user name in links), commits use the GitHub no-reply e-mail, and only fictional data is tracked (D-006).
**Trade-offs:** everything pushed is public immediately; the same scans run in CI on every push (`scripts/check.sh repository`).
