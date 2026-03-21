-- 0039_runtime_error_triage_state.sql
-- OMN-5652: Runtime Error Triage State — fingerprint-scoped triage results.
-- Source topic: onex.evt.omnibase-infra.error-triaged.v1
-- Replay policy: UPSERT by fingerprint (latest triage action per error family).

CREATE TABLE IF NOT EXISTS runtime_error_triage_state (
    fingerprint              TEXT PRIMARY KEY,
    last_event_id            TEXT NOT NULL,
    action                   TEXT NOT NULL,          -- AUTO_FIXED | TICKET_CREATED | DEDUPED | ESCALATED
    action_status            TEXT NOT NULL,          -- SUCCESS | FAILED | SKIPPED
    ticket_id                TEXT,
    ticket_url               TEXT,
    auto_fix_type            TEXT,
    auto_fix_verified        BOOLEAN,
    severity                 TEXT NOT NULL,
    error_category           TEXT NOT NULL,
    container                TEXT NOT NULL,
    operator_attention_required BOOLEAN DEFAULT FALSE,
    recurrence_count         INTEGER DEFAULT 1,
    first_seen_at            TIMESTAMPTZ NOT NULL,
    last_seen_at             TIMESTAMPTZ NOT NULL,
    last_triaged_at          TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rets_action         ON runtime_error_triage_state (action);
CREATE INDEX IF NOT EXISTS idx_rets_error_category ON runtime_error_triage_state (error_category);
CREATE INDEX IF NOT EXISTS idx_rets_severity       ON runtime_error_triage_state (severity);
CREATE INDEX IF NOT EXISTS idx_rets_operator       ON runtime_error_triage_state (operator_attention_required) WHERE operator_attention_required = TRUE;
CREATE INDEX IF NOT EXISTS idx_rets_last_triaged   ON runtime_error_triage_state (last_triaged_at DESC);
