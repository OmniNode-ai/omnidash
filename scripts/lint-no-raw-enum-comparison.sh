#!/usr/bin/env bash
# lint-no-raw-enum-comparison.sh (OMN-7094)
#
# Anti-backslide tripwire: ensures no raw string comparisons against NodeType,
# IntrospectionReason, or RegistrationState enum values. All enum parsing must
# go through the normalize functions in consumer-utils.ts which handle case
# normalization.
#
# Why: The runtime sends lowercase enum values (e.g., "effect", "startup") but
# the TypeScript types are UPPERCASE (e.g., "EFFECT", "STARTUP"). Raw string
# comparisons silently fail, causing the Platform Registry to show garbage data.
#
# Exit codes:
#   0 = all checks pass
#   1 = violations found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

VIOLATIONS=0

echo "=== lint-no-raw-enum-comparison (OMN-7094) ==="
echo ""

# ---------------------------------------------------------------------------
# Check 1: No raw string comparisons against NodeType values
# ---------------------------------------------------------------------------
echo "Check 1: No raw string comparisons against NodeType enum values..."

# Search for === 'EFFECT', === 'COMPUTE', etc. in server/client/shared .ts/.tsx files
# Exclude test files, consumer-utils.ts (where the valid lists are defined),
# and consumer-state-helpers.ts (which has its own normalization).
NODE_TYPE_HITS=$(grep -rn \
  -e "=== 'EFFECT'" \
  -e "=== 'COMPUTE'" \
  -e "=== 'REDUCER'" \
  -e "=== 'ORCHESTRATOR'" \
  -e "=== 'SERVICE'" \
  -e '=== "EFFECT"' \
  -e '=== "COMPUTE"' \
  -e '=== "REDUCER"' \
  -e '=== "ORCHESTRATOR"' \
  -e '=== "SERVICE"' \
  --include="*.ts" --include="*.tsx" \
  "$PROJECT_ROOT/server/" "$PROJECT_ROOT/client/" "$PROJECT_ROOT/shared/" 2>/dev/null \
  | grep -v "node_modules" \
  | grep -v "\.test\." \
  | grep -v "consumer-utils\.ts" \
  | grep -v "consumer-state-helpers\.ts" \
  || true)

if [ -n "$NODE_TYPE_HITS" ]; then
  echo -e "${RED}  FAIL${NC}: Raw NodeType string comparisons found:"
  echo "$NODE_TYPE_HITS" | while read -r line; do
    echo "    $line"
  done
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "${GREEN}  PASS${NC}: No raw NodeType string comparisons"
fi

# ---------------------------------------------------------------------------
# Check 2: No raw string comparisons against IntrospectionReason values
# ---------------------------------------------------------------------------
echo ""
echo "Check 2: No raw string comparisons against IntrospectionReason enum values..."

REASON_HITS=$(grep -rn \
  -e "=== 'STARTUP'" \
  -e "=== 'SHUTDOWN'" \
  -e "=== 'HEARTBEAT'" \
  -e "=== 'REQUESTED'" \
  -e "=== 'CONFIG_CHANGE'" \
  -e '=== "STARTUP"' \
  -e '=== "SHUTDOWN"' \
  -e '=== "HEARTBEAT"' \
  -e '=== "REQUESTED"' \
  -e '=== "CONFIG_CHANGE"' \
  --include="*.ts" --include="*.tsx" \
  "$PROJECT_ROOT/server/" "$PROJECT_ROOT/client/" "$PROJECT_ROOT/shared/" 2>/dev/null \
  | grep -v "node_modules" \
  | grep -v "\.test\." \
  | grep -v "consumer-utils\.ts" \
  || true)

if [ -n "$REASON_HITS" ]; then
  echo -e "${RED}  FAIL${NC}: Raw IntrospectionReason string comparisons found:"
  echo "$REASON_HITS" | while read -r line; do
    echo "    $line"
  done
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "${GREEN}  PASS${NC}: No raw IntrospectionReason string comparisons"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}FAILED${NC}: $VIOLATIONS violation(s) found"
  echo ""
  echo "Fix: Use parseNodeType() / parseIntrospectionReason() from consumer-utils.ts"
  echo "     instead of raw string comparisons. These functions handle case"
  echo "     normalization. See OMN-7094 for details."
  exit 1
else
  echo -e "${GREEN}PASSED${NC}: All enum comparison lint checks pass"
  exit 0
fi
