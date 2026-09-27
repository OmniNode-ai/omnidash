#!/usr/bin/env bash
# Validate the committed fixture against the pinned Core DTO. This does not
# validate the manually maintained TypeScript mirror.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OMNIDASH_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "${OMNIBASE_CORE_PATH:-}" ]]; then
  echo "ERROR: OMNIBASE_CORE_PATH is required for execution-graph fixture parity." >&2
  exit 2
fi
if [[ ! -f "$OMNIBASE_CORE_PATH/pyproject.toml" || ! -d "$OMNIBASE_CORE_PATH/src/omnibase_core" ]]; then
  echo "ERROR: OMNIBASE_CORE_PATH is not an available omnibase_core checkout." >&2
  exit 2
fi

PYTHONPATH="$OMNIBASE_CORE_PATH/src${PYTHONPATH:+:$PYTHONPATH}" \
  uv run --project "$OMNIBASE_CORE_PATH" pytest \
  "$OMNIDASH_ROOT/tests/ci/test_execution_graph_fixture_core_parity.py" -q
