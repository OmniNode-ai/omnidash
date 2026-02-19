-- Migration: Delegation Events Tables (OMN-2284)
--
-- Stores projected events from:
--   Kafka topic: onex.evt.omniclaude.task-delegated.v1           → delegation_events
--   Kafka topic: onex.evt.omniclaude.delegation-shadow-comparison.v1 → delegation_shadow_comparisons
--
-- Populated by the ReadModelConsumer running in the omnidash backend.
-- Queried by delegation-routes.ts to power the Delegation Metrics dashboard.
--
-- GOLDEN METRIC: quality_gate_pass_rate (quality_gate_passed = true / total) >= 80%.
-- Shadow divergence rate (divergence_detected = true / total comparisons) < 10%.

-- ---------------------------------------------------------------------------
-- delegation_events
-- ---------------------------------------------------------------------------
-- Each row represents one task-delegated event. The correlation_id is used for
-- idempotent upserts (ON CONFLICT DO NOTHING in the consumer). The UNIQUE
-- constraint is declared inline so it is created atomically with the table;
-- a failed partial migration would otherwise leave the table without the
-- constraint and allow silent duplicate accumulation.

CREATE TABLE IF NOT EXISTS delegation_events (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unique correlation ID for idempotent upserts.
  correlation_id        TEXT        NOT NULL UNIQUE,
  session_id            TEXT,
  -- When the delegation originally occurred (from the upstream event payload)
  timestamp             TIMESTAMPTZ NOT NULL,
  -- Coarse task type label (e.g. "code-generation", "review", "debugging")
  task_type             TEXT        NOT NULL,
  -- Agent that received the delegated task
  delegated_to          TEXT        NOT NULL,
  -- Agent or orchestrator that issued the delegation (optional)
  delegated_by          TEXT,
  -- Whether all quality gates passed for this delegation
  quality_gate_passed   BOOLEAN     NOT NULL DEFAULT FALSE,
  -- JSON array of gate names that were checked (nullable when not reported)
  quality_gates_checked JSONB,
  -- JSON array of gate names that failed (nullable when all passed)
  quality_gates_failed  JSONB,
  -- Actual cost incurred for the delegated task (USD); NULL when not reported
  cost_usd              NUMERIC(12, 8) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  -- Estimated savings vs. a non-delegated baseline (USD); NULL when not reported
  cost_savings_usd      NUMERIC(12, 8) CHECK (cost_savings_usd IS NULL OR cost_savings_usd >= 0),
  -- End-to-end delegation latency in milliseconds; NULL when not reported
  delegation_latency_ms INTEGER       CHECK (delegation_latency_ms IS NULL OR delegation_latency_ms >= 0),
  -- Repository that originated the delegation (optional)
  repo                  TEXT,
  -- TRUE when this delegation was a shadow/dry-run invocation
  is_shadow             BOOLEAN     NOT NULL DEFAULT FALSE,
  -- When this row was projected from Kafka into the read model
  projected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary time-series index (most dashboard queries are time-window scoped)
CREATE INDEX IF NOT EXISTS idx_delegation_events_timestamp
  ON delegation_events (timestamp DESC);

-- Index for task-type breakdown aggregations
CREATE INDEX IF NOT EXISTS idx_delegation_events_task_type
  ON delegation_events (task_type, timestamp DESC);

-- Index for per-agent delegation breakdown
CREATE INDEX IF NOT EXISTS idx_delegation_events_delegated_to
  ON delegation_events (delegated_to, timestamp DESC);

-- Index for quality-gate pass/fail ratio queries
CREATE INDEX IF NOT EXISTS idx_delegation_events_quality_gate
  ON delegation_events (quality_gate_passed, timestamp DESC);

-- ---------------------------------------------------------------------------
-- delegation_shadow_comparisons
-- ---------------------------------------------------------------------------
-- Each row represents one shadow-validation comparison event. The shadow agent
-- runs in parallel with the primary agent; divergence_detected = TRUE means
-- the two agents produced meaningfully different outputs.

CREATE TABLE IF NOT EXISTS delegation_shadow_comparisons (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unique correlation ID for idempotent upserts.
  correlation_id      TEXT        NOT NULL UNIQUE,
  session_id          TEXT,
  -- When the shadow comparison originally occurred
  timestamp           TIMESTAMPTZ NOT NULL,
  -- Coarse task type label (same taxonomy as delegation_events.task_type)
  task_type           TEXT        NOT NULL,
  -- Agent used as the primary (non-shadow) path
  primary_agent       TEXT        NOT NULL,
  -- Agent used as the shadow (parallel dry-run) path
  shadow_agent        TEXT        NOT NULL,
  -- Whether the primary and shadow outputs diverged beyond the tolerance threshold
  divergence_detected BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Continuous divergence measure (0.0 = identical, 1.0 = completely different);
  -- NULL when the upstream event does not include a score.
  divergence_score    NUMERIC(5, 4) CHECK (divergence_score IS NULL OR (divergence_score >= 0 AND divergence_score <= 1)),
  -- Latency for the primary agent path in milliseconds
  primary_latency_ms  INTEGER       CHECK (primary_latency_ms IS NULL OR primary_latency_ms >= 0),
  -- Latency for the shadow agent path in milliseconds
  shadow_latency_ms   INTEGER       CHECK (shadow_latency_ms IS NULL OR shadow_latency_ms >= 0),
  -- Cost incurred by the primary agent path (USD); NULL when not reported
  primary_cost_usd    NUMERIC(12, 8) CHECK (primary_cost_usd IS NULL OR primary_cost_usd >= 0),
  -- Cost incurred by the shadow agent path (USD); NULL when not reported
  shadow_cost_usd     NUMERIC(12, 8) CHECK (shadow_cost_usd IS NULL OR shadow_cost_usd >= 0),
  -- Human-readable description of what caused the divergence (optional)
  divergence_reason   TEXT,
  -- When this row was projected from Kafka into the read model
  projected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary time-series index
CREATE INDEX IF NOT EXISTS idx_delegation_shadow_timestamp
  ON delegation_shadow_comparisons (timestamp DESC);

-- Index for task-type divergence breakdown
CREATE INDEX IF NOT EXISTS idx_delegation_shadow_task_type
  ON delegation_shadow_comparisons (task_type, timestamp DESC);

-- Index for per-primary-agent divergence analysis
CREATE INDEX IF NOT EXISTS idx_delegation_shadow_primary_agent
  ON delegation_shadow_comparisons (primary_agent, timestamp DESC);

-- Index for divergence-rate aggregation (GROUP BY divergence_detected)
CREATE INDEX IF NOT EXISTS idx_delegation_shadow_divergence
  ON delegation_shadow_comparisons (divergence_detected, timestamp DESC);
