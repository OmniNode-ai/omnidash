#!/usr/bin/env bash
# test-dev-sh-guard.sh
#
# Verifies that OMNIDASH_BUS_MODE=local and KAFKA_BOOTSTRAP_SERVERS=localhost:19092
# survive after scripts/dev.sh sources ~/.omnibase/.env.
#
# Usage: bash scripts/test-dev-sh-guard.sh
# Exit code: 0 on pass, 1 on failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_SH="${SCRIPT_DIR}/dev.sh"

echo "Testing bus guard in scripts/dev.sh..."

result=$(
  OMNIDASH_BUS_MODE=local \
  KAFKA_BOOTSTRAP_SERVERS=localhost:19092 \
  bash "${DEV_SH}" bash -c 'echo "BUS_MODE=${OMNIDASH_BUS_MODE:-unset} BROKERS=${KAFKA_BOOTSTRAP_SERVERS:-unset}"'
)

echo "Output: ${result}"

if echo "${result}" | grep -q "BUS_MODE=local"; then
  echo "PASS: OMNIDASH_BUS_MODE=local preserved"
else
  echo "FAIL: OMNIDASH_BUS_MODE not preserved (got: ${result})"
  exit 1
fi

if echo "${result}" | grep -q "BROKERS=localhost:19092"; then
  echo "PASS: KAFKA_BOOTSTRAP_SERVERS=localhost:19092 preserved"
else
  echo "FAIL: KAFKA_BOOTSTRAP_SERVERS not preserved (got: ${result})"
  exit 1
fi

echo "All bus guard assertions passed."
