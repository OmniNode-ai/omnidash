# omnidash SQLite Mode — Integration Testing Onboarding

**Purpose:** This document is the authoritative setup guide for running the omnidash dashboard
against a locally seeded SQLite database. It is written for Brett's Claude Code agent to follow
autonomously. Every command is exact and copy-pasteable. Every expected output is stated.
No production server access is required.

**Audience:** Integration tester without access to 192.168.86.201 (production Postgres).

**Scope:** SQLite local mode only. This covers seeding, starting the stack, verifying all
projection endpoints, and testing the delegation visualization widgets.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Step-by-step setup](#3-step-by-step-setup)
4. [Verification checklist](#4-verification-checklist)
5. [Widget-to-table mapping](#5-widget-to-table-mapping)
6. [Known limitations of SQLite mode](#6-known-limitations-of-sqlite-mode)
7. [Troubleshooting](#7-troubleshooting)
8. [Schema reference](#8-schema-reference)

---

## 1. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  SQLite mode data flow (local, no Kafka, no Postgres)           │
│                                                                 │
│  ┌──────────────────┐   HTTP GET /projection/:topic             │
│  │  Vite SPA        │──────────────────────────────────────────►│
│  │  (port 5173)     │                                           │
│  │                  │◄──────────────────────────────────────────│
│  │  VITE_DATA_SOURCE│   JSON array of projection rows           │
│  │    =http         │                                           │
│  └──────────────────┘   WebSocket ws://localhost:3002/ws        │
│           │             (INVALIDATE signals — optional)         │
│           │                                                     │
│  ┌────────▼──────────────────────────────────────────────────┐  │
│  │  Express bridge  (port 3002)                              │  │
│  │  server/index.ts + server/routes.ts                       │  │
│  │                                                           │  │
│  │  OMNIDASH_DATA_SOURCE=sqlite                              │  │
│  │                                                           │  │
│  │  SqliteProjectionReader                                   │  │
│  │  server/sqlite-projection-reader.ts                       │  │
│  └───────────────────────────────────┬───────────────────────┘  │
│                                      │ better-sqlite3 (readonly) │
│  ┌───────────────────────────────────▼───────────────────────┐  │
│  │  ~/.omninode/delegation/delegation.sqlite                 │  │
│  │                                                           │  │
│  │  Tables: delegation_events  llm_call_metrics              │  │
│  │          savings_estimates  delegation_event_log          │  │
│  │          schema_migrations                                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Seeded by: npm run seed:sqlite                                 │
│             (scripts/seed-sqlite.sh + scripts/seed-sqlite.sql)  │
└─────────────────────────────────────────────────────────────────┘
```

**Key facts:**
- The Express bridge opens the DB read-only. It never writes.
- Data source mode is resolved in priority order: `OMNIDASH_DATA_SOURCE` env var overrides
  `contract.yaml` default. The contract default is currently `postgres`. Always set the env
  var explicitly when running SQLite mode.
- The Vite frontend reads from the bridge via `HttpSnapshotSource`; it never touches the DB
  directly. Setting `VITE_DATA_SOURCE=http` activates this path.
- WebSocket invalidation is optional for testing; all projection data is available over HTTP.

---

## 2. Prerequisites

Check each item before starting. All must pass.

```bash
# Node.js 20 or higher required
node --version
# Expected: v20.x.x or higher

# npm (ships with Node)
npm --version
# Expected: 10.x.x or higher

# sqlite3 CLI (needed by seed script)
sqlite3 --version
# Expected: 3.x.x — if missing: brew install sqlite3

# Confirm you are in the omnidash repo root
ls package.json contract.yaml server/
# Expected: all three exist
```

---

## 3. Step-by-step setup

Execute these steps in order. Do not skip or reorder them.

### Step 1 — Install Node dependencies

```bash
npm install
```

Expected: finishes without error. If `better-sqlite3` fails to build its native binding,
see [Troubleshooting: better-sqlite3 native binding error](#better-sqlite3-native-binding-error).

### Step 2 — Seed the SQLite database

```bash
npm run seed:sqlite
```

This command:
- Creates `~/.omninode/delegation/` if absent
- Creates `~/.omninode/delegation/delegation.sqlite`
- Runs `scripts/seed-sqlite.sql` which defines all tables and inserts sample rows
- Runs ALTER TABLE guards that add the four new Pydantic fields to any pre-existing DB
- Reports row counts when done

**Expected output (exact):**

```
[seed-sqlite] DB path: /Users/<you>/.omninode/delegation/delegation.sqlite
[seed-sqlite] Verifying row counts...
table_name            rows
--------------------  ----
delegation_events     25
llm_call_metrics      18
savings_estimates     12
delegation_event_log  6
schema_migrations     4
[seed-sqlite] Done. DB ready at: /Users/<you>/.omninode/delegation/delegation.sqlite
```

Row counts must match exactly. If any count is 0, the seed failed — see
[Troubleshooting: seed produced zero rows](#seed-produced-zero-rows).

**To re-seed from scratch (wipes all data):**

```bash
rm ~/.omninode/delegation/delegation.sqlite
npm run seed:sqlite
```

### Step 3 — Start the Express bridge in SQLite mode

Open a dedicated terminal window and leave it running throughout testing.

```bash
OMNIDASH_DATA_SOURCE=sqlite npm run dev:server
```

**Expected output:**

```
[omnidash server] Listening on port 3002
```

The `OMNIDASH_DATA_SOURCE=sqlite` env var is mandatory. Without it the server defaults to
`postgres` (per `contract.yaml`) and all projection reads fail with HTTP 500.

### Step 4 — Start the Vite frontend

Open a second terminal window.

```bash
VITE_DATA_SOURCE=http npm run dev
```

**Expected output:**

```
  VITE v5.x.x  ready in Nms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open `http://localhost:5173` in a browser.

---

## 4. Verification checklist

Run all checks with both the Express bridge and Vite frontend running.

### 4a. HTTP endpoint checks

Each command below must return a JSON array or object — never `{"error":"projection read failed"}`.

```bash
# PASS CONDITION: array with exactly 25 objects
curl -s http://localhost:3002/projection/onex.snapshot.projection.delegation.decisions.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'rows={len(d)}')"
# Expected: rows=25

# PASS CONDITION: array with 1 object; totalDelegations must equal 25
curl -s http://localhost:3002/projection/onex.snapshot.projection.delegation.summary.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['totalDelegations'], d[0]['qualityGatePassRate'])"
# Expected: 25 <float between 0.75 and 0.85>

# PASS CONDITION: array with 18 objects
curl -s http://localhost:3002/projection/onex.snapshot.projection.llm_cost.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'rows={len(d)}')"
# Expected: rows=18

# PASS CONDITION: array with 1 object; total_savings_usd must be > 0
curl -s http://localhost:3002/projection/onex.snapshot.projection.savings.summary.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0])"
# Expected: dict with event_count=12, total_savings_usd > 1.0

# PASS CONDITION: array with 12 objects
curl -s http://localhost:3002/projection/onex.snapshot.projection.savings.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'rows={len(d)}')"
# Expected: rows=12

# PASS CONDITION: array with 6 objects; each has envelope and created_at keys
curl -s http://localhost:3002/projection/onex.snapshot.projection.live-events.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'rows={len(d)}'); print(list(d[0].keys()))"
# Expected: rows=6 / ['envelope', 'created_at']

# PASS CONDITION: array with 1 object; total_delegations=25
curl -s http://localhost:3002/projection/onex.snapshot.projection.delegation.model-routing.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['total_delegations'], len(d[0]['by_model']))"
# Expected: 25 4

# PASS CONDITION: array with 1 object; total_checks=25
curl -s http://localhost:3002/projection/onex.snapshot.projection.delegation.quality-gate.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['total_checks'], d[0]['overall_pass_rate'])"
# Expected: 25 <float between 0.75 and 0.85>

# PASS CONDITION: array with 1 object; session_count > 0
curl -s http://localhost:3002/projection/onex.snapshot.projection.delegation.savings.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['session_count'], d[0]['cumulative_savings_usd'])"
# Expected: 12 <float > 1.0>

# PASS CONDITION: array with rows grouped by model; should have 4 model groups
curl -s http://localhost:3002/projection/onex.snapshot.projection.delegation.token-usage.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'model_groups={len(d)}'); [print(r['model_alias'], r['delegation_count']) for r in d]"
# Expected: model_groups=4 (local/qwen3-coder-30b, local/deepseek-r1-14b, cloud/claude-sonnet-4-6, cloud/gpt-4o)

# PASS CONDITION: array with 4 model groups and cost totals
curl -s http://localhost:3002/projection/onex.snapshot.projection.cost.token_usage.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(r['model_id'], r['total_tokens']) for r in d]"
# Expected: 4 rows; qwen3-coder-30b should have highest total_tokens

# PASS CONDITION: 1 row with call_count=18
curl -s http://localhost:3002/projection/onex.snapshot.projection.cost.summary.v1 \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0])"
# Expected: call_count=18, total_cost_usd > 0
```

### 4b. Widget render checks

After opening `http://localhost:5173` in a browser, verify each widget in the dashboard renders
with data rather than an empty/error state.

| Widget display name | Expected visible content |
|---------------------|--------------------------|
| Delegation Metrics | "25 total" delegation count; quality gate pass rate ~80% |
| Routing Decisions | Table rows with model names (qwen3-coder-30b, deepseek-r1-14b, claude-sonnet-4-6, gpt-4o) and task type columns |
| Cost by Model | Bar chart or doughnut with 4 labeled slices; qwen3-coder-30b is the largest slice |
| Cost Trend | Area/bar chart with data points across the last 7 days |
| Cost Summary | KPI tiles showing non-zero total cost and call count |
| Token Usage | Per-model token bar chart; qwen3-coder-30b highest volume |
| Event Stream | List of recent events (ROUTING, DECISION, QUALITY_GATE types) |

Widgets that are upstream-blocked and will remain empty even with seed data:
- Cost by Repo (`onex.snapshot.projection.cost.by_repo.v1`) — upstream emitter not deployed
- Baselines ROI (`onex.snapshot.projection.baselines.roi.v1`) — returns `[]` in SQLite mode
- Quality Scores (`onex.snapshot.projection.baselines.quality.v1`) — returns `[]` in SQLite mode
- Readiness Gate (`onex.snapshot.projection.overnight.v1`) — returns `[]` in SQLite mode

These empty states are expected and not bugs.

---

## 5. Widget-to-table mapping

This table shows the exact data path from SQLite table to rendered widget. Use it to trace
why a widget is empty or showing incorrect data.

| Widget | Topic (projection endpoint) | Backing table(s) | Key columns read |
|--------|----------------------------|------------------|-----------------|
| Delegation Metrics | `onex.snapshot.projection.delegation.summary.v1` | `delegation_events` | `quality_gate_passed`, `latency_ms`, `created_at`, `task_type`, `delegated_to` |
| Routing Decisions | `onex.snapshot.projection.delegation.decisions.v1` | `delegation_events` | `id`, `correlation_id`, `session_id`, `tool_use_id`, `hook_name`, `task_type`, `delegated_to`, `model_name`, `quality_gate_passed`, `quality_gate_detail`, `latency_ms`, `input_redaction_policy`, `contract_version`, `created_at` |
| Delegation Model Routing | `onex.snapshot.projection.delegation.model-routing.v1` | `delegation_events` | `delegated_to`, `model_name`, `task_type`, `quality_gate_passed`, `latency_ms`, `routing_rule`, `routing_confidence`, `routing_candidates` |
| Delegation Quality Gate | `onex.snapshot.projection.delegation.quality-gate.v1` | `delegation_events` | `quality_gate_passed`, `quality_gate_detail`, `quality_gates_checked`, `quality_gates_failed` |
| Delegation Token Usage | `onex.snapshot.projection.delegation.token-usage.v1` | `delegation_events` | `delegated_to`, `model_name`, `tokens_input`, `tokens_output`, `tokens_to_compliance` |
| Delegation Savings | `onex.snapshot.projection.delegation.savings.v1` | `savings_estimates` | all columns; aggregates `savings_usd`, `local_cost_usd`, `cloud_cost_usd` |
| Cost by Model / Cost by Model 3D | `onex.snapshot.projection.llm_cost.v1` | `llm_call_metrics` | `model_id`, `prompt_tokens`, `completion_tokens`, `estimated_cost_usd`, `created_at` |
| Cost Trend | `onex.snapshot.projection.llm_cost.v1` | `llm_call_metrics` | `model_id`, `estimated_cost_usd`, `created_at` (bucketed by time) |
| Cost Summary | `onex.snapshot.projection.cost.summary.v1` | `llm_call_metrics` | aggregate: `COUNT(*)`, `SUM(prompt_tokens)`, `SUM(completion_tokens)`, `SUM(estimated_cost_usd)` |
| Token Usage | `onex.snapshot.projection.cost.token_usage.v1` | `llm_call_metrics` | `model_id`, `prompt_tokens`, `completion_tokens`, `estimated_cost_usd` grouped by `model_id` |
| Savings ROI | `onex.snapshot.projection.savings.summary.v1` | `savings_estimates` | aggregate: `SUM(local_cost_usd)`, `SUM(cloud_cost_usd)`, `SUM(savings_usd)` |
| Event Stream | `onex.snapshot.projection.live-events.v1` | `delegation_event_log` | `envelope`, `created_at` |
| AB Compare | `onex.snapshot.projection.ab-compare.v1` | `llm_call_metrics` | rows where `correlation_id LIKE 'ab-%'` (6 rows in seed) |

**The four new Pydantic fields** are written to `delegation_events` by the delegation adapter.
They are present in the seed but not currently read by any projection query. They are included
so the schema matches the live adapter output exactly:

| Column | Type | Seed value |
|--------|------|------------|
| `tokens_to_compliance` | `INTEGER NOT NULL DEFAULT 0` | 0–62 depending on row |
| `compliance_attempts` | `INTEGER NOT NULL DEFAULT 1` | 1–3 depending on row |
| `prompt_text` | `TEXT` | `[hash:<id>]` placeholder |
| `response_text` | `TEXT` | `[hash:response-<N>]` placeholder |

---

## 6. Known limitations of SQLite mode

These are deliberate architectural constraints, not bugs.

| Limitation | Detail |
|------------|--------|
| No real-time invalidation | WebSocket INVALIDATE signals are not emitted when seed data is static. Widgets poll on load only. Refresh the browser to re-fetch. |
| No Kafka events | SQLite mode reads materialized data only. There is no live event bus. The Event Stream widget shows the 6 seeded `delegation_event_log` rows; it does not receive new events. |
| No cost by repo | The `onex.snapshot.projection.cost.by_repo.v1` topic returns `[]` in SQLite mode. The upstream emitter is not deployed. This is an upstream blocker (OMN-10302), not a seed gap. |
| No baselines / overnight / registration | These topics (`baselines.roi.v1`, `baselines.quality.v1`, `overnight.v1`, `registration.v1`) return `[]` from `SqliteProjectionReader`. Their backing tables do not exist in the SQLite schema. |
| Static timestamps | The seed inserts timestamps relative to `unixepoch()` at seed time. If you run the seed more than 7 days ago and do not re-seed, the dashboard's time-range filters may exclude all data. Re-run `npm run seed:sqlite` (or `rm` + re-seed) to reset timestamps. |
| No auth | The Express bridge has no authentication. It accepts all requests on localhost. Do not expose port 3002 externally. |
| Read-only DB | `SqliteProjectionReader` opens the DB with `readonly: true`. You cannot write to it through the dashboard. Use `sqlite3 ~/.omninode/delegation/delegation.sqlite` directly for manual inspection. |
| Schema migrations not enforced | The seed creates tables directly. If the Python adapter changes its schema and adds new columns not yet in the seed, those queries will fail. Re-run the seed script after pulling new code. |

---

## 7. Troubleshooting

Each entry states the exact error message followed by diagnosis and fix.

---

### `{"error":"projection read failed"}` on all endpoints

**Diagnosis:** The Express bridge is not in SQLite mode. It is attempting to read from Postgres
(which is not available locally) and returning HTTP 500.

**Fix:**

```bash
# Kill the running server (Ctrl-C in its terminal), then:
OMNIDASH_DATA_SOURCE=sqlite npm run dev:server
```

Confirm the mode by checking server startup logs. There should be no Postgres connection attempt.

---

### `{"error":"projection read failed"}` on some endpoints but not others

**Diagnosis:** The DB exists but is missing the table backing those specific topics. This happens
if the seed was applied to a partial schema.

**Fix:**

```bash
rm ~/.omninode/delegation/delegation.sqlite
npm run seed:sqlite
```

---

### Seed produced zero rows

**Symptom:** `npm run seed:sqlite` completes but one or more tables show `rows=0`.

**Diagnosis:** The SQL file failed to execute partially (likely a parse error or constraint
violation on INSERT).

**Fix:** Run the seed directly against a temp DB to see errors:

```bash
sqlite3 /tmp/debug-seed.sqlite < scripts/seed-sqlite.sql 2>&1 | grep -v "duplicate column"
```

If there are errors other than `duplicate column name`, file a bug — the seed SQL is broken.
Clean up:

```bash
rm /tmp/debug-seed.sqlite
```

---

### `sqlite3: command not found`

**Fix:**

```bash
# macOS
brew install sqlite3

# Ubuntu/Debian
sudo apt-get install sqlite3
```

---

### `better-sqlite3` native binding error

**Symptom on `npm install`:**

```
gyp ERR! build error
...
better-sqlite3
```

Or at runtime:

```
Error: The module '...better_sqlite3.node' was compiled against a different Node.js version
```

**Fix:**

```bash
npm rebuild better-sqlite3
```

If that fails, delete and reinstall:

```bash
rm -rf node_modules/better-sqlite3
npm install
```

---

### Port 3002 already in use

**Symptom:**

```
Error: listen EADDRINUSE: address already in use :::3002
```

**Fix:**

```bash
lsof -ti :3002 | xargs kill -9
# Then restart:
OMNIDASH_DATA_SOURCE=sqlite npm run dev:server
```

---

### Port 5173 already in use

**Symptom:** Vite reports a different port (e.g. 5174).

**Fix:** Either use the alternate port Vite printed, or free 5173:

```bash
lsof -ti :5173 | xargs kill -9
VITE_DATA_SOURCE=http npm run dev
```

---

### `Error: ENOENT ~/.omninode/delegation/delegation.sqlite`

**Symptom:** The server starts but returns `[]` for all topics (because
`SqliteProjectionReader.readProjection` returns `[]` when the file does not exist).

**Fix:** The seed script creates the directory automatically. If it still fails:

```bash
mkdir -p "$HOME/.omninode/delegation"
npm run seed:sqlite
```

---

### Widgets show "no data" or skeleton state, but curl returns rows

**Diagnosis:** The Vite frontend is not in http mode. It is reading from `./fixtures/` (file
mode) or Postgres (postgres mode) instead of the Express bridge.

**Fix:** Confirm `VITE_DATA_SOURCE=http` is set in the terminal where `npm run dev` runs.
Env vars set in one terminal do not propagate to another.

```bash
# Stop the Vite process (Ctrl-C), then:
VITE_DATA_SOURCE=http npm run dev
```

---

### Timestamps in widgets show data from days ago or no data in current window

**Diagnosis:** The seed uses `unixepoch()` at seed time. If the seed was run more than 7 days
ago, all timestamps fall outside the dashboard's default time window.

**Fix:** Re-seed:

```bash
rm ~/.omninode/delegation/delegation.sqlite
npm run seed:sqlite
```

---

### `tsx: command not found`

**Symptom:** `npm run dev:server` fails immediately.

**Fix:** tsx is a dev dependency — run `npm install` first.

---

## 8. Schema reference

### `delegation_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | |
| `correlation_id` | `TEXT NOT NULL UNIQUE` | Cross-event trace ID |
| `session_id` | `TEXT` | Claude Code session ID |
| `tool_use_id` | `TEXT` | Tool call ID from the hook payload |
| `hook_name` | `TEXT` | `PreToolUse` or `PostToolUse` |
| `task_type` | `TEXT NOT NULL DEFAULT ''` | `code_review`, `ticket_work`, `test_generation`, `refactor`, `doc_write` |
| `delegated_to` | `TEXT NOT NULL DEFAULT ''` | `local` or `cloud` |
| `model_name` | `TEXT NOT NULL DEFAULT ''` | Full model ID (e.g. `qwen3-coder-30b`) |
| `quality_gate_passed` | `INTEGER NOT NULL DEFAULT 0` | SQLite boolean: 1=pass, 0=fail |
| `quality_gate_detail` | `TEXT` | Gate name and result (e.g. `deterministic:pass`) |
| `quality_gates_checked` | `INTEGER NOT NULL DEFAULT 0` | Number of gates evaluated |
| `quality_gates_failed` | `INTEGER NOT NULL DEFAULT 0` | Number of gates that failed |
| `latency_ms` | `INTEGER` | End-to-end model call latency |
| `tokens_input` | `INTEGER NOT NULL DEFAULT 0` | Prompt token count |
| `tokens_output` | `INTEGER NOT NULL DEFAULT 0` | Completion token count |
| `tokens_to_compliance` | `INTEGER NOT NULL DEFAULT 0` | **New Pydantic field** — tokens consumed reaching compliance |
| `compliance_attempts` | `INTEGER NOT NULL DEFAULT 1` | **New Pydantic field** — retry count before passing gates |
| `prompt_text` | `TEXT` | **New Pydantic field** — redacted; seed stores `[hash:…]` placeholder |
| `response_text` | `TEXT` | **New Pydantic field** — redacted; seed stores `[hash:…]` placeholder |
| `input_hash` | `TEXT` | SHA-256 of the raw prompt (when redaction policy is hash_only) |
| `input_redaction_policy` | `TEXT NOT NULL DEFAULT 'hash_only'` | |
| `routing_rule` | `TEXT` | Matched routing rule name |
| `routing_confidence` | `REAL` | Router confidence score 0–1 |
| `routing_candidates` | `TEXT` | JSON array of candidate models |
| `contract_version` | `TEXT NOT NULL DEFAULT 'v1'` | |
| `created_at` | `REAL NOT NULL` | Unix epoch float (seconds) |

### `llm_call_metrics`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | |
| `input_hash` | `TEXT NOT NULL UNIQUE` | Dedup key |
| `correlation_id` | `TEXT` | Set to `ab-<session>-<N>` for AB-compare rows |
| `model_id` | `TEXT NOT NULL` | Full model identifier |
| `prompt_tokens` | `INTEGER NOT NULL DEFAULT 0` | |
| `completion_tokens` | `INTEGER NOT NULL DEFAULT 0` | |
| `total_tokens` | `INTEGER` | Nullable; may be derived from prompt+completion |
| `estimated_cost_usd` | `REAL NOT NULL DEFAULT 0.0` | |
| `latency_ms` | `INTEGER` | |
| `usage_source` | `TEXT NOT NULL DEFAULT 'estimated'` | `measured` or `estimated` |
| `token_provenance` | `TEXT` | `api_response` or `token_count` |
| `task_description` | `TEXT` | Human-readable task label |
| `created_at` | `REAL NOT NULL` | Unix epoch float (seconds) |

### `savings_estimates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | |
| `session_id` | `TEXT NOT NULL` | Maps to `delegation_events.session_id` |
| `event_timestamp` | `REAL NOT NULL` | Unix epoch float |
| `model_local` | `TEXT NOT NULL` | Local model used (e.g. `qwen3-coder-30b`) |
| `model_cloud_baseline` | `TEXT NOT NULL` | Baseline cloud model for comparison |
| `local_cost_usd` | `REAL NOT NULL DEFAULT 0.0` | Actual local cost |
| `cloud_cost_usd` | `REAL NOT NULL DEFAULT 0.0` | Hypothetical cloud cost |
| `savings_usd` | `REAL NOT NULL DEFAULT 0.0` | `cloud_cost_usd - local_cost_usd` |
| `baseline_model` | `TEXT NOT NULL` | Canonical baseline model name |
| `pricing_manifest_version` | `TEXT NOT NULL DEFAULT 'v1'` | |
| `savings_method` | `TEXT NOT NULL DEFAULT 'token_diff'` | |
| `usage_source` | `TEXT NOT NULL DEFAULT 'estimated'` | |
| `created_at` | `REAL NOT NULL` | Unix epoch float (seconds) |
| UNIQUE | `(session_id, event_timestamp, model_local, model_cloud_baseline)` | Dedup key |

### `delegation_event_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | |
| `envelope` | `TEXT NOT NULL` | JSON string — raw event envelope |
| `created_at` | `REAL NOT NULL` | Unix epoch float (seconds) |

### `schema_migrations`

| Column | Type | Notes |
|--------|------|-------|
| `version` | `TEXT PRIMARY KEY` | Migration version string |
| `applied_at` | `REAL NOT NULL` | Unix epoch float when applied |

### Seed data summary

| Table | Row count | Time range | Models / values |
|-------|-----------|------------|-----------------|
| `delegation_events` | 25 | last 7 days | qwen3-coder-30b (local), deepseek-r1-14b (local), claude-sonnet-4-6 (cloud), gpt-4o (cloud) |
| `llm_call_metrics` | 18 | last 7 days | same 4 models; 6 rows have `ab-` correlation IDs for AB-compare widget |
| `savings_estimates` | 12 | last 7 days | local models vs claude-sonnet-4-6 and gpt-4o baselines |
| `delegation_event_log` | 6 | last 4 hours | ROUTING, DECISION, QUALITY_GATE envelope types |
| `schema_migrations` | 4 | n/a | versions 001–004 |
