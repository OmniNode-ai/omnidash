-- Migration: Fix llm_cost_aggregates schema (OMN cost-trends fix)
--
-- The table was previously created with a legacy schema (aggregation_key, window,
-- call_count) that predates the cost-trend dashboard and the 0003 migration.
-- Because 0003 used CREATE TABLE IF NOT EXISTS, it silently no-oped and left the
-- old schema in place. This migration drops the stale table and recreates it with
-- the correct schema expected by CostMetricsProjection.
--
-- Safe to run: the old table contains zero rows (confirmed 2026-04-09).

DROP TABLE IF EXISTS llm_cost_aggregates;

CREATE TABLE llm_cost_aggregates (
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
CREATE INDEX idx_llm_cost_agg_bucket_time
  ON llm_cost_aggregates (bucket_time);

-- Breakdown query indexes
CREATE INDEX idx_llm_cost_agg_model
  ON llm_cost_aggregates (model_name);

-- Partial indexes for nullable drill-down columns
CREATE INDEX idx_llm_cost_agg_repo
  ON llm_cost_aggregates (repo_name) WHERE repo_name IS NOT NULL;

CREATE INDEX idx_llm_cost_agg_pattern
  ON llm_cost_aggregates (pattern_id) WHERE pattern_id IS NOT NULL;

CREATE INDEX idx_llm_cost_agg_session
  ON llm_cost_aggregates (session_id) WHERE session_id IS NOT NULL;

CREATE INDEX idx_llm_cost_agg_source
  ON llm_cost_aggregates (usage_source);

-- Composite indexes for the most common query patterns
CREATE INDEX idx_llm_cost_agg_bucket_model
  ON llm_cost_aggregates (bucket_time, model_name);

CREATE INDEX idx_llm_cost_agg_bucket_granularity
  ON llm_cost_aggregates (bucket_time, granularity);
