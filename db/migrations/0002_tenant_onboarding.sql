-- OMN-10875: self-service tenant onboarding — the `tenants` registry table.
--
-- The onboarding backend (server/onboarding/tenant-provisioning.ts) records
-- one tenant row per self-service signup. Identity triple per the OMN-12911
-- design (docs/design/2026-06-10-hybrid-gateway-local-runtime-design.md §P0B):
--   * tenant_id     — immutable primary key, minted once at provisioning
--   * tenant_slug   — human-facing, renameable, UNIQUE
--   * principal_id  — immutable, DERIVED from tenant_id (never from the slug),
--                     so a slug rename can never rotate the principal
--
-- Idempotency anchor: created_by_subject (the OIDC `sub` of the signing-up
-- user) is UNIQUE — repeated provisioning calls for the same user return the
-- same tenant instead of creating duplicates (OMN-10875 acceptance criterion).
--
-- RLS posture mirrors db/migrations/0001_tenant_rls.sql:
--   * ENABLE (not FORCE) row-level security: the table OWNER — the onboarding
--     writer — is unconstrained, which is required because provisioning runs
--     BEFORE any tenant context exists (a brand-new user has no tenant yet).
--   * Non-owner readers (omnidash_app) are scoped by the same fail-closed
--     `app.tenant_id` GUC policy: no context => zero rows.
--
-- Apply plan (NOT run automatically): see https://github.com/OmniNode-ai/knowledge-base-internal/blob/main/runbooks/omnidash-database-rls-migrations.md — same operator-gated
-- procedure as 0001. Verified locally against a throwaway postgres:16 by
-- server/__tests__/tenant-onboarding.integration.test.ts, which runs this file.

DO $migration$
BEGIN
  -- Read role shared with 0001; create if this migration runs first.
  --
  -- OMN-10875: roles are cluster-wide (not per-database) in Postgres. An
  -- IF NOT EXISTS-then-CREATE check is NOT atomic — when 0001 and 0002 run
  -- concurrently (e.g. parallel integration-test workers against the same
  -- Postgres cluster), both can observe "absent" before either commits, and
  -- the loser hits "duplicate key value violates unique constraint
  -- pg_authid_rolname_index". That low-level catalog conflict surfaces as
  -- unique_violation (23505), not the friendlier duplicate_object
  -- (42710) Postgres raises for a clean pre-existing-role check — the race
  -- is between the two migrations' existence checks themselves, so the
  -- loser hits the raw index conflict. Catch both so concurrent creation is
  -- safely idempotent either way (mirrors the 0001 fix).
  BEGIN
    CREATE ROLE omnidash_app NOLOGIN;
  EXCEPTION
    WHEN duplicate_object OR unique_violation THEN
      NULL; -- role already created by a concurrent migration run
  END;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO omnidash_app';

  CREATE TABLE IF NOT EXISTS public.tenants (
    tenant_id          text PRIMARY KEY,
    tenant_slug        text NOT NULL UNIQUE,
    principal_id       text NOT NULL UNIQUE,
    display_name       text NOT NULL,
    status             text NOT NULL DEFAULT 'active',
    created_by_subject text NOT NULL UNIQUE,
    created_by_email   text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
  );

  -- Pre-multitenant default tenant. Every projection row inserted before
  -- multi-tenancy carries tenant_id 'omninode' (0001 column default); give
  -- that tenant a registry row so the registry is total over live tenant ids.
  INSERT INTO public.tenants
    (tenant_id, tenant_slug, principal_id, display_name, status, created_by_subject)
  VALUES
    ('omninode', 'omninode', 'principal:omninode', 'OmniNode (default tenant)',
     'active', 'system:bootstrap:omninode')
  ON CONFLICT (tenant_id) DO NOTHING;

  ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON public.tenants;
  CREATE POLICY tenant_isolation ON public.tenants
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

  EXECUTE 'GRANT SELECT ON public.tenants TO omnidash_app';
END
$migration$;
