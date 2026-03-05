-- OMN-3747: Create plan_review_runs table for plan-reviewer strategy run tracking
--
-- Read-model projection of plan-review strategy run completions from omniintelligence.
-- Populated by ReadModelConsumer projecting
-- onex.evt.omniintelligence.plan-review-strategy-run-completed.v1
--
-- Source schema: omnidash/shared/intelligence-schema.ts (planReviewRuns, lines 1164-1199)

CREATE TABLE IF NOT EXISTS plan_review_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  models_used TEXT[] NOT NULL DEFAULT '{}',
  plan_text_hash TEXT NOT NULL,
  findings_count INTEGER NOT NULL DEFAULT 0,
  blocks_count INTEGER NOT NULL DEFAULT 0,
  categories_with_findings TEXT[] NOT NULL DEFAULT '{}',
  categories_clean TEXT[] NOT NULL DEFAULT '{}',
  avg_confidence DOUBLE PRECISION,
  tokens_used INTEGER,
  duration_ms INTEGER,
  strategy_run_stored BOOLEAN NOT NULL DEFAULT false,
  model_weights JSONB,
  emitted_at TIMESTAMPTZ NOT NULL,
  projected_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_review_runs_run_id ON plan_review_runs (run_id);
CREATE INDEX IF NOT EXISTS idx_plan_review_runs_strategy ON plan_review_runs (strategy);
CREATE INDEX IF NOT EXISTS idx_plan_review_runs_emitted_at ON plan_review_runs (emitted_at);
