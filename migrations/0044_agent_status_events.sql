-- 0044_agent_status_events.sql
-- OMN-5604: Agent Status Events — append-only audit table for agent lifecycle
-- status transitions. Used by agent registry page for timeline and latest-status.
-- Source topic: onex.evt.omniclaude.agent-status.v1
-- Replay policy: APPEND (idempotent via unique source_event_id).

CREATE TABLE IF NOT EXISTS agent_status_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_event_id   TEXT NOT NULL,
    agent_id          TEXT NOT NULL,
    agent_name        TEXT,
    status            VARCHAR(50) NOT NULL,
    previous_status   VARCHAR(50),
    session_id        TEXT,
    correlation_id    TEXT,
    reason            TEXT,
    metadata          JSONB DEFAULT '{}',
    reported_at       TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    projected_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ase_agent_id        ON agent_status_events (agent_id);
CREATE INDEX IF NOT EXISTS idx_ase_reported_at     ON agent_status_events (reported_at);
CREATE INDEX IF NOT EXISTS idx_ase_agent_reported  ON agent_status_events (agent_id, reported_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ase_source_event ON agent_status_events (source_event_id);
