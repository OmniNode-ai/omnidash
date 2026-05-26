#!/usr/bin/env bash
# omnidash/scripts/check-no-orphaned-js.sh
#
# OMN-12171: Block compiled .js artifacts from accumulating alongside .ts/.tsx sources.
# Any .js file under src/ or shared/ that shadows a .ts or .tsx counterpart is a stale
# artifact (produced by tsc without --outDir or a stray build step) and must not land
# in the repo or on disk.
#
# Legitimately-tracked .js files (eslint.config.js, postcss.config.js) live at
# the repo root and are not under src/ or shared/, so this check does not touch them.
#
# Usage:
#   scripts/check-no-orphaned-js.sh
# Exit codes:
#   0 — clean
#   1 — orphaned .js files found

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

violations=0

check_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0

  while IFS= read -r -d '' jsfile; do
    [[ -f "$jsfile" ]] || continue
    base="${jsfile%.js}"
    if [[ -f "${base}.ts" || -f "${base}.tsx" ]]; then
      if [[ $violations -eq 0 ]]; then
        echo "ERROR: orphaned .js artifacts found alongside .ts/.tsx sources:" >&2
      fi
      echo "  $jsfile" >&2
      violations=$((violations + 1))
    fi
  done < <(find "$dir" -name "*.js" -not -path "*/node_modules/*" -print0 2>/dev/null)
}

check_dir "src"
check_dir "shared"

if [[ $violations -gt 0 ]]; then
  echo >&2
  echo "Found $violations orphaned .js file(s) in src/ or shared/." >&2
  echo "These are stale artifacts — delete them and re-run." >&2
  echo "The build pipeline writes output to dist/, not src/." >&2
  exit 1
fi

echo "orphaned-js check: clean."
