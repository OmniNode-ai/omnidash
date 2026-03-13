-- Migration: 0019_agent_routing_decisions_session_id_text
-- Purpose: Migrate session_id column from uuid to text (OMN-4821)
--
-- Background: The agent_routing_decisions.session_id column was originally
-- typed as uuid, but the application inserts application-level session
-- identifiers (e.g. "session-abc123", empty string, or other non-UUID text).
-- PostgreSQL rejects these at INSERT time with "invalid input syntax for type
-- uuid", causing silent read-model projection failures.
--
-- Fix: ALTER the column to text. Existing uuid values coerce cleanly to their
-- text representation (e.g. "550e8400-e29b-41d4-a716-446655440000").
-- The column remains nullable; no data is lost or modified.
--
-- Related: OMN-4817 (epic), OMN-4818 (schema investigation), OMN-4823 (sanitization)

ALTER TABLE agent_routing_decisions
  ALTER COLUMN session_id TYPE text USING session_id::text;
