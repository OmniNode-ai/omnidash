#!/usr/bin/env bash
# omnidash-v2/scripts/run-types-generate.sh
# Generates TypeScript types from Part 1 Pydantic models via omnibase_core emitter.
# Usage: npm run types:generate
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OMNIBASE_CORE="${OMNIBASE_CORE_PATH:-/mnt/c/Code/omninode_ai/omnibase/repos/omnibase_core}"
SCHEMA_OUT="$REPO/build/onex-schemas.json"
TS_OUT="$REPO/src/shared/types/generated/onex-models.ts"
ENUM_OUT="$REPO/src/shared/types/generated/enum-dashboard-widget-type.ts"

mkdir -p "$(dirname "$SCHEMA_OUT")" "$(dirname "$TS_OUT")"

(cd "$OMNIBASE_CORE" && uv run python scripts/emit_ts_types.py "$SCHEMA_OUT")

# Hoist nested $defs from each model into the top-level $defs so json2ts can
# resolve cross-model $ref pointers (e.g. EnumDashboardWidgetType lives inside
# ModelDashboardHint.$defs but is referenced by the top-level $ref path).
python3 - "$SCHEMA_OUT" "$SCHEMA_OUT" <<'PYEOF'
import json, sys
schema = json.loads(open(sys.argv[1]).read())
top_defs = schema.setdefault("$defs", {})
for model_name, model_schema in list(top_defs.items()):
    nested = model_schema.pop("$defs", {})
    for k, v in nested.items():
        if k not in top_defs:
            top_defs[k] = v
open(sys.argv[2], "w").write(json.dumps(schema, indent=2))
PYEOF

npx json2ts --input "$SCHEMA_OUT" --output "$TS_OUT" --unreachableDefinitions

cat > "$ENUM_OUT" <<'EOF'
// GENERATED — do not edit by hand.
// Source: omnibase_core/src/omnibase_core/enums/enum_dashboard_widget_type.py
export enum EnumDashboardWidgetType {
  Tile = 'tile',
  Chart = 'chart',
  Table = 'table',
  List = 'list',
  Scalar = 'scalar',
}
EOF

echo "TS types regenerated."
