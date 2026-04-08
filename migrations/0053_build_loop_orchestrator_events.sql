-- Migration 0053: build_loop_orchestrator_events
-- Projects onex.evt.omnimarket.build-loop-orchestrator-phase-transition.v1
-- and onex.evt.omnimarket.build-loop-orchestrator-completed.v1 into a
-- queryable read-model table for build loop observability (OMN-7920).

CREATE TABLE IF NOT EXISTS build_loop_orchestrator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('phase_transition', 'completed')),
  phase TEXT,                        -- FSM phase name (IDLE, CLOSING_OUT, VERIFYING, etc.)
  previous_phase TEXT,               -- prior FSM state for transitions
  cycles_completed INTEGER,          -- populated on completed events
  cycles_failed INTEGER,             -- populated on completed events
  total_tickets_dispatched INTEGER,  -- populated on completed events
  status TEXT,                       -- 'success' | 'failed' (completed events)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint so onConflictDoNothing() is effective for idempotent projection
ALTER TABLE build_loop_orchestrator_events
  ADD CONSTRAINT uq_blo_events_correlation_type_phase
  UNIQUE (correlation_id, event_type, phase);

CREATE INDEX IF NOT EXISTS idx_blo_events_correlation ON build_loop_orchestrator_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_blo_events_occurred ON build_loop_orchestrator_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_blo_events_event_type ON build_loop_orchestrator_events (event_type);
