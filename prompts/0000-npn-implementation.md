# Milestone 0 – Nalogix implementation (brief, written after the work for the record)

**Branch:** `#0-npn-implementation` (name chosen by the owner, D-013) → PR into `dev`.

**Goal:** bring the working application into the repository in a reviewable, tested state: shared engine, desktop
app, mobile PWA, Android app, fictional samples, tests and CI.

**Context:** SPEC.md (all features), DECISIONS.md D-001 … D-013, docs/MOBILE_PLAN.md.

**Scope:** everything under `src/`, `mobile/`, `samples/`, `test/`, `build/`, `scripts/`, `.github/`, project documents.

**Out of scope:** hosting the PWA (milestone 1), code signing for Windows, iOS, a licence.

**Tests required:** output baseline, engine unit and end-to-end tests, mobile phases 1–5, Android device test,
repository checks (secret scan, workflow lint, editorconfig, data-file guard).

**Acceptance criteria:** SPEC.md 1–5.

**Verification required:** run `bash scripts/check.sh` groups locally before pushing; record the results in PROGRESS.md.
