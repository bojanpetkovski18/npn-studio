# Milestone 1 – Publish the mobile app on GitHub Pages

**Branch:** `#0001-github-pages-deploy` from `dev`.

**Goal:** the PWA is reachable over HTTPS, installable on Android and iPhone, and works offline after the first visit.

**Context:** docs/MOBILE_PLAN.md phase 7; D-005; playbook §14 (demo hosting – the owner creates the Pages site).

**Scope:**
- A GitHub Actions workflow that builds `mobile/dist` and deploys it with the official Pages actions, pinned by SHA,
  with only the permissions Pages needs (`pages: write`, `id-token: write`) on the deploy job.
- The app must work under the repository sub-path (relative URLs and service-worker scope).
- README: the public URL and "how to install on a phone".

**Out of scope:** a custom domain; analytics; any server.

**Tests required:** the existing phases run against the production build served from a sub-path; a smoke check of the
deployed URL (HTTP 200, manifest, service worker) after deploy.

**Acceptance criteria:**
1. The Pages URL serves the app over HTTPS.
2. On a real Android phone: install, open with the network off, generate from the samples.
3. On an iPhone (Safari): "Add to Home Screen" and generate.

**Verification required:** record the URL, devices and results in PROGRESS.md.
