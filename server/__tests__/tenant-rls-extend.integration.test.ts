// @vitest-environment node
// OMN-2864 / Stage 4d: integration test for db/migrations/0003_tenant_rls_extend.sql.
//
// Applies 0001 first (required baseline), then 0003, and proves:
//   1. app_dashboard role has NOSUPERUSER + NOBYPASSRLS (enforced by ALTER ROLE)
//   2. New uuid-pattern tables: tenant A sees only tenant-A rows; tenant B only tenant-B
//   3. No tenant context (GUC unset) => ZERO rows (fail-closed)
//   4. Empty-string GUC => ZERO rows (NULLIF guard prevents empty-string match)
//   5. Pre-migration rows (tenant_id = NULL) are invisible to all tenant sessions
//   6. Upgrade path: delegation_events received app_dashboard grant (RLS was already ENABLED)
//   7. Owner (non-superuser) bypasses RLS on SELECT — ENABLE not FORCE by design,
//      so projection writers can read/write without setting tenant context
//   8. Migration is idempotent (safe to re-apply)
//
// Requires TENANT_RLS_TEST_DATABASE_URL pointing at a disposable database
// (superuser or table-owner credentials). CI provides a postgres:16 service
// in the `tenant-rls` job; locally:
//   docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=omnidash_rls_test \
//     -p 5544:5432 postgres:16-alpine
//   TENANT_RLS_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5544/omnidash_rls_test \
//     npx vitest run server/__tests__/tenant-rls-extend.integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ADMIN_URL = process.env.TENANT_RLS_TEST_DATABASE_URL;

if (!ADMIN_URL && process.env.TENANT_RLS_REQUIRED) {
  throw new Error(
    'TENANT_RLS_REQUIRED is set but TENANT_RLS_TEST_DATABASE_URL is missing — refusing to skip the tenant isolation gate',
  );
}

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const MIGRATION_0001 = resolve(__dirname, '..', '..', 'db', 'migrations', '0001_tenant_rls.sql');
const MIGRATION_0003 = resolve(__dirname, '..', '..', 'db', 'migrations', '0003_tenant_rls_extend.sql');

// Login role for dashboard reads — member of app_dashboard group role.
const DASH_ROLE = 'rls_extend_test_dash';

// Non-superuser, non-BYPASSRLS table owner used to prove ENABLE (not FORCE) owner bypass.
// This mimics what projection writers would do: connect as owner, read/write without GUC.
const OWNER_ROLE = 'rls_extend_test_owner';

// Two real UUIDs used as tenant identifiers.
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

