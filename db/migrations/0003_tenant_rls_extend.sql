-- OMN-2864 / Stage 4d: extend tenant_id + RLS to all 35 tenant-scoped projection tables.
--
-- Context:
--   0001_tenant_rls.sql applied RLS to an early subset of tables using
--   `tenant_id text NOT NULL DEFAULT 'omninode'` and ENABLE (not FORCE) RLS.
--   Two of those tables exist in the live analytics DB with tenant_id already:
--     delegation_events, node_service_registry
--   This migration upgrades those 2 (app_dashboard grant) and applies the full
--   new pattern to the remaining 33 tables (including event_bus_events which was
--   listed as protected but is NOT in 0001's tenant_tables array).
--
-- Design invariants:
--   * ENABLE (not FORCE) row-level security: the table OWNER bypasses RLS on all
--     operations. Projection writers connect as the owner and insert without
--     setting app.tenant_id or supplying tenant_id — this is intentional and
--     must not be broken. Dashboard readers connect as app_dashboard (non-owner)
--     and are subject to RLS. Using FORCE would subject the owner to WITH CHECK
--     on every INSERT/UPDATE, which would reject all existing writer paths.
--   * Fail-closed: tenant_id is added WITHOUT NOT NULL and WITHOUT a DEFAULT.
--     Existing rows get tenant_id = NULL. The policy predicate evaluates to NULL
--     (never true) for those rows, so pre-migration data is invisible to all
--     tenant sessions. Backfill happens out-of-band before NOT NULL is added.
--   * Policy uses text comparison, not ::uuid cast: comparing tenant_id::text to
--     the GUC value avoids a 22P02 error if the GUC is ever set to an invalid
--     UUID string or empty string. NULLIF(..., '') converts empty string to NULL
--     so the predicate is NULL (fail-closed) for missing or empty GUC.
--   * Role attributes enforced on every run: after creation (or on exception if
--     the role pre-exists), ALTER ROLE is run unconditionally to enforce
--     NOSUPERUSER + NOBYPASSRLS. A pre-existing role with BYPASSRLS or SUPERUSER
--     would silently bypass all policies; reconciling attributes is required for
--     idempotency to be meaningful.
--   * Idempotent: safe to re-run. Tables absent in a given schema are skipped.
--   * Role credential: app_dashboard is a NOLOGIN group role. A LOGIN role with
--     password from Secrets Manager is attached out-of-band by the operator
--     (never committed here).
--
-- Apply plan (NOT run automatically — operator-gated same as 0001/0002):
--   see db/README.md
--
-- Verified by: server/__tests__/tenant-rls-extend.integration.test.ts

DO $migration$
DECLARE
  t text;

  -- Tables from 0001 that already carry tenant_id (text) and ENABLE RLS.
  -- This migration adds app_dashboard SELECT grant only.
  -- Column type, policy, and RLS enable state are NOT changed here.
  upgrade_tables text[] := ARRAY[
    'delegation_events',
    'node_service_registry'
  ];

  -- All other tenant-scoped tables including event_bus_events (NOT in 0001's
  -- tenant_tables array despite being listed as protected — treated as new here
  -- so it definitely gets ENABLE RLS + policy regardless of prior state).
  -- 33 tables: 31 confirmed tenant-scoped + 4 baselines_* + event_bus_events.
  new_tables text[] := ARRAY[
    'agent_actions',
    'agent_manifest_injections',
    'agent_routing_decisions',
    'agent_transformation_events',
    'baselines_breakdown',
    'baselines_comparisons',
    'baselines_snapshots',
    'baselines_trend',
    'context_enrichment_events',
    'debug_escalation_counts',
    'delegation_shadow_comparisons',
    'document_access_log',
    'document_metadata',
    'epic_run_events',
    'epic_run_lease',
    'event_bus_events',
    'gate_decisions',
    'injection_effectiveness',
    'latency_breakdowns',
    'llm_cost_aggregates',
    'llm_routing_decisions',
    'model_efficiency_rollups',
    'onex_compliance_stamps',
    'pattern_enforcement_events',
    'pattern_hit_rates',
    'pattern_injections',
    'pattern_learning_artifacts',
    'pattern_lifecycle_transitions',
    'pattern_lineage_edges',
    'pattern_lineage_nodes',
    'pattern_measured_attributions',
    'pattern_quality_metrics',
    'pipeline_budget_state',
    'plan_review_runs',
    'pr_watch_state',
    'task_completion_metrics'
  ];

BEGIN
  -- app_dashboard: the runtime reader role for the dashboard bridge.
  -- NOSUPERUSER + NOBYPASSRLS ensures RLS is always evaluated (never silently
  -- skipped). NOLOGIN = group role; a LOGIN role with Secrets Manager password
  -- is attached by the operator.
  --
  -- Same race-safe pattern as omnidash_app in 0001/0002: catch both
  -- duplicate_object (42710) and unique_violation (23505) to handle concurrent
  -- migration runs against a shared Postgres cluster.
  BEGIN
    CREATE ROLE app_dashboard NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  EXCEPTION
    WHEN duplicate_object OR unique_violation THEN
      NULL;
  END;

  -- Enforce safe attributes unconditionally. A pre-existing role with BYPASSRLS
  -- or SUPERUSER silently bypasses all RLS policies; reconcile on every run.
  EXECUTE 'ALTER ROLE app_dashboard NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOLOGIN';

  EXECUTE 'GRANT USAGE ON SCHEMA public TO app_dashboard';

  -- Upgrade existing 2 tables: grant SELECT to app_dashboard.
  -- These already have ENABLE RLS and a tenant_isolation policy from 0001.
  FOREACH t IN ARRAY upgrade_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'tenant-rls-extend: skipping absent table % (upgrade path)', t;
      CONTINUE;
    END IF;

    EXECUTE format('GRANT SELECT ON public.%I TO app_dashboard', t);
    RAISE NOTICE 'tenant-rls-extend: upgraded % (app_dashboard grant)', t;
  END LOOP;

  -- Apply full RLS pattern to 33 new tables (including event_bus_events).
  -- tenant_id is uuid, nullable, no default — existing rows invisible (fail-closed).
  -- Policy uses text comparison to avoid cast errors on invalid GUC values.
  FOREACH t IN ARRAY new_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'tenant-rls-extend: skipping absent table % (new pattern)', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid',
      t
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      'idx_' || t || '_tenant_id', t
    );

    -- ENABLE (not FORCE): owner bypasses RLS on all operations so projection
    -- writers can INSERT without setting app.tenant_id or supplying tenant_id.
    -- Dashboard reads through app_dashboard (non-owner) which IS subject to RLS.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
    EXECUTE format(
      $policy$
        CREATE POLICY tenant_isolation_policy ON public.%I
          FOR ALL
          USING (
            tenant_id::text = NULLIF(current_setting('app.tenant_id', true), '')
          )
          WITH CHECK (
            tenant_id::text = NULLIF(current_setting('app.tenant_id', true), '')
          )
      $policy$,
      t
    );

    EXECUTE format('GRANT SELECT ON public.%I TO app_dashboard', t);
    RAISE NOTICE 'tenant-rls-extend: applied RLS to %', t;
  END LOOP;

END
$migration$;
