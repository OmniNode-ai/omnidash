-- OMN-8710: Purge noise pattern types from pattern_learning_artifacts
--
-- Removes two categories of noise rows that provide no actionable signal:
--
-- 1. file_access_pattern rows: co-access pairs showing which files were
--    accessed together — not actionable, high cardinality, pure noise.
--
-- 2. architecture_pattern / module_boundary rows: theoretical directory
--    boundary violations without action items.
--
-- Also purges any rows matching broader noise patterns (proximity, colocation,
-- _co_ infix) that may arrive from emitters using these naming conventions.
--
-- All DELETEs are idempotent — safe to re-run.

-- 1. Purge file_access co-access noise
DELETE FROM pattern_learning_artifacts
WHERE pattern_type = 'file_access_pattern';

-- 2. Purge architecture module_boundary noise
DELETE FROM pattern_learning_artifacts
WHERE pattern_type = 'architecture_pattern'
  AND pattern_name ILIKE '%Module Boundary%';

-- 3. Purge any broader noise-type patterns by naming convention
DELETE FROM pattern_learning_artifacts
WHERE pattern_type ILIKE '%_co_%'
   OR pattern_type ILIKE '%module%boundary%'
   OR pattern_type ILIKE '%proximity%'
   OR pattern_type ILIKE '%colocation%';
