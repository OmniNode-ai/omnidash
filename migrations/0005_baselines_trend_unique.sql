-- ============================================================================
-- OMN-2328 / OMN-2331: Add UNIQUE(snapshot_id, date) to baselines_trend
--
-- The ReadModelConsumer deduplicates trend rows by date in-memory before
-- inserting, but without a DB-level constraint a future code path or direct
-- insert could produce duplicate (snapshot_id, date) pairs, silently inflating
-- the summary averages derived in BaselinesProjection._deriveSummary().
-- ============================================================================

ALTER TABLE baselines_trend
  ADD CONSTRAINT baselines_trend_snapshot_date_unique UNIQUE (snapshot_id, date);
