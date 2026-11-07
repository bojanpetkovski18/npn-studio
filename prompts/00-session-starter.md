# Session starter

You are working on Nalogix (see README.md). Before doing anything:

1. Read `CLAUDE.md`, `PROGRESS.md`, `DECISIONS.md`, the milestone brief in `prompts/`, and the `docs/SPEC.md`
   sections it names.
2. Check `git status` (stop if the tree is not clean), the recent log and the branches. Branch from a freshly pulled
   `dev`: `#00nn-three-to-seven-words`.
3. Run `bash scripts/check.sh engine` and `npm run test:all` for a green baseline; report any failure first.
4. Restate the goal, the planned commits and your assumptions, then start.

Rules that matter most here: fictional data only (`samples/`), one shared engine (`src/core`), no change to generated
documents without re-recording the baseline on purpose, failing test first for every bug, push branches only.
