-- Migration: 0055_bloom_eval_results.sql
-- Adds intelligence_bloom_eval_results table for bloom eval suite outcomes (OMN-8146).
-- Populated by ReadModelConsumer projecting onex.evt.omniintelligence.bloom-eval-completed.v1.

CREATE TABLE IF NOT EXISTS intelligence_bloom_eval_results (
  id              BIGSERIAL PRIMARY KEY,
  suite_id        UUID        NOT NULL,
  spec_id         UUID        NOT NULL,
  failure_mode    TEXT        NOT NULL DEFAULT '',
  total_scenarios INTEGER     NOT NULL DEFAULT 0,
  passed_count    INTEGER     NOT NULL DEFAULT 0,
  failure_rate    FLOAT       NOT NULL DEFAULT 0.0,
  passed_threshold BOOLEAN    NOT NULL DEFAULT FALSE,
  correlation_id  TEXT,
  emitted_at      TIMESTAMPTZ,
  projected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_bloom_eval_suite_emitted UNIQUE (suite_id, emitted_at)
);

CREATE INDEX IF NOT EXISTS idx_bloom_eval_results_suite_id
  ON intelligence_bloom_eval_results (suite_id);

CREATE INDEX IF NOT EXISTS idx_bloom_eval_results_spec_id
  ON intelligence_bloom_eval_results (spec_id);

CREATE INDEX IF NOT EXISTS idx_bloom_eval_results_emitted_at
  ON intelligence_bloom_eval_results (emitted_at DESC);
