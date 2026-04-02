#!/usr/bin/env bash
# check-drizzle-table-duplicates.sh
#
# Detect duplicate pgTable() names across Drizzle schema files.
# Two different schema files declaring pgTable('same_name') will cause
# runtime conflicts — this script catches them before they hit production.
#
# Usage:
#   bash scripts/check-drizzle-table-duplicates.sh
#
# Exit codes:
#   0 = no duplicates found
#   1 = duplicate table names detected

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Extract all pgTable('name') or pgTable("name") calls, output: table_name|file:line
ALL_ENTRIES=$(
  grep -rn "pgTable(" "$PROJECT_ROOT/shared/" \
    --include="*.ts" \
    --include="*.tsx" \
  | sed -E "s/.*pgTable\(['\"]([^'\"]+)['\"].*/\1/" \
  | sort
)

if [[ -z "$ALL_ENTRIES" ]]; then
  echo "OK: No pgTable() definitions found."
  exit 0
fi

DUPS=$(echo "$ALL_ENTRIES" | uniq -d)

if [[ -z "$DUPS" ]]; then
  TOTAL=$(echo "$ALL_ENTRIES" | wc -l | tr -d ' ')
  echo "OK: No duplicate pgTable() names found. ($TOTAL unique tables checked)"
  exit 0
fi

echo "FAIL: Duplicate pgTable() names found across schema files:"
echo ""

FOUND=0
while IFS= read -r table_name; do
  [ -z "$table_name" ] && continue
  FOUND=1
  echo "  Duplicate table: '$table_name'"
  grep -rn "pgTable(['\"]${table_name}['\"]" "$PROJECT_ROOT/shared/" \
    --include="*.ts" \
    --include="*.tsx" \
  | sed 's/^/    /'
  echo ""
done <<< "$DUPS"

if [ "$FOUND" -eq 1 ]; then
  echo "Each pgTable() name must be unique across all schema files."
  echo "If two schemas need the same table, one should import from the other."
  exit 1
fi

exit 0
