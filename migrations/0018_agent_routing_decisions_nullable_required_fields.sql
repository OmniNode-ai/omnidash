-- Migration: 0018_agent_routing_decisions_nullable_required_fields
-- Purpose: Make NOT NULL columns nullable to tolerate field drift from the
--          omniclaude producer (OMN-4081).
--
-- Background: The omniclaude routing.decision event payload does not emit
-- `user_request`, `routing_strategy`, or `routing_time_ms` using those exact
-- field names. The read-model-consumer already applies safe fallbacks
-- (prompt_preview → user_request, 'unknown' → routing_strategy, 0 →
-- routing_time_ms) per OMN-3320. However, the NOT NULL constraints provide no
-- additional safety guarantee when the consumer supplies defaults, and they
-- create a brittle surface if future producer changes stop providing
-- alternative field names.
--
-- Fix: DROP the NOT NULL constraints from the three columns most likely to be
-- absent in payloads from omniclaude or future producers. The consumer-side
-- defaults remain in place; this migration just removes the database-level
-- enforcement that duplicates (and is weaker than) the application-level guard.

ALTER TABLE agent_routing_decisions
  ALTER COLUMN user_request    DROP NOT NULL,
  ALTER COLUMN routing_strategy DROP NOT NULL,
  ALTER COLUMN routing_time_ms  DROP NOT NULL;
