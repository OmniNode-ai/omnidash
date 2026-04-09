#!/bin/bash
# lint-empty-responses.sh — CI gate for unannotated hardcoded empty responses
#
# Finds res.json([]) or res.json({}) in server route files.
# Each occurrence must have an annotation on the same or preceding line:
#   // fallback-ok: <reason>
#   // empty-response-ok: <reason>
#
# Exit 1 if any unannotated occurrences are found.

set -euo pipefail

SEARCH_DIR="${1:-server}"
VIOLATIONS=""

while IFS= read -r line; do
  file=$(echo "$line" | cut -d: -f1)
  lineno=$(echo "$line" | cut -d: -f2)

  # Check the matching line itself and the line above for an annotation
  prev_lineno=$((lineno > 1 ? lineno - 1 : 1))
  context=$(sed -n "${prev_lineno},${lineno}p" "$file")

  if echo "$context" | grep -q "fallback-ok\|empty-response-ok"; then
    continue
  fi

  VIOLATIONS="${VIOLATIONS}${line}\n"
done < <(grep -rnE 'res\.json\(\s*(\[\s*\]|\{\s*\})\s*\)' "$SEARCH_DIR" --include="*.ts" || true)

if [ -n "$VIOLATIONS" ]; then
  echo "ERROR: Unannotated hardcoded empty responses found:"
  echo ""
  echo -e "$VIOLATIONS"
  echo "Add one of these annotations on the line or line above:"
  echo "  // fallback-ok: <reason>"
  echo "  // empty-response-ok: <reason>"
  exit 1
fi

echo "OK: No unannotated empty responses found."
