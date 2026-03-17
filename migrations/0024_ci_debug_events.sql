-- 0024_ci_debug_events.sql
-- OMN-5282: CI Intelligence debug escalation read-model projection table.
-- Source topic: onex.evt.omniintelligence.ci-debug-escalation.v1

CREATE TABLE IF NOT EXISTS ci_debug_escalation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    error_type TEXT NOT NULL,
    escalation_level TEXT NOT NULL,
    resolution TEXT,
    event_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ci_debug_escalation_events_run_id_node_id_unique UNIQUE (run_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_ci_debug_escalation_events_run_id ON ci_debug_escalation_events (run_id);
CREATE INDEX IF NOT EXISTS idx_ci_debug_escalation_events_event_timestamp ON ci_debug_escalation_events (event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ci_debug_escalation_events_escalation_level ON ci_debug_escalation_events (escalation_level);
CREATE INDEX IF NOT EXISTS idx_ci_debug_escalation_events_error_type ON ci_debug_escalation_events (error_type);
