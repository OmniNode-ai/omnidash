-- 0051_golden_chain_sweep_results.sql
-- OMN-7358: Golden Event Chain Validator — sweep result history table.
-- Stores per-chain results from golden chain validation sweeps that verify
-- Kafka-to-DB-projection data flow (end-to-end through omnidash read-model).
-- Source: golden_chain_sweep_orchestrator node (omniclaude).

CREATE TABLE IF NOT EXISTS golden_chain_sweep_results (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sweep_id              UUID NOT NULL,
    chain_name            TEXT NOT NULL,
    head_topic            TEXT NOT NULL,
    tail_table            TEXT NOT NULL,
    status                TEXT NOT NULL,  -- pass | fail | timeout | error
    publish_latency_ms    DOUBLE PRECISION,
    projection_latency_ms DOUBLE PRECISION,
    assertion_results     JSONB,
    error_reason          TEXT,
    correlation_id        TEXT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_golden_chain_sweep_id ON golden_chain_sweep_results(sweep_id);
CREATE INDEX idx_golden_chain_created_at ON golden_chain_sweep_results(created_at);
