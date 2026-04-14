-- Migration: Purge orphaned schema_migrations records after rename (OMN-8676)
--
-- After OMN-8606 renamed duplicate-prefix migration files on disk (adding a/b/c/d
-- suffixes), the DB ended up with both the old unsuffixed names AND the new
-- suffixed names. Migration 0059 was supposed to rename the old to new, but on
-- the server the new names were already present as separate rows, leaving the old
-- names as stale duplicates. This caused checkSchemaParity() to report
-- schema_ok: false (missing_on_disk) and the health probe to show database: down.
--
-- Also removes the old 0053 entry for latency_breakdowns which was renumbered to
-- 0057 on disk but the old record persisted in the DB.
--
-- Idempotent: DELETE WHERE only removes rows that still exist.

DELETE FROM schema_migrations WHERE filename IN (
  '0034_add_routing_shadow_decisions.sql',
  '0034_create_rl_episodes.sql',
  '0034_savings_estimates.sql',
  '0034_skill_invocations_status_dedup.sql',
  '0038_pattern_learning_unique_pattern_id.sql',
  '0038_widen_pattern_name.sql',
  '0053_latency_breakdowns_prompt_id_nullable.sql'
);
