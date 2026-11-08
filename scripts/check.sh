#!/usr/bin/env bash
# Runs everything CI runs. Any failure stops the script, so it can guard a push.
#   scripts/check.sh              all checks
#   scripts/check.sh engine       one group: engine, app or repository
# All tests use the fictional data in samples/. Electron needs a display: on Linux CI it runs under xvfb-run.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
group="${1:-all}"

engine() {
  cd "$root"
  npm ci --no-audit --no-fund
  node test/baseline.js
  node test/core.js
  node test/run.js
  # what ships must have no known vulnerabilities; dev tooling is held to "high"
  npm audit --omit=dev --audit-level=moderate
  npm audit --audit-level=high
}

app() {
  cd "$root"
  [[ -d node_modules ]] || npm ci --no-audit --no-fund
  # Electron 44 has no install script: fetch its binary explicitly (the installer verifies the checksum)
  npx --no install-electron
  # mobile build + every mobile phase's acceptance test (Electron with phone emulation) + engine suites
  local runner=()
  if [[ "$(uname -s)" == Linux && -z "${DISPLAY:-}" ]]; then runner=(xvfb-run --auto-servernum); fi
  "${runner[@]}" node mobile/test/all.js
}

repository() {
  cd "$root"
  bash scripts/install-tools.sh
  .tools/gitleaks git --redact --no-banner .
  .tools/actionlint
  git ls-files -z | xargs -0 .tools/ec
  # Bidirectional controls make code read differently from how it runs ("Trojan Source").
  if git grep -I -n -P '[\x{061C}\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]'; then
    echo "Tracked text files contain bidirectional control characters." >&2
    exit 1
  fi
  # Real-data guard: only the fictional samples may be tracked as Excel/Word files.
  # -z: git quotes non-ASCII names otherwise ("…\320\233….xls"), and a Cyrillic file name would slip past the pattern
  if git ls-files -z | tr '\0' '\n' | grep -iE '\.(xls|xlsx|xlsm|docx|doc|pdf|zip)$' | grep -v '^samples/'; then
    echo "Excel/Word/PDF/ZIP files outside samples/ are tracked (real data must never be committed)." >&2
    exit 1
  fi
}

case "$group" in
  all)
    (engine)
    (app)
    (repository)
    ;;
  engine | app | repository) ("$group") ;;
  *)
    echo "Unknown group: $group" >&2
    exit 2
    ;;
esac

echo "All $group checks passed."
