-- Migration: Baselines & ROI Tables (OMN-2331)
--
-- Stores snapshots produced by the upstream baselines-computed Kafka event:
--   onex.evt.omnibase-infra.baselines-computed.v1
--
-- Populated by ReadModelConsumer projecting BaselinesSnapshotEvent into:
--   baselines_snapshots    -- one row per emitted snapshot
--   baselines_comparisons  -- pattern comparison rows (FK: snapshot_id)
--   baselines_trend        -- ROI trend rows (FK: snapshot_id)
--   baselines_breakdown    -- recommendation breakdown rows (FK: snapshot_id)
--
-- Queried by BaselinesProjection (server/projections/baselines-projection.ts)
-- which backs the baselines-routes.ts REST API consumed by the BaselinesROI page.
--
-- Snapshot lifecycle:
--   1. Consumer receives event, upserts baselines_snapshots.
--   2. Atomically deletes then re-inserts child rows for that snapshot_id.
--   3. Routes query MAX(computed_at_utc) to find the latest snapshot.

-- ============================================================================
-- baselines_snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS baselines_snapshots (
  snapshot_id       UUID PRIMARY KEY,
  contract_version  INTEGER NOT NULL DEFAULT 1,
  computed_at_utc   TIMESTAMPTZ NOT NULL,
  window_start_utc  TIMESTAMPTZ,
  window_end_utc    TIMESTAMPTZ,
  projected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query: find the latest snapshot fast
CREATE INDEX IF NOT EXISTS idx_baselines_snapshots_computed
  ON baselines_snapshots (computed_at_utc DESC);

-- ============================================================================
-- baselines_comparisons
-- ============================================================================

CREATE TABLE IF NOT EXISTS baselines_comparisons (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id           UUID NOT NULL REFERENCES baselines_snapshots (snapshot_id) ON DELETE CASCADE,
  pattern_id            TEXT NOT NULL,
  pattern_name          TEXT NOT NULL,
  sample_size           INTEGER NOT NULL DEFAULT 0,
  window_start          TEXT NOT NULL DEFAULT '',
  window_end            TEXT NOT NULL DEFAULT '',
  -- DeltaMetric stored as JSONB: { label, baseline, candidate, delta, direction, unit }
  token_delta           JSONB NOT NULL DEFAULT '{}',
  time_delta            JSONB NOT NULL DEFAULT '{}',
  retry_delta           JSONB NOT NULL DEFAULT '{}',
  test_pass_rate_delta  JSONB NOT NULL DEFAULT '{}',
  review_iteration_delta JSONB NOT NULL DEFAULT '{}',
  -- 'promote' | 'shadow' | 'suppress' | 'fork'
  recommendation        TEXT NOT NULL,
  -- 'high' | 'medium' | 'low'
  confidence            TEXT NOT NULL,
  rationale             TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baselines_comparisons_snapshot
  ON baselines_comparisons (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_baselines_comparisons_pattern
  ON baselines_comparisons (pattern_id);

CREATE INDEX IF NOT EXISTS idx_baselines_comparisons_recommendation
  ON baselines_comparisons (recommendation);

-- ============================================================================
-- baselines_trend
-- ============================================================================

CREATE TABLE IF NOT EXISTS baselines_trend (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id              UUID NOT NULL REFERENCES baselines_snapshots (snapshot_id) ON DELETE CASCADE,
  -- ISO date string (YYYY-MM-DD) for the data point
  date                     TEXT NOT NULL,
  avg_cost_savings         NUMERIC(8, 6) NOT NULL DEFAULT 0,
  avg_outcome_improvement  NUMERIC(8, 6) NOT NULL DEFAULT 0,
  comparisons_evaluated    INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baselines_trend_snapshot
  ON baselines_trend (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_baselines_trend_date
  ON baselines_trend (date);

-- ============================================================================
-- baselines_breakdown
-- ============================================================================

CREATE TABLE IF NOT EXISTS baselines_breakdown (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     UUID NOT NULL REFERENCES baselines_snapshots (snapshot_id) ON DELETE CASCADE,
  -- 'promote' | 'shadow' | 'suppress' | 'fork'
  action          TEXT NOT NULL,
  count           INTEGER NOT NULL DEFAULT 0,
  avg_confidence  NUMERIC(5, 4) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baselines_breakdown_snapshot
  ON baselines_breakdown (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_baselines_breakdown_action
  ON baselines_breakdown (action);
