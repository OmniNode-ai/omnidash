-- OMN-13824 / OMN-1636: tenant isolation via Postgres Row-Level Security.
--
-- Adds tenant_id to every dashboard projection table, enables RLS with a
-- fail-closed tenant_isolation policy keyed on the `app.tenant_id` GUC, and
-- wires the omnidash_app read role the Express bridge connects through.
--
-- Design invariants:
--   * Fail closed: current_setting('app.tenant_id', true) returns NULL when the
--     GUC is unset, the policy predicate evaluates to false, and a non-owner
--     role sees ZERO rows. There is no default-tenant fallback in the policy.
--   * Writer compatibility: RLS is ENABLEd (not FORCEd), so the table OWNER
--     (the projection writers) is not constrained; existing single-tenant
--     writers keep inserting with tenant_id defaulting to 'omninode'.
--     Non-owner writers are constrained by WITH CHECK (no cross-tenant writes).
--   * Idempotent: safe to re-run; tables absent in a given database (dev vs
--     analytics schema drift) are skipped with a NOTICE.
--
-- Apply plan (NOT run automatically): see db/README.md. Verified locally
-- against a throwaway postgres:16 container by
-- server/__tests__/tenant-rls.integration.test.ts, which runs this exact file.

DO $migration$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    -- Tables read by server/postgres-projection-reader.ts and the projection
    -- API. Keep this list in sync with new projection tables.
    'context_experiment_scores',
    'delegation_event_log',
    'delegation_events',
    'events',
    'generation_events',
    'llm_call_metrics',
    'log_entries',
    'node_service_registry',
    'savings_estimates',
    'skill_executions',
    'swarm_runs'
  ];
BEGIN
  -- App read role for the dashboard bridge. NOLOGIN group role; deployments
  -- attach a LOGIN role to it out-of-band (see db/README.md APPLY PLAN) so no
  -- credential material ever lives in a migration.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'omnidash_app') THEN
    CREATE ROLE omnidash_app NOLOGIN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO omnidash_app';

  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'tenant-rls: skipping absent table %', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT ''omninode''',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      'idx_' || t || '_tenant_id', t
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      $policy$CREATE POLICY tenant_isolation ON public.%I
        FOR ALL
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))$policy$,
      t
    );
    EXECUTE format('GRANT SELECT ON public.%I TO omnidash_app', t);
  END LOOP;
END
$migration$;
