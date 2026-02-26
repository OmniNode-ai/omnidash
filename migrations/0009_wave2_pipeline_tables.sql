-- Migration: Wave 2 Pipeline Dashboard Tables (OMN-2907 / OMN-2596)
--
-- Stores projected events from five Wave 2 Kafka topics consumed by
-- the read-model-consumer:
--
--   onex.evt.omniclaude.gate-decision.v1          → gate_decisions
--   onex.evt.omniclaude.epic-run-updated.v1       → epic_run_events, epic_run_lease
--   onex.evt.omniclaude.pr-watch-updated.v1       → pr_watch_state
--   onex.evt.omniclaude.budget-cap-hit.v1         → pipeline_budget_state
--   onex.evt.omniclaude.circuit-breaker-tripped.v1 → debug_escalation_counts
--
-- Without this migration the projectors silently catch 42P01 (table-not-exists)
-- and the /epic-pipeline, /gate-decisions, /pr-watch, and /pipeline-budget
-- dashboard pages show permanently empty state.
--
-- All tables use:
--   - correlation_id TEXT NOT NULL UNIQUE for idempotent ON CONFLICT DO NOTHING upserts
--   - projected_at TIMESTAMPTZ DEFAULT NOW() for watermark tracking

-- ---------------------------------------------------------------------------
-- gate_decisions
-- ---------------------------------------------------------------------------
-- One row per CI gate evaluation event (gate-decision.v1).
-- Each evaluation is unique by (correlation_id).

CREATE TABLE IF NOT EXISTS gate_decisions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT        NOT NULL UNIQUE,
  session_id     TEXT,
  pr_number      INTEGER,
  repo           TEXT,
  gate_name      TEXT        NOT NULL DEFAULT 'unknown',
  outcome        TEXT        NOT NULL DEFAULT 'unknown',
  blocking       BOOLEAN     NOT NULL DEFAULT FALSE,
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-series index for gate decision queries
CREATE INDEX IF NOT EXISTS idx_gate_decisions_created_at
  ON gate_decisions (created_at DESC);

-- Index for per-PR gate breakdown
CREATE INDEX IF NOT EXISTS idx_gate_decisions_pr_number
  ON gate_decisions (pr_number, created_at DESC);

-- Index for per-gate-name outcome aggregation
CREATE INDEX IF NOT EXISTS idx_gate_decisions_gate_name
  ON gate_decisions (gate_name, created_at DESC);

-- Index for blocking gate filter
CREATE INDEX IF NOT EXISTS idx_gate_decisions_blocking
  ON gate_decisions (blocking, created_at DESC);

-- ---------------------------------------------------------------------------
-- epic_run_events
-- ---------------------------------------------------------------------------
-- Append-only event log for epic pipeline run events (epic-run-updated.v1).
-- Each event is a row; deduplication uses (correlation_id).

CREATE TABLE IF NOT EXISTS epic_run_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT        NOT NULL UNIQUE,
  epic_run_id    TEXT        NOT NULL,
  event_type     TEXT        NOT NULL DEFAULT 'unknown',
  ticket_id      TEXT,
  repo           TEXT,
  payload        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-series index for epic run event queries
CREATE INDEX IF NOT EXISTS idx_epic_run_events_created_at
  ON epic_run_events (created_at DESC);

-- Index for per-epic-run event log lookups
CREATE INDEX IF NOT EXISTS idx_epic_run_events_epic_run_id
  ON epic_run_events (epic_run_id, created_at DESC);

-- Index for event type breakdown
CREATE INDEX IF NOT EXISTS idx_epic_run_events_event_type
  ON epic_run_events (event_type, created_at DESC);

