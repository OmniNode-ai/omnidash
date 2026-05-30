#!/usr/bin/env bash
# seed-sqlite.sh — Seed the local delegation.sqlite DB for omnidash integration testing.
# Usage: bash scripts/seed-sqlite.sh [--db-path <path>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${OMNIDASH_SQLITE_DB_PATH:-$HOME/.omninode/delegation/delegation.sqlite}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-path) DB_PATH="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

DB_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DB_DIR"

echo "[seed-sqlite] DB path: $DB_PATH"

if ! command -v sqlite3 &>/dev/null; then
  echo "[seed-sqlite] ERROR: sqlite3 not found. Install with: brew install sqlite3" >&2
  exit 1
fi

# ALTER TABLE statements fail if columns already exist; suppress those errors only.
sqlite3 "$DB_PATH" <<'APPLY_SEED'
.bail off
APPLY_SEED

sqlite3 "$DB_PATH" < "$SCRIPT_DIR/seed-sqlite.sql" 2>&1 | grep -v "duplicate column name" || true

echo "[seed-sqlite] Verifying row counts..."
sqlite3 "$DB_PATH" <<'EOF'
.mode column
.headers on
SELECT 'delegation_events'    AS table_name, COUNT(*) AS rows FROM delegation_events
UNION ALL
SELECT 'llm_call_metrics',                   COUNT(*)         FROM llm_call_metrics
UNION ALL
SELECT 'savings_estimates',                  COUNT(*)         FROM savings_estimates
UNION ALL
SELECT 'delegation_event_log',               COUNT(*)         FROM delegation_event_log
UNION ALL
SELECT 'schema_migrations',                  COUNT(*)         FROM schema_migrations;
EOF

echo "[seed-sqlite] Done. DB ready at: $DB_PATH"
