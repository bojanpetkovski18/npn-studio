# Architecture (as built)

```
                 ┌──────────────────────── src/core (pure JavaScript, no Node built-ins) ────────────────────────┐
 Excel bytes ──▶ │ excel.js   read sheet (SheetJS) → detect kind → parse rows                                     │
                 │ cases.js   join cases + invoices → totals → validation → overrides → template choice           │
                 │ analyze.js legal/natural person, ЕДБ detection, ЕМБГ check digit + birth date, place, duplicates │
 Word bytes  ──▶ │ docx.js    Template.fromData → fill(values) (XML in place) → pack (fresh zip) / combine        │
                 │ format.js  money, dates, number parsing                                                       │
                 └──────────────┬───────────────────────────────┬───────────────────────────────┬──────────────┘
                                │                               │                               │
        Desktop (Electron)      │      Mobile PWA (browser)     │      Android (Capacitor)      │
 src/main.js  IPC, files,       │ mobile/src/engine-worker.js   │ same bundle as the PWA        │
   generation loop, PDF,        │   parse + generate + ZIP      │ mobile/src/native.js          │
   projects, history            │ mobile/src/state.js, screens/ │   Filesystem + Share plugins, │
 src/core/node.js  fs I/O,      │ store.js (IndexedDB),         │   back button, system bars    │
   worker thread (>3 MB)        │ sw.js (offline cache)         │ ThemeBarsPlugin.java          │
 src/renderer/  UI              │                               │                               │
```

## Flow

1. **Load.** Desktop reads files with `node.js` (in a worker thread above 3 MB). Mobile reads them with the File API
   and parses them in a Web Worker. Both call `loadFiles([{ name, data }])`, which returns files (kind, rows, error)
   and joined, enriched cases.
2. **Review.** The UI filters, sorts and previews. A preview calls `Template.fill()` only (no zipping), so it is cheap.
   Corrections go through `applyOverride()`; `enrich()` re-runs on all cases, because duplicates can change elsewhere.
3. **Generate.** For each case `templateKind()` picks a template and `render()` = `fill()` + `pack()`. `pack()` copies
   the template's file map into a new JSZip, so concurrent renders never share state (a race fixed in v2.1).
   Desktop writes files (optional sub-folders, PDF through Word COM or LibreOffice). Mobile adds them to a ZIP with
   the combined print document and the Excel report, and transfers the bytes back without copying.
4. **Cancel.** Tied to the job id; the worker yields to the event loop every 8 documents so the message is delivered.

## Template filling (D-003)

Paragraphs are processed one by one. Placeholders that Word split across runs are first merged into the run where
they start, so the replacement inherits that run's formatting. `{{FAKTURI_TABELA}}` becomes several lines with `<w:br/>`
in the same run, sized like the surrounding text. An amount followed by a literal `,00` is written without decimals.

## Persistence

- Desktop: `%APPDATA%/Nalogix` – `settings.json`, `session.json` (files, selection, overrides), `history.json`;
  projects are `.nalogix` JSON files the user saves.
- Mobile: IndexedDB key-value store (`files`, `tpl:standard`, `tpl:embg`, `session`, `history`); `localStorage` only
  for the theme.

## Security notes

- The desktop renderer is sandboxed with context isolation; navigation and new windows are blocked.
- Both CSPs allow only same-origin scripts (no inline scripts or handlers). Styles still allow `'unsafe-inline'`,
  because the UIs set some inline styles – a known issue in PROGRESS.md.
- No network use besides the PWA's own files. No telemetry.
