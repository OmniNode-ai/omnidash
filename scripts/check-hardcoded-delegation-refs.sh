#!/usr/bin/env bash
# scripts/check-hardcoded-delegation-refs.sh
#
# OMN-10946: Enforce that no hardcoded delegation service ports, SQLite paths,
# or private IPs appear in omnidash src/ (browser bundle) outside approved locations.
#
# Scope: browser bundle only (src/). The server/ directory is the SQLite bridge
# layer and is by design the owner of delegation.sqlite path handling — it reads
# the path from contract.yaml via src/config/generated/, not hardcoded strings.
#
# Patterns blocked in src/:
#   - localhost:808x          (delegation API ports — use relative /api/delegation path)
#   - localhost:300x          (bridge/projection ports — use contract.yaml defaults via src/config/generated/)
#   - 192.168.*               (private LAN IPs — use env vars)
#   - *.sqlite                (SQLite file refs in browser code — browser must not access SQLite directly)
#
# Allowlist (src/ paths permitted to reference these patterns):
#   - src/config/generated/               (generated from contract.yaml — owned by generate:config)
#   - src/data-source/                    (documented HTTP/WS carve-out, OMN-10756)
#   - src/no-env-fallback.test.ts         (ESLint rule tests validating detection pattern itself)
#   - src/tests/setup.ts                  (global test env stubs — VITE_WS_URL for provider tests)
#   - src/data-source/http-snapshot-source.test.ts  (unit tests for HTTP adapter)
#   - src/services/delegation-api.test.ts  (unit tests asserting baseUrl option behavior)
#   - src/layout/layout-persistence.test.ts (unit tests with arbitrary localhost fixture input)
#
# Usage:
#   bash scripts/check-hardcoded-delegation-refs.sh
# Exit codes:
#   0 — clean
#   1 — at least one violation found

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# Scan only the browser bundle directory. server/ is explicitly out-of-scope:
# it IS the SQLite bridge layer and legitimately handles .sqlite paths.
SCAN_DIR="src"

PATTERNS=(
  'localhost:300[0-9]'
  'localhost:808[0-9]'
  '192\.168\.[0-9]'
  '\.sqlite\b'
)

EXCLUDE_DIRS=(
  '.git'
  'node_modules'
  'dist'
  'build'
  '.vite'
  'storybook-static'
  'dashboard-layouts'
  'fixtures'
  '.onex_state'
  'coverage'
)

ALLOWLIST_FILES=(
  'src/no-env-fallback.test.ts'
  'src/tests/setup.ts'
  'src/data-source/index.ts'
  'src/data-source/http-snapshot-source.test.ts'
  'src/services/delegation-api.test.ts'
  'src/layout/layout-persistence.test.ts'
)

ALLOWLIST_DIRS=(
  'src/config/generated'
  'src/data-source'
)

is_allowlisted() {
  local path="$1"
  path="${path#./}"
  for allowed in "${ALLOWLIST_FILES[@]}"; do
    if [[ "$path" == "$allowed" ]]; then return 0; fi
  done
  for dir in "${ALLOWLIST_DIRS[@]}"; do
    if [[ "$path" == "$dir/"* ]]; then return 0; fi
  done
  return 1
}

EXCLUDE_ARGS=()
for d in "${EXCLUDE_DIRS[@]}"; do
  EXCLUDE_ARGS+=("--exclude-dir=$d")
done
EXCLUDE_ARGS+=("--exclude=.git")

violations=0
for pattern in "${PATTERNS[@]}"; do
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    file="${line%%:*}"
    if is_allowlisted "$file"; then
      continue
    fi
    if [[ $violations -eq 0 ]]; then
      echo "ERROR: Hardcoded delegation refs found in browser bundle (src/):" >&2
    fi
    echo "  $line" >&2
    violations=$((violations + 1))
  done < <(grep -rEn "${EXCLUDE_ARGS[@]}" "$pattern" "$SCAN_DIR" 2>/dev/null || true)
done

if [[ $violations -gt 0 ]]; then
  echo >&2
  echo "Found $violations violation(s)." >&2
  echo "Fix: replace hardcoded URLs with env vars, contract.yaml defaults, or relative /api/* paths." >&2
  echo "Allowlist is in scripts/check-hardcoded-delegation-refs.sh (add only with clear justification)." >&2
  exit 1
fi

echo "OK: No hardcoded delegation ports or SQLite paths in src/ (browser bundle)"
