-- Migration: Rename duplicate-prefix migration filenames in schema_migrations (OMN-8600 follow-up)
--
-- Five groups of migrations share the same numeric prefix (0034×4, 0038×2, 0048×2, 0049×2, 0056×2).
-- The migration runner uses filename as primary key in schema_migrations, so duplicate prefixes
-- cause ambiguous ordering. This migration updates the tracking table to match the renamed files.
--
-- Winner in each group (earliest git commit date) keeps the original number.
-- Remaining files get sequential numbers from 0059 onward.
--
-- Idempotent: WHERE clauses only update rows that still have old names.

-- Fix 0034 collision (4 files) — winner: 0034_skill_invocations_status_dedup (2026-03-19 22:09)
UPDATE schema_migrations SET filename = '0059_create_rl_episodes.sql'
  WHERE filename = '0034_create_rl_episodes.sql';

UPDATE schema_migrations SET filename = '0060_savings_estimates.sql'
  WHERE filename = '0034_savings_estimates.sql';

UPDATE schema_migrations SET filename = '0061_add_routing_shadow_decisions.sql'
  WHERE filename = '0034_add_routing_shadow_decisions.sql';

-- Fix 0038 collision (2 files) — winner: 0038_pattern_learning_unique_pattern_id (2026-03-21 14:05)
-- Note: pattern_learning_unique_pattern_id must precede widen_pattern_name (both alter same table)
-- Creation-date order matches dependency order.
UPDATE schema_migrations SET filename = '0062_widen_pattern_name.sql'
  WHERE filename = '0038_widen_pattern_name.sql';

-- Fix 0048 collision (2 files) — winner: 0048_review_calibration_runs (2026-04-01 06:44)
UPDATE schema_migrations SET filename = '0063_contract_drift_events.sql'
  WHERE filename = '0048_contract_drift_events.sql';

-- Fix 0049 collision (2 files) — winner: 0049_github_webhook_deliveries (2026-04-01 11:15)
UPDATE schema_migrations SET filename = '0064_eval_reports.sql'
  WHERE filename = '0049_eval_reports.sql';

-- Fix 0056 collision (2 files) — winner: 0056_sweep_results (2026-04-10 08:42)
UPDATE schema_migrations SET filename = '0065_session_post_mortems.sql'
  WHERE filename = '0056_session_post_mortems.sql';
