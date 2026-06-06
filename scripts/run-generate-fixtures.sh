#!/usr/bin/env bash
# omnidash/scripts/run-generate-fixtures.sh
# Regenerates ./fixtures/ snapshots by running scripts/generate_fixtures.py.
#
# generate_fixtures.py lives in THIS repo (scripts/generate_fixtures.py) and
# imports from omnibase_infra, so uv must resolve dependencies via the
# omnibase_infra project.
#
# Required env vars:
#   OMNIBASE_INFRA_PATH  Path to a checkout of omnibase_infra (used as the uv
#                        --project root for dependency resolution, not as the
#                        location of generate_fixtures.py).
#
# Usage: npm run generate:fixtures
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${OMNIBASE_INFRA_PATH:-}" ]]; then
  echo "ERROR: OMNIBASE_INFRA_PATH is not set." >&2
  echo "       Set it to the path of an omnibase_infra checkout." >&2
  echo "       See .env.example for details." >&2
  exit 1
fi

if [[ ! -d "$OMNIBASE_INFRA_PATH" ]]; then
  echo "ERROR: OMNIBASE_INFRA_PATH does not exist: $OMNIBASE_INFRA_PATH" >&2
  exit 1
fi

# The script lives in this repo, not in omnibase_infra.
SCRIPT_PATH="$REPO/scripts/generate_fixtures.py"
if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "ERROR: generate_fixtures.py not found at $SCRIPT_PATH" >&2
  exit 1
fi

cd "$REPO"
uv run --project "$OMNIBASE_INFRA_PATH" python "$SCRIPT_PATH" "$@"
