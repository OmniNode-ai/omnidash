-- Migration: Rename duplicate-prefix migration filenames in schema_migrations (OMN-3750)
--
-- Migrations 0005, 0006, and 0011 each had two files sharing the same numeric
-- prefix. While the lexicographic sort in run-migrations.ts handled this
-- deterministically, the duplicate prefixes were confusing and error-prone.
--
-- This migration updates the schema_migrations tracking table to match the
-- new filenames (0005a/0005b, 0006a/0006b, 0011a/0011b).
--
-- Idempotent: uses WHERE clause to only update rows that still have old names.

UPDATE schema_migrations SET filename = '0005a_baselines_trend_unique.sql'
  WHERE filename = '0005_baselines_trend_unique.sql';

UPDATE schema_migrations SET filename = '0005b_context_enrichment_events.sql'
  WHERE filename = '0005_context_enrichment_events.sql';

UPDATE schema_migrations SET filename = '0006a_baselines_breakdown_unique.sql'
  WHERE filename = '0006_baselines_breakdown_unique.sql';

UPDATE schema_migrations SET filename = '0006b_llm_routing_decisions.sql'
  WHERE filename = '0006_llm_routing_decisions.sql';

UPDATE schema_migrations SET filename = '0011a_llm_routing_decisions_correlation_id_uuid.sql'
  WHERE filename = '0011_llm_routing_decisions_correlation_id_uuid.sql';

UPDATE schema_migrations SET filename = '0011b_llm_routing_decisions_nullable_fuzzy_agent.sql'
  WHERE filename = '0011_llm_routing_decisions_nullable_fuzzy_agent.sql';