function withCredentials(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

describe.skipIf(!ADMIN_URL)('tenant RLS extend — uuid pattern (real Postgres)', () => {
  let admin: pg.Pool;
  let dashPool: pg.Pool;   // connects as app_dashboard (via DASH_ROLE LOGIN member)
  let ownerPool: pg.Pool;  // connects as OWNER_ROLE — non-super, non-BYPASSRLS table owner

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });

    // Create a non-superuser, non-BYPASSRLS role to own the test table.
    // This proves the owner-bypass property without a superuser.
    await admin.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${OWNER_ROLE}') THEN
          EXECUTE 'DROP OWNED BY ${OWNER_ROLE}';
          EXECUTE 'DROP ROLE ${OWNER_ROLE}';
        END IF;
      END
      $$;
      CREATE ROLE ${OWNER_ROLE} LOGIN PASSWORD '${OWNER_ROLE}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      GRANT USAGE ON SCHEMA public TO ${OWNER_ROLE};
      GRANT CREATE ON SCHEMA public TO ${OWNER_ROLE};
    `);

    // Create test tables owned by OWNER_ROLE so we can prove owner-bypass.
    await admin.query(`
      DROP TABLE IF EXISTS llm_cost_aggregates CASCADE;
      DROP TABLE IF EXISTS delegation_events CASCADE;
      DROP TABLE IF EXISTS node_service_registry CASCADE;
      DROP TABLE IF EXISTS event_bus_events CASCADE;
    `);
    await (new pg.Pool({ connectionString: withCredentials(ADMIN_URL!, OWNER_ROLE, OWNER_ROLE) }))
      .query(`
        CREATE TABLE llm_cost_aggregates (
          id             BIGSERIAL PRIMARY KEY,
          model_name     TEXT,
          total_cost_usd NUMERIC,
          request_count  INTEGER,
          bucket_time    TIMESTAMPTZ DEFAULT now(),
          granularity    TEXT
        );
        CREATE TABLE event_bus_events (
          id         BIGSERIAL PRIMARY KEY,
          event_type TEXT,
          payload    JSONB
        );
      `);
    // delegation_events and node_service_registry created by admin (simulating 0001 already ran)
    await admin.query(`
      CREATE TABLE delegation_events (
        id                    BIGSERIAL PRIMARY KEY,
        correlation_id        TEXT,
        session_id            TEXT,
        task_type             TEXT,
        delegated_to          TEXT,
        quality_gate_passed   BOOLEAN DEFAULT true,
        quality_gates_checked JSONB,
        quality_gates_failed  JSONB,
        delegation_latency_ms NUMERIC,
        cost_usd              NUMERIC,
        timestamp             TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE node_service_registry (
        id        BIGSERIAL PRIMARY KEY,
        node_name TEXT,
        status    TEXT
      );
    `);

    // Apply 0001 first — establishes omnidash_app role and ENABLE RLS on delegation_events etc.
    await admin.query(readFileSync(MIGRATION_0001, 'utf8'));

    // Apply 0003 — the artifact under test.
    await admin.query(readFileSync(MIGRATION_0003, 'utf8'));

    // Create a LOGIN role that is a member of app_dashboard.
    await admin.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DASH_ROLE}') THEN
          EXECUTE 'DROP OWNED BY ${DASH_ROLE}';
          EXECUTE 'DROP ROLE ${DASH_ROLE}';
        END IF;
      END
      $$;
      CREATE ROLE ${DASH_ROLE} LOGIN PASSWORD '${DASH_ROLE}' IN ROLE app_dashboard;
    `);

    // Seed llm_cost_aggregates as table owner (OWNER_ROLE bypasses RLS — ENABLE not FORCE).
    // Row 1 and 2: tenant A; Row 3: tenant B; Row 4: pre-migration (tenant_id = NULL).
    const ownerConn = new pg.Pool({ connectionString: withCredentials(ADMIN_URL!, OWNER_ROLE, OWNER_ROLE) });
    await ownerConn.query(`
      INSERT INTO llm_cost_aggregates (model_name, total_cost_usd, tenant_id) VALUES
        ('gpt-4',    1.50, '${TENANT_A}'::uuid),
        ('claude-3', 0.80, '${TENANT_A}'::uuid),
        ('gpt-4',    2.10, '${TENANT_B}'::uuid),
        ('legacy',   0.00, NULL);
    `);
    await ownerConn.end();

    dashPool = new pg.Pool({
      connectionString: withCredentials(ADMIN_URL!, DASH_ROLE, DASH_ROLE),
    });
    ownerPool = new pg.Pool({
      connectionString: withCredentials(ADMIN_URL!, OWNER_ROLE, OWNER_ROLE),
    });
  }, 30_000);

  afterAll(async () => {
    await dashPool?.end();
    await ownerPool?.end();
    await admin?.end();
  });

  it('app_dashboard role has NOSUPERUSER and NOBYPASSRLS (ALTER ROLE enforced them)', async () => {
    const res = await admin.query(`
      SELECT rolsuper, rolbypassrls
      FROM pg_roles WHERE rolname = 'app_dashboard'
    `);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].rolsuper).toBe(false);
    expect(res.rows[0].rolbypassrls).toBe(false);
  });

  it('tenant A sees only tenant-A rows', async () => {
    const client = await dashPool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', '${TENANT_A}', false)`);
      const res = await client.query('SELECT model_name, tenant_id FROM llm_cost_aggregates');
      expect(res.rows).toHaveLength(2);
      expect(res.rows.every((r: { tenant_id: string }) => r.tenant_id === TENANT_A)).toBe(true);
    } finally {
      client.release(true);
    }
  });

  it('tenant B sees only tenant-B rows', async () => {
    const client = await dashPool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', '${TENANT_B}', false)`);
      const res = await client.query('SELECT model_name FROM llm_cost_aggregates');
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].model_name).toBe('gpt-4');
    } finally {
      client.release(true);
    }
  });

  it('no tenant context (GUC unset) => zero rows (fail-closed)', async () => {
    const res = await dashPool.query('SELECT * FROM llm_cost_aggregates');
    expect(res.rows).toHaveLength(0);
  });

  it('empty-string GUC => zero rows (NULLIF guard)', async () => {
    const client = await dashPool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', '', false)`);
      const res = await client.query('SELECT * FROM llm_cost_aggregates');
      expect(res.rows).toHaveLength(0);
    } finally {
      client.release(true);
    }
  });

  it('invalid UUID string in GUC => zero rows (text comparison, no cast error)', async () => {
    const client = await dashPool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', 'not-a-uuid', false)`);
      // tenant_id::text = 'not-a-uuid' never matches a real UUID — returns 0 rows, no error
      const res = await client.query('SELECT * FROM llm_cost_aggregates');
      expect(res.rows).toHaveLength(0);
    } finally {
      client.release(true);
    }
  });

  it('pre-migration rows (tenant_id = NULL) are invisible to all tenants', async () => {
    const client = await dashPool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', '${TENANT_A}', false)`);
      const res = await client.query(
        `SELECT * FROM llm_cost_aggregates WHERE model_name = 'legacy'`,
      );
      expect(res.rows).toHaveLength(0);
    } finally {
      client.release(true);
    }
  });

  it('ENABLE (not FORCE): non-superuser table owner bypasses RLS and sees all rows', async () => {
    // OWNER_ROLE is NOSUPERUSER NOBYPASSRLS but owns the table.
    // With ENABLE (not FORCE), table owner bypasses RLS — this is intentional so
    // projection writers can INSERT/SELECT without setting a tenant GUC.
    const res = await ownerPool.query('SELECT COUNT(*) AS n FROM llm_cost_aggregates');
    expect(Number(res.rows[0].n)).toBe(4); // all rows visible to owner
  });

  it('upgrade path: delegation_events has ENABLE RLS + app_dashboard SELECT grant', async () => {
    const rls = await admin.query(`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'delegation_events'
    `);
    expect(rls.rows[0].relrowsecurity).toBe(true);

    const grant = await admin.query(`
      SELECT has_table_privilege('app_dashboard', 'delegation_events', 'SELECT') AS has_select
    `);
    expect(grant.rows[0].has_select).toBe(true);
  });

  it('new table (event_bus_events) has ENABLE RLS + policy + app_dashboard grant', async () => {
    const rls = await admin.query(`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'event_bus_events'
    `);
    expect(rls.rows[0].relrowsecurity).toBe(true);

    const policy = await admin.query(`
      SELECT polname FROM pg_policies WHERE tablename = 'event_bus_events' AND polname = 'tenant_isolation_policy'
    `);
    expect(policy.rows).toHaveLength(1);

    const grant = await admin.query(`
      SELECT has_table_privilege('app_dashboard', 'event_bus_events', 'SELECT') AS has_select
    `);
    expect(grant.rows[0].has_select).toBe(true);
  });

  it('migration is idempotent (re-apply is a no-op, not an error)', async () => {
    await expect(admin.query(readFileSync(MIGRATION_0003, 'utf8'))).resolves.toBeDefined();
  });
});
