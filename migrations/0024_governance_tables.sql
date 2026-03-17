-- Migration: Governance Dashboard Tables (OMN-5291)
--
-- Stores projected events from three onex-change-control topics:
--
--   onex.evt.onex-change-control.governance-check-completed.v1  → governance_checks
--   onex.evt.onex-change-control.drift-detected.v1             → governance_drifts
--   onex.evt.onex-change-control.cosmetic-compliance-scored.v1 → governance_cosmetic_scores
--
-- All tables use event_id TEXT NOT NULL UNIQUE for idempotent ON CONFLICT DO NOTHING upserts.

-- ---------------------------------------------------------------------------
-- governance_checks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS governance_checks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT        NOT NULL UNIQUE,
  check_type      TEXT        NOT NULL DEFAULT 'unknown',
  target          TEXT        NOT NULL DEFAULT '',
  passed          BOOLEAN     NOT NULL DEFAULT FALSE,
  violation_count INTEGER     NOT NULL DEFAULT 0,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_checks_created_at
  ON governance_checks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_checks_check_type
  ON governance_checks (check_type);

-- ---------------------------------------------------------------------------
-- governance_drifts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS governance_drifts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     TEXT        NOT NULL UNIQUE,
  ticket_id    TEXT        NOT NULL DEFAULT '',
  drift_kind   TEXT        NOT NULL DEFAULT 'unknown',
  description  TEXT        NOT NULL DEFAULT '',
  severity     TEXT        NOT NULL DEFAULT 'warning',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_drifts_created_at
  ON governance_drifts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_drifts_severity
  ON governance_drifts (severity);

-- ---------------------------------------------------------------------------
-- governance_cosmetic_scores
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS governance_cosmetic_scores (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       TEXT        NOT NULL UNIQUE,
  target         TEXT        NOT NULL DEFAULT '',
  score          DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_checks   INTEGER     NOT NULL DEFAULT 0,
  passed_checks  INTEGER     NOT NULL DEFAULT 0,
  failed_checks  INTEGER     NOT NULL DEFAULT 0,
  violations     JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  projected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_cosmetic_scores_created_at
  ON governance_cosmetic_scores (created_at DESC);
