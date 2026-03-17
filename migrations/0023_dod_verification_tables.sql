-- 0023_dod_verification_tables.sql
-- OMN-5199: DoD verification read-model projection tables.
-- Source topics:
--   onex.evt.omniclaude.dod-verify-completed.v1
--   onex.evt.omniclaude.dod-guard-fired.v1

-- DoD verify runs: one row per verification run, idempotent on run_id.
CREATE TABLE IF NOT EXISTS dod_verify_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id TEXT NOT NULL,
    run_id TEXT NOT NULL UNIQUE,
    session_id TEXT,
    correlation_id TEXT,
    total_checks INTEGER NOT NULL,
    passed_checks INTEGER NOT NULL,
    failed_checks INTEGER NOT NULL,
    skipped_checks INTEGER NOT NULL,
    overall_pass BOOLEAN NOT NULL,
    policy_mode TEXT NOT NULL,
    evidence_items JSONB NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dod_verify_runs_ticket_id ON dod_verify_runs (ticket_id);
CREATE INDEX IF NOT EXISTS idx_dod_verify_runs_event_timestamp ON dod_verify_runs (event_timestamp);
CREATE INDEX IF NOT EXISTS idx_dod_verify_runs_overall_pass ON dod_verify_runs (overall_pass);

-- DoD guard events: append-only, no natural dedup key.
CREATE TABLE IF NOT EXISTS dod_guard_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id TEXT NOT NULL,
    session_id TEXT,
    guard_outcome TEXT NOT NULL,
    policy_mode TEXT NOT NULL,
    receipt_age_seconds NUMERIC(12, 3),
    receipt_pass BOOLEAN,
    event_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dod_guard_events_ticket_id ON dod_guard_events (ticket_id);
CREATE INDEX IF NOT EXISTS idx_dod_guard_events_event_timestamp ON dod_guard_events (event_timestamp);
CREATE INDEX IF NOT EXISTS idx_dod_guard_events_guard_outcome ON dod_guard_events (guard_outcome);
