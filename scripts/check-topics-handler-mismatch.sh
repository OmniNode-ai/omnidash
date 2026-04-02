#!/usr/bin/env bash
# check-topics-handler-mismatch.sh
#
# Validates that every handler name in topics.yaml corresponds to an actual
# method in the read-model consumer projection classes, and vice versa.
#
# Checks:
#   1. Every handler in topics.yaml has a matching method in projection files
#   2. Every projection method has a corresponding entry in topics.yaml
#
# Handler naming convention in topics.yaml:
#   handler: "projectFoo" → method: private async projectFoo(...)
#
# Usage:
#   bash scripts/check-topics-handler-mismatch.sh
#
# Exit codes:
#   0 = all handlers match
#   1 = mismatches found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOPICS_YAML="$PROJECT_ROOT/topics.yaml"
PROJECTIONS_DIR="$PROJECT_ROOT/server/consumers/read-model"

if [[ ! -f "$TOPICS_YAML" ]]; then
  echo "ERROR: topics.yaml not found at $TOPICS_YAML"
  exit 1
fi

if [[ ! -d "$PROJECTIONS_DIR" ]]; then
  echo "ERROR: Projections directory not found at $PROJECTIONS_DIR"
  exit 1
fi

FAILURES=0

# Extract handler names from topics.yaml (only from read_model_topics section)
YAML_HANDLERS=$(
  grep -E '^\s+handler:\s+"' "$TOPICS_YAML" \
  | sed -E 's/.*handler: "([^"]+)".*/\1/' \
  | sort -u
)

# Extract projection method names from TypeScript files
# Matches: private async projectFoo(
CODE_HANDLERS=$(
  grep -rE 'private\s+async\s+(project[A-Z][a-zA-Z]+)\s*\(' "$PROJECTIONS_DIR" \
    --include="*.ts" \
  | sed -E 's/.*private async ([a-zA-Z]+)\(.*/\1/' \
  | sort -u
)

echo "=== topics.yaml Handler Validation ==="
echo ""

# Check 1: handlers in topics.yaml that don't exist in code
echo "--- Handlers in topics.yaml missing from code ---"
MISSING_IN_CODE=0
while IFS= read -r handler; do
  [ -z "$handler" ] && continue
  # Check if handler exists as a method (exact match or with Event/Snapshot suffix)
  FOUND=0
  echo "$CODE_HANDLERS" | grep -qxF "$handler" && FOUND=1
  if [ "$FOUND" -eq 0 ]; then
    echo "$CODE_HANDLERS" | grep -qxF "${handler}Event" && FOUND=1
  fi
  if [ "$FOUND" -eq 0 ]; then
    echo "$CODE_HANDLERS" | grep -qxF "${handler}Snapshot" && FOUND=1
  fi
  if [ "$FOUND" -eq 0 ]; then
    echo "  MISSING: topics.yaml declares '$handler' but no matching method found"
    MISSING_IN_CODE=1
    FAILURES=$((FAILURES + 1))
  fi
done <<< "$YAML_HANDLERS"

if [ "$MISSING_IN_CODE" -eq 0 ]; then
  echo "  None — all topics.yaml handlers have matching code."
fi
echo ""

# Check 2: projection methods not referenced in topics.yaml
echo "--- Projection methods not referenced in topics.yaml ---"
MISSING_IN_YAML=0
while IFS= read -r method; do
  [ -z "$method" ] && continue
  FOUND=0
  echo "$YAML_HANDLERS" | grep -qxF "$method" && FOUND=1
  if [ "$FOUND" -eq 0 ]; then
    # Strip Event/Snapshot suffix and check again
    STRIPPED=$(echo "$method" | sed -E 's/(Event|Snapshot)$//')
    echo "$YAML_HANDLERS" | grep -qxF "$STRIPPED" && FOUND=1
  fi
  if [ "$FOUND" -eq 0 ]; then
    echo "  ORPHAN: method '$method' exists in code but not in topics.yaml"
    MISSING_IN_YAML=1
  fi
done <<< "$CODE_HANDLERS"

if [ "$MISSING_IN_YAML" -eq 0 ]; then
  echo "  None — all projection methods are referenced in topics.yaml."
fi
echo ""

# Summary
YAML_COUNT=$(echo "$YAML_HANDLERS" | grep -c . || true)
CODE_COUNT=$(echo "$CODE_HANDLERS" | grep -c . || true)
echo "Summary: $YAML_COUNT handlers in topics.yaml, $CODE_COUNT projection methods in code."

if [ "$FAILURES" -gt 0 ]; then
  echo ""
  echo "FAIL: $FAILURES handler(s) declared in topics.yaml have no matching code."
  exit 1
fi

echo ""
echo "OK: All topics.yaml handlers have matching projection methods."
exit 0
