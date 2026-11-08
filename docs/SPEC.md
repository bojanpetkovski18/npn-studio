# Specification

## Purpose

A law office prepares *Предлози за издавање на решение за нотарски платен налог* (applications for a notarial
payment order) for a utility's unpaid bills. The utility sends two Excel exports: **Листа на тужби** (one row per
case: debtor, address, totals, costs, ЕМБГ) and **Ставки по тужби** (one row per unpaid invoice). Nalogix joins them
and fills a Word template per case, on Windows, on a phone (PWA) and on Android.

## Users and roles

One role: the person preparing the documents. No accounts and no server; all data stays on the device.

## Lessons from the earlier tool (feature reference only, no code copied)

- It flattened the template's formatting (lost bold text and sizes).
- It always used one template, so companies could get "ЕМБГ" in front of a tax number.
- No checks: invoices that did not add up, missing invoices or duplicate customer codes went unnoticed.

## Features

| ID | Feature |
|----|---------|
| F-01 | Load any number of Excel files; detect Листа / Ставки from the headers; report a broken file without stopping the rest |
| F-02 | Join cases and invoices on case number + year; never borrow invoices from another year |
| F-03 | Validate: invoice sum vs total, no invoices, customer code mismatch, duplicate code/ЕМБГ, ЕМБГ check digit and date |
| F-04 | Classify natural vs legal persons; detect a tax number (ЕДБ) in the ЕМБГ column; derive the place from the address |
| F-05 | Fill Word templates in place, keeping all formatting; placeholders listed in README |
| F-06 | Smart template choice (D-004), or force standard / ЕМБГ |
| F-07 | Selection rules: minimum debt, natural persons only, skip cases without invoices, skip already generated |
| F-08 | Per-case corrections that never modify the Excel files; remembered in the session / project |
| F-09 | Generate: one .docx per case, a combined print document, an Excel report; cancellable |
| F-10 | Desktop extras: projects (.nalogix), history, command palette, analytics, PDF via Word/LibreOffice, sub-folders |
| F-11 | Mobile: offline PWA, ZIP shared through the system share sheet or saved; Android app with native share/save |
| F-12 | Light / dark / system theme everywhere |

## Business rules

- Total costs = advocate fee + notary cost + notary fee + material costs + current-state fee.
- Amounts are formatted Macedonian style (`11.284,00`); a template's hard-coded `,00` after an amount is not doubled.
- Dates come from Excel serials and are written `dd.MM.yyyy`.
- Default rules select cases with a main debt ≥ 6 000 ден. and at least one invoice.

## Non-functional requirements

- Generated documents are identical on desktop and mobile (parity test).
- 1 000+ documents without freezing the UI; cancel takes effect within one batch of 8 documents.
- Works offline on a phone after the first visit; no data leaves the device.
- No real personal data in the repository, CI or demos.

## Acceptance criteria

1. The sample baseline is unchanged unless deliberately re-recorded (`test/baseline.js`).
2. Every planted problem in the samples is detected (`test/core.js`).
3. Mobile phases 1–5 pass (`npm run test:all`), including byte-identical output with the desktop engine.
4. The Android app passes `npm run android:test` on an emulator or phone.
5. `bash scripts/check.sh repository` passes: no secrets, no tracked data files outside `samples/`.

## Delivery plan

See PROGRESS.md (milestones) and docs/MOBILE_PLAN.md (mobile phases).
