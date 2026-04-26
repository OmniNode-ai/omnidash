#!/usr/bin/env bash
# omnidash-v2/scripts/run-generate-fixtures.sh
# Regenerates ./fixtures/ snapshots by running scripts/generate_fixtures.py
# (local to this repo) with Python deps resolved from an omnibase_infra checkout.
#
# Required env vars:
#   OMNIBASE_INFRA_PATH  Path to a checkout of omnibase_infra — used only so
#                        `uv run --project` can resolve Python deps (e.g.
#                        omnibase_infra.projectors.file_snapshot_sink).
#                        The script itself lives at scripts/generate_fixtures.py
#                        in this repo, NOT in omnibase_infra.
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

SCRIPT_PATH="$REPO/scripts/generate_fixtures.py"
if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "ERROR: generate_fixtures.py not found at $SCRIPT_PATH" >&2
  exit 1
fi

cd "$REPO"
uv run --project "$OMNIBASE_INFRA_PATH" python "$SCRIPT_PATH" "$@"
