-- Migration: Drop learned_patterns table (OMN-2924)
--
-- The learned_patterns table is superseded by pattern_learning_artifacts,
-- which is populated by the pattern-projection.v1 Kafka consumer.
--
-- Canonical pattern endpoint: /api/intelligence/patterns/patlearn
-- Canonical Drizzle table: patternLearningArtifacts (shared/intelligence-schema.ts)

DROP TABLE IF EXISTS learned_patterns;
