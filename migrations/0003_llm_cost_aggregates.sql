-- Migration: LLM Cost Aggregates Table (OMN-2300 / OMN-2329)
--
-- Stores pre-aggregated LLM cost and token usage data for the cost trend
-- dashboard. Populated by the ReadModelConsumer projecting events from:
--   Kafka topic: onex.evt.omniclaude.llm-cost-reported.v1
--
-- Queried by CostMetricsProjection (server/projections/cost-metrics-projection.ts)
-- which backs the cost-routes.ts REST API consumed by the CostTrendDashboard.
--
-- usage_source values:
--   API       -- cost reported directly by the LLM provider's usage API
--   ESTIMATED -- cost derived from heuristic token-count estimation
--   MISSING   -- placeholder row when data could not be obtained
--
-- No unique key: multiple events for the same model+session are valid.
-- Idempotency is achieved via Kafka consumer group offset tracking.
-- See ReadModelConsumer.projectLlmCostEvent() for the projection logic.

CREATE TABLE IF NOT EXISTS llm_cost_aggregates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time bucket for this aggregate row (hourly or daily granularity)
  bucket_time      TIMESTAMPTZ NOT NULL,
  -- Granularity of the bucket: 'hour' or 'day'
  granularity      TEXT NOT NULL DEFAULT 'hour' CHECK (granularity IN ('hour', 'day')),

  -- LLM model that generated the usage (e.g. 'claude-sonnet-4-6', 'gpt-4o')
  model_name       TEXT NOT NULL,

  -- Optional context dimensions for drill-down views
  -- Null when the event did not carry these fields
  repo_name        TEXT,
  pattern_id       TEXT,
  pattern_name     TEXT,
  session_id       TEXT,

  -- Data provenance: API | ESTIMATED | MISSING
  usage_source     TEXT NOT NULL DEFAULT 'API' CHECK (usage_source IN ('API', 'ESTIMATED', 'MISSING')),

  -- Request count in this aggregate bucket
  request_count    INTEGER NOT NULL DEFAULT 0,

  -- Token counts
  prompt_tokens    BIGINT NOT NULL DEFAULT 0,
  completion_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens     BIGINT NOT NULL DEFAULT 0,

  -- Cost in USD (stored as NUMERIC to avoid float rounding errors)
  -- precision=12, scale=6 supports values up to $999,999.999999
  total_cost_usd    NUMERIC(12, 6) NOT NULL DEFAULT 0,
  reported_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,

  -- Audit timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary time-series query index (used by querySummary, queryTrend, queryTokenUsage)
CREATE INDEX IF NOT EXISTS idx_llm_cost_agg_bucket_time
  ON llm_cost_aggregates (bucket_time);

-- Breakdown query indexes
CREATE INDEX IF NOT EXISTS idx_llm_cost_agg_model
  ON llm_cost_aggregates (model_name);

CREATE INDEX IF NOT EXISTS idx_llm_cost_agg_repo
  ON llm_cost_aggregates (repo_name);

CREATE INDEX IF NOT EXISTS idx_llm_cost_agg_pattern
  ON llm_cost_aggregates (pattern_id);

CREATE INDEX IF NOT EXISTS idx_llm_cost_agg_session
  ON llm_cost_aggregates (session_id);

CREATE INDEX IF NOT EXISTS idx_llm_cost_agg_source
  ON llm_cost_aggregates (usage_source);

-- Composite index for the most common query pattern: window filter + model grouping
CREATE INDEX IF NOT EXISTS idx_llm_cost_agg_bucket_model
  ON llm_cost_aggregates (bucket_time, model_name);
