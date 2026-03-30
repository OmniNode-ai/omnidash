-- Migration: 0046_purge_bloat_and_stale_data
-- Purpose: Purge accumulated bloat from event_bus_events and pattern tables [OMN-7009]
-- Safety: All DELETEs are idempotent. Re-running is safe.
-- Note: event_bus_events lives in omnibase_infra's schema, not omnidash's.
--       It only exists when omnidash shares the same database as omnibase_infra
--       (production/local). In CI, the table does not exist, so we guard with
--       IF EXISTS checks via PL/pgSQL.

-- Phases 1-3: Purge from event_bus_events (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'event_bus_events'
  ) THEN
    -- Phase 1: Purge heartbeat events (645K+ rows, ~265 MB)
    DELETE FROM event_bus_events
    WHERE topic = 'onex.evt.platform.node-heartbeat.v1';

    -- Phase 2: Purge pattern event duplicates from event_bus_events
    -- These are already projected into pattern_learning_artifacts by
    -- OmniintelligenceProjectionHandler — storing raw events is redundant
    DELETE FROM event_bus_events
    WHERE topic IN (
      'onex.evt.omniintelligence.pattern-learned.v1',
      'onex.evt.omniintelligence.pattern-stored.v1',
      'onex.evt.omniintelligence.pattern-projection.v1',
      'onex.cmd.omniintelligence.pattern-learning.v1'
    );

    -- Phase 3: Purge wiring-health-snapshot events older than 1 day
    -- Only the latest snapshot matters
    DELETE FROM event_bus_events
    WHERE topic = 'onex.evt.omnibase-infra.wiring-health-snapshot.v1'
      AND created_at < NOW() - INTERVAL '1 day';
  END IF;
END $$;

-- Phase 4: Purge junk patterns from pattern_learning_artifacts
-- file_access_pattern: co-access noise (all score 0.5, unmeasured)
DELETE FROM pattern_learning_artifacts
WHERE pattern_type = 'file_access_pattern';

-- pipeline_request: 1,950+ identical "learning_requested" duplicates (all score 0.0)
DELETE FROM pattern_learning_artifacts
WHERE pattern_type = 'pipeline_request';

-- learned_pattern: score 0.0, unmeasured, never promoted
DELETE FROM pattern_learning_artifacts
WHERE pattern_type = 'learned_pattern'
  AND composite_score = 0;

-- Phase 5: Cascade-clean dependent tables whose parent patterns were just deleted
-- pattern_lifecycle_transitions references patterns that no longer exist
DELETE FROM pattern_lifecycle_transitions
WHERE pattern_id NOT IN (SELECT pattern_id FROM pattern_learning_artifacts);

-- pattern_quality_metrics for deleted patterns
DELETE FROM pattern_quality_metrics
WHERE pattern_id NOT IN (SELECT pattern_id FROM pattern_learning_artifacts);

-- Note: injection_effectiveness is not pattern-keyed (uses session_id),
-- so no cascade-clean is needed for that table.

-- Phase 6: Purge event_bus_events older than 7 days for high-volume operational topics
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'event_bus_events'
  ) THEN
    DELETE FROM event_bus_events
    WHERE topic IN (
      'onex.evt.omniclaude.tool-executed.v1',
      'onex.cmd.omniintelligence.tool-content.v1',
      'onex.cmd.omniintelligence.promotion-check-requested.v1',
      'onex.cmd.omniintelligence.session-outcome.v1',
      'onex.evt.omniclaude.session-outcome.v1'
    )
    AND created_at < NOW() - INTERVAL '7 days';
  END IF;
END $$;
