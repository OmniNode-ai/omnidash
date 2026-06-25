#!/usr/bin/env bash
# omnidash-v2/scripts/check-no-env-contamination.sh
#
# T5 (Brett review §6 PR 1): block commits / CI runs that introduce
# environment-specific literals into the source tree.
#
# Patterns blocked:
#   - 192.168.            (private LAN IPs)
#   - localhost:300       (dev ports — 3000, 3001, 3002, ...)
#   - /Users/             (macOS home)
#   - /Volumes/           (macOS mount points)
#   - /mnt/c/             (WSL Windows mount)
#
# Allowlist (paths that are permitted to mention them):
#   - .env.example                        (documents the env vars)
#   - src/data-source/index.ts            (HTTP + WS data-source carve-out)
#   - docs/, README.md, CLAUDE.md         (documentation, prose, examples)
#   - scripts/check-no-env-contamination.sh (the gate itself)
#   - dashboard-layouts/, fixtures/        (gitignored runtime artifacts)
#   - node_modules/, .git/                 (third-party / git internals)
#   - storybook-static/, dist/, build/, .vite/ (build outputs)
#
# Usage:
#   scripts/check-no-env-contamination.sh
# Exit codes:
#   0 — clean
#   1 — at least one violation found

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# Patterns to search for. Use word-anchored variants where helpful.
PATTERNS=(
  '192\.168\.'
  'localhost:300'
  '/Users/'
  '/Volumes/'
  '/mnt/c/'
)

# grep --exclude-dir patterns (relative to REPO). Keep this minimal so the
# gate stays useful — every entry should have a clear reason.
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

# Files that are explicitly permitted to reference the patterns above.
ALLOWLIST_FILES=(
  '.env.example'
  'src/data-source/index.ts'
  'scripts/check-no-env-contamination.sh'
  # OMN-10946: delegation-specific scanner — contains the patterns it enforces
  'scripts/check-hardcoded-delegation-refs.sh'
  'README.md'
  'CLAUDE.md'
  # ESLint rule unit tests use localhost:3002 as literal fixture inputs to verify
  # the validator fires correctly — they are testing the detection pattern itself.
  'src/no-env-fallback.test.ts'
  'src/no-env-fallback.test.js'  # compiled artifact of the above
  # OMN-12969: no-projection-websocket rule tests use ws://localhost:3002/ws as
  # literal fixture inputs to verify the detector fires — testing the pattern itself.
  'src/no-projection-websocket.test.ts'
  'src/no-projection-websocket.test.js'  # compiled artifact of the above
  # OMN-12882: no-non-authoritative-read-source rule tests use localhost:3002 as
  # literal fixture inputs to verify the guardrail fires — testing the detection
  # pattern itself (not runtime source).
  'src/no-non-authoritative-read-source.test.ts'
  'src/no-non-authoritative-read-source.test.js'  # compiled artifact of the above
  # OMN-12808: url-carve-out test asserts the single URL carve-out invariant; its
  # regexes + docstring reference 192.168.x / localhost as the patterns it detects
  # — testing the detection pattern itself (not runtime source).
  'src/url-carve-out.test.ts'
  'src/url-carve-out.test.js'  # compiled artifact of the above
  # OMN-12969: global test setup previously stubbed VITE_WS_URL to a localhost
  # address; the dead `/ws` path was removed so it no longer does. Kept on the
  # allowlist for any future localhost test stubs.
  'src/tests/setup.ts'
  'src/tests/setup.js'  # compiled artifact of the above
  # OMN-10756: contract.yaml and its derived files own the canonical localhost
  # default for the data-source bridge URL. These are defaults, not hardcoded
  # environment-specific literals.
  'contract.yaml'
  'contract.local.yaml'
  'contract.local.yaml.example'
  'server/data-source-contract.ts'
  'scripts/generate-data-source-config.ts'
  'server/__tests__/data-source-contract.test.ts'
  # OMN-12400: projection-env guard. The guard module's error message names the
  # banned ports (:8765/:3010/:3002) and the authoritative bridge (:3003); its
  # test feeds those ports plus the live lane backend (.201:13002) as fixture
  # inputs to verify the guard fires/passes correctly — testing the detection
  # pattern itself (not runtime source).
  'vite.env-guard.ts'
  'tests/vite-middleware/env-guard.test.ts'
)

# Allowlist directories — every file under here is permitted.
ALLOWLIST_DIRS=(
  'docs'
  'reference'
  'src/data-source'        # the documented HTTP/WS carve-out
  'src/config/generated'   # OMN-10756: generated from contract.yaml defaults
  # OMN-12833: OCC evidence contracts under contracts/ document the live lane
  # backend they were verified against (prose evidence, not runtime source) —
  # same rationale as the contract.yaml allowlist above.
  'contracts'
)

is_allowlisted() {
  local path="$1"
  # Normalize: strip leading ./ that grep -r prepends.
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

# In a git worktree, `.git` is a regular file (not a directory) that points at
# the main checkout's worktrees/ entry — so --exclude-dir=.git does not match
# it. Exclude the literal `.git` filename to keep the gate clean in worktrees.
EXCLUDE_ARGS+=("--exclude=.git")

violations=0
for pattern in "${PATTERNS[@]}"; do
  # Use grep -rn with extended regex; capture file:line:match.
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    file="${line%%:*}"
    if is_allowlisted "$file"; then
      continue
    fi
    if [[ $violations -eq 0 ]]; then
      echo "ERROR: env-contamination patterns found in source tree:" >&2
    fi
    echo "  $line" >&2
    violations=$((violations + 1))
  done < <(grep -rEn "${EXCLUDE_ARGS[@]}" "$pattern" . 2>/dev/null || true)
done

if [[ $violations -gt 0 ]]; then
  echo >&2
  echo "Found $violations violation(s). Allowlist is in scripts/check-no-env-contamination.sh." >&2
  echo "If a literal genuinely belongs in source, add it to ALLOWLIST_FILES with a comment." >&2
  exit 1
fi

echo "env-contamination check: clean."
