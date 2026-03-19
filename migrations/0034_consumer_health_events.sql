-- 0034_consumer_health_events.sql
-- OMN-5527: Consumer Health Dashboard — stores consumer health events.
-- Source topic: onex.evt.omnibase-infra.consumer-health.v1
-- Replay policy: INSERT (append-only audit log; one row per health event).
-- Retention: 7-day rolling window (managed by application-level cleanup).

CREATE TABLE IF NOT EXISTS consumer_health_events (
    id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    consumer_identity TEXT NOT NULL,
    consumer_group    TEXT NOT NULL,
    topic             TEXT NOT NULL,
    event_type        TEXT NOT NULL,          -- HEARTBEAT_FAILURE | SESSION_TIMEOUT | REBALANCE | CONSUMER_STARTED | CONSUMER_STOPPED | CONSUMER_CRASHED | CONSUMER_RESTARTED
    severity          TEXT NOT NULL,          -- INFO | WARNING | ERROR | CRITICAL
    fingerprint       TEXT NOT NULL,
    error_message     TEXT NOT NULL DEFAULT '',
    error_type        TEXT NOT NULL DEFAULT '',
    hostname          TEXT NOT NULL DEFAULT '',
    service_label     TEXT NOT NULL DEFAULT '',
    rebalance_duration_ms INTEGER,
    partitions_assigned   INTEGER,
    partitions_revoked    INTEGER,
    emitted_at        TIMESTAMPTZ NOT NULL,
    ingested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_che_consumer_identity ON consumer_health_events (consumer_identity);
CREATE INDEX IF NOT EXISTS idx_che_event_type        ON consumer_health_events (event_type);
CREATE INDEX IF NOT EXISTS idx_che_severity          ON consumer_health_events (severity);
CREATE INDEX IF NOT EXISTS idx_che_emitted_at        ON consumer_health_events (emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_che_fingerprint       ON consumer_health_events (fingerprint);
