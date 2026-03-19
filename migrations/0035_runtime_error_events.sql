-- 0035_runtime_error_events.sql
-- OMN-5528: Runtime Errors Dashboard — stores runtime error events.
-- Source topic: onex.evt.omnibase-infra.runtime-error.v1
-- Replay policy: INSERT (append-only audit log; one row per error event).
-- Retention: 7-day rolling window (managed by application-level cleanup).

CREATE TABLE IF NOT EXISTS runtime_error_events (
    id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    logger_family      TEXT NOT NULL,
    log_level          TEXT NOT NULL,           -- WARNING | ERROR | CRITICAL
    message_template   TEXT NOT NULL,
    raw_message        TEXT NOT NULL DEFAULT '',
    error_category     TEXT NOT NULL,           -- KAFKA_CONSUMER | KAFKA_PRODUCER | DATABASE | HTTP_CLIENT | HTTP_SERVER | RUNTIME | UNKNOWN
    severity           TEXT NOT NULL,           -- WARNING | ERROR | CRITICAL
    fingerprint        TEXT NOT NULL,
    exception_type     TEXT NOT NULL DEFAULT '',
    exception_message  TEXT NOT NULL DEFAULT '',
    stack_trace        TEXT NOT NULL DEFAULT '',
    hostname           TEXT NOT NULL DEFAULT '',
    service_label      TEXT NOT NULL DEFAULT '',
    emitted_at         TIMESTAMPTZ NOT NULL,
    ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ree_error_category    ON runtime_error_events (error_category);
CREATE INDEX IF NOT EXISTS idx_ree_severity          ON runtime_error_events (severity);
CREATE INDEX IF NOT EXISTS idx_ree_emitted_at        ON runtime_error_events (emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ree_fingerprint       ON runtime_error_events (fingerprint);
CREATE INDEX IF NOT EXISTS idx_ree_logger_family     ON runtime_error_events (logger_family);
