-- Migration: Pattern Enforcement Events Table (OMN-2275)
--
-- Stores projected events from:
--   Kafka topic: onex.evt.omniclaude.pattern-enforcement.v1
--
-- Populated by the ReadModelConsumer running in the omnidash backend.
-- Queried by the enforcement-routes.ts API to power the enforcement dashboard.

CREATE TABLE IF NOT EXISTS pattern_enforcement_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unique correlation ID for idempotency (ON CONFLICT DO NOTHING)
  correlation_id   TEXT NOT NULL,
  session_id       TEXT,
  repo             TEXT,
  language         TEXT NOT NULL DEFAULT 'unknown',
  domain           TEXT NOT NULL DEFAULT 'unknown',
  -- Consumer inserts 'unknown' when absent; NULL is rejected to enforce presence
  pattern_name     TEXT NOT NULL,
  pattern_lifecycle_state TEXT,
  -- outcome: hit | violation | corrected | false_positive
  outcome          TEXT NOT NULL CHECK (outcome IN ('hit', 'violation', 'corrected', 'false_positive')),
  confidence       NUMERIC(5, 4),
  agent_name       TEXT,
  -- When the enforcement event originally occurred
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When this row was projected from Kafka
  projected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_pee_correlation_id
  ON pattern_enforcement_events (correlation_id);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_pee_created_at
  ON pattern_enforcement_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pee_outcome
  ON pattern_enforcement_events (outcome);

CREATE INDEX IF NOT EXISTS idx_pee_language
  ON pattern_enforcement_events (language);

CREATE INDEX IF NOT EXISTS idx_pee_domain
  ON pattern_enforcement_events (domain);

CREATE INDEX IF NOT EXISTS idx_pee_pattern_name
  ON pattern_enforcement_events (pattern_name);

-- Composite index for the summary window queries
CREATE INDEX IF NOT EXISTS idx_pee_created_outcome
  ON pattern_enforcement_events (created_at, outcome);
