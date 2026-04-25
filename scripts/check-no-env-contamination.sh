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
)

# Files that are explicitly permitted to reference the patterns above.
ALLOWLIST_FILES=(
  '.env.example'
  'src/data-source/index.ts'
  'scripts/check-no-env-contamination.sh'
  'README.md'
  'CLAUDE.md'
)

# Allowlist directories — every file under here is permitted.
ALLOWLIST_DIRS=(
  'docs'
  'reference'
  'src/data-source'   # the documented HTTP/WS carve-out
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
