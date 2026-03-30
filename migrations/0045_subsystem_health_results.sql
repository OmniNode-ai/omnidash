-- OMN-7007: Subsystem health results table
-- Stores verification results from cron-closeout Phase E runs.
-- Each row represents the outcome of one subsystem verification.

CREATE TABLE IF NOT EXISTS subsystem_health_results (
  id SERIAL PRIMARY KEY,
  subsystem VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',  -- PASS, FAIL, WARN, STALE, UNKNOWN
  test_count INTEGER NOT NULL DEFAULT 0,
  pass_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  run_id VARCHAR(100) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for dashboard queries (latest per subsystem)
CREATE INDEX IF NOT EXISTS idx_subsystem_health_subsystem_verified
  ON subsystem_health_results (subsystem, verified_at DESC);

-- Index for staleness checks
CREATE INDEX IF NOT EXISTS idx_subsystem_health_verified_at
  ON subsystem_health_results (verified_at DESC);
