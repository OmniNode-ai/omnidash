-- Migration: Drop duplicate unique indexes from delegation tables (OMN-2284)
--
-- The original 0007_delegation_events.sql migration created explicit
-- CREATE UNIQUE INDEX statements for correlation_id on both delegation tables,
-- duplicating the unnamed indexes that PostgreSQL already created automatically
-- for the inline UNIQUE constraints in the CREATE TABLE statements.
--
-- Those redundant index stanzas have been removed from 0007, but any environment
-- that already applied the original 0007 will have these named indexes present.
-- This migration drops them idempotently to clean up those environments.

-- Drop duplicate unique indexes created by the original 0007 migration
-- These are redundant with the inline UNIQUE constraints on correlation_id
DROP INDEX IF EXISTS idx_delegation_events_correlation;
DROP INDEX IF EXISTS idx_delegation_shadow_correlation;