-- Index for per-ticket epic run lookups
CREATE INDEX IF NOT EXISTS idx_epic_run_events_ticket_id
  ON epic_run_events (ticket_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- epic_run_lease
-- ---------------------------------------------------------------------------
-- Current lease holder per epic run (upserted on each epic-run-updated.v1
-- event that contains lease fields). One row per epic_run_id.

CREATE TABLE IF NOT EXISTS epic_run_lease (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_run_id      TEXT        NOT NULL UNIQUE,
  lease_holder     TEXT        NOT NULL DEFAULT 'unknown',
  lease_expires_at TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lease expiry queries (e.g. finding expired leases)
CREATE INDEX IF NOT EXISTS idx_epic_run_lease_expires_at
  ON epic_run_lease (lease_expires_at);

-- Index for lease holder lookups
CREATE INDEX IF NOT EXISTS idx_epic_run_lease_holder
  ON epic_run_lease (lease_holder);

-- ---------------------------------------------------------------------------
-- pr_watch_state
-- ---------------------------------------------------------------------------
-- Per-PR watch state snapshot events (pr-watch-updated.v1).
-- Each event is a row; deduplication uses (correlation_id).

CREATE TABLE IF NOT EXISTS pr_watch_state (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT        NOT NULL UNIQUE,
  pr_number      INTEGER,
  repo           TEXT,
  state          TEXT        NOT NULL DEFAULT 'unknown',
  checks_status  TEXT,
  review_status  TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-series index for PR watch state queries
CREATE INDEX IF NOT EXISTS idx_pr_watch_state_created_at
  ON pr_watch_state (created_at DESC);

-- Index for per-PR state history lookups
CREATE INDEX IF NOT EXISTS idx_pr_watch_state_pr_number
  ON pr_watch_state (pr_number, created_at DESC);

-- Index for state filter queries
CREATE INDEX IF NOT EXISTS idx_pr_watch_state_state
  ON pr_watch_state (state, created_at DESC);

-- ---------------------------------------------------------------------------
-- pipeline_budget_state
-- ---------------------------------------------------------------------------
-- Budget cap hit events per pipeline run (budget-cap-hit.v1).
-- Each event is a row; deduplication uses (correlation_id).

CREATE TABLE IF NOT EXISTS pipeline_budget_state (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT        NOT NULL UNIQUE,
  pipeline_id    TEXT        NOT NULL,
  budget_type    TEXT        NOT NULL DEFAULT 'tokens',
  cap_value      NUMERIC(18, 4),
  current_value  NUMERIC(18, 4),
  cap_hit        BOOLEAN     NOT NULL DEFAULT TRUE,
  repo           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-series index for budget state queries
CREATE INDEX IF NOT EXISTS idx_pipeline_budget_state_created_at
  ON pipeline_budget_state (created_at DESC);

-- Index for per-pipeline budget lookups
CREATE INDEX IF NOT EXISTS idx_pipeline_budget_state_pipeline_id
  ON pipeline_budget_state (pipeline_id, created_at DESC);

-- Index for budget type aggregation
CREATE INDEX IF NOT EXISTS idx_pipeline_budget_state_budget_type
  ON pipeline_budget_state (budget_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- debug_escalation_counts
-- ---------------------------------------------------------------------------
-- Circuit breaker trip events from the debug escalation circuit breaker
-- (circuit-breaker-tripped.v1). Each trip event is a row; deduplication
-- uses (correlation_id).

CREATE TABLE IF NOT EXISTS debug_escalation_counts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id   TEXT        NOT NULL UNIQUE,
  session_id       TEXT,
  agent_name       TEXT        NOT NULL DEFAULT 'unknown',
  escalation_count INTEGER     NOT NULL DEFAULT 1,
  window_start     TIMESTAMPTZ,
  window_end       TIMESTAMPTZ,
  tripped          BOOLEAN     NOT NULL DEFAULT TRUE,
  repo             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-series index for escalation count queries
CREATE INDEX IF NOT EXISTS idx_debug_escalation_counts_created_at
  ON debug_escalation_counts (created_at DESC);

-- Index for per-agent escalation breakdown
CREATE INDEX IF NOT EXISTS idx_debug_escalation_counts_agent_name
  ON debug_escalation_counts (agent_name, created_at DESC);

-- Index for per-session escalation lookups
CREATE INDEX IF NOT EXISTS idx_debug_escalation_counts_session_id
  ON debug_escalation_counts (session_id, created_at DESC);

-- Index for tripped filter
CREATE INDEX IF NOT EXISTS idx_debug_escalation_counts_tripped
  ON debug_escalation_counts (tripped, created_at DESC);
