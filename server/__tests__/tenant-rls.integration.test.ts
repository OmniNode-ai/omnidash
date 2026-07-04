// @vitest-environment node
// OMN-13824 / OMN-1636: THE beta-gate tenant-isolation invariant.
//
// Applies db/migrations/0001_tenant_rls.sql to a real throwaway Postgres and
// proves, against a non-owner role (RLS does not bind superusers/owners):
//   1. tenant A sees only tenant-A rows; tenant B only tenant-B rows
//   2. no tenant context => ZERO rows (fail closed, not fail open)
//   3. cross-tenant INSERT is rejected by WITH CHECK
//   4. the real app path (PostgresProjectionReader under runWithTenantContext)
//      returns only the active tenant's rows
//
// Requires TENANT_RLS_TEST_DATABASE_URL pointing at a disposable database
// (superuser or table-owner credentials). CI provides a postgres:16 service
// in the `tenant-rls` job; locally:
//   docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=omnidash_rls_test \
//     -p 5544:5432 postgres:16-alpine
//   TENANT_RLS_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5544/omnidash_rls_test \
//     npx vitest run server/__tests__/tenant-rls.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgresProjectionReader } from '../postgres-projection-reader.js';
import { runWithTenantContext } from '../auth/tenant-context.js';

const ADMIN_URL = process.env.TENANT_RLS_TEST_DATABASE_URL;

// The dedicated CI gate (ci.yml `tenant-rls` job) sets TENANT_RLS_REQUIRED so
// this suite fails closed if the database wiring ever rots — the beta-gate
// invariant must never pass vacuously via skip. Plain `npm test` without a
// database skips it (unit suites still cover the app-side scoping).
if (!ADMIN_URL && process.env.TENANT_RLS_REQUIRED) {
  throw new Error(
    'TENANT_RLS_REQUIRED is set but TENANT_RLS_TEST_DATABASE_URL is missing — refusing to skip the tenant isolation gate',
  );
}

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const MIGRATION_PATH = resolve(__dirname, '..', '..', 'db', 'migrations', '0001_tenant_rls.sql');

const APP_ROLE = 'rls_test_app';
const WRITER_ROLE = 'rls_test_writer';

function withCredentials(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

describe.skipIf(!ADMIN_URL)('tenant RLS isolation (real Postgres)', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let writerPool: pg.Pool;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });

    // Representative projection tables (subset of the migration's list, with
    // the columns the reader actually selects for the 'delegation' topic).
    await admin.query(`
      DROP TABLE IF EXISTS delegation_events CASCADE;
      DROP TABLE IF EXISTS log_entries CASCADE;
      CREATE TABLE delegation_events (
        id BIGSERIAL PRIMARY KEY,
        correlation_id TEXT,
        session_id TEXT,
        task_type TEXT,
        delegated_to TEXT,
        model_name TEXT,
        quality_gate_passed BOOLEAN DEFAULT true,
        quality_gate_detail TEXT,
        latency_ms NUMERIC,
        tokens_input NUMERIC,
        tokens_output NUMERIC,
        tokens_to_compliance NUMERIC,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE log_entries (
        entry_id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT now(),
        node_name TEXT,
        function_name TEXT,
        level TEXT,
        message TEXT,
        correlation_id TEXT,
        duration_ms NUMERIC,
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);

    // Apply the REAL migration file — the artifact under test.
    await admin.query(readFileSync(MIGRATION_PATH, 'utf8'));

    // Non-owner roles: reader (via the migration's omnidash_app group) and a
    // writer used to prove WITH CHECK. RLS binds both (neither owns tables).
    await admin.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          EXECUTE 'DROP OWNED BY ${APP_ROLE}';
          EXECUTE 'DROP ROLE ${APP_ROLE}';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${WRITER_ROLE}') THEN
          EXECUTE 'DROP OWNED BY ${WRITER_ROLE}';
          EXECUTE 'DROP ROLE ${WRITER_ROLE}';
        END IF;
      END
      $$;
      CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_ROLE}' IN ROLE omnidash_app;
      CREATE ROLE ${WRITER_ROLE} LOGIN PASSWORD '${WRITER_ROLE}';
      GRANT USAGE ON SCHEMA public TO ${WRITER_ROLE};
      GRANT SELECT, INSERT ON delegation_events TO ${WRITER_ROLE};
      GRANT USAGE ON SEQUENCE delegation_events_id_seq TO ${WRITER_ROLE};
    `);

    // Seed cross-tenant data as the table owner (bypasses RLS by design —
    // this is exactly the single-tenant writer-compatibility property).
    await admin.query(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, tenant_id) VALUES
        ('corr-a1', 'review', 'local', 'model-x', 'tenant-a'),
        ('corr-a2', 'review', 'local', 'model-x', 'tenant-a'),
        ('corr-b1', 'test',   'cloud', 'model-y', 'tenant-b');
      INSERT INTO log_entries (node_name, function_name, level, message, correlation_id, tenant_id) VALUES
        ('node-1', 'fn', 'INFO',  'a-log', 'corr-a1', 'tenant-a'),
        ('node-2', 'fn', 'ERROR', 'b-log', 'corr-b1', 'tenant-b');
    `);

    appPool = new pg.Pool({ connectionString: withCredentials(ADMIN_URL!, APP_ROLE, APP_ROLE) });
    writerPool = new pg.Pool({
      connectionString: withCredentials(ADMIN_URL!, WRITER_ROLE, WRITER_ROLE),
    });
  }, 30_000);

  afterAll(async () => {
    await appPool?.end();
    await writerPool?.end();
    await admin?.end();
  });

  it('default-tenant backfill: pre-existing rows get tenant_id via column default', async () => {
    const res = await admin.query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'delegation_events' AND column_name = 'tenant_id'`,
    );
    expect(res.rows[0].column_default).toContain('omninode');
  });

  it('tenant A sees only tenant-A rows', async () => {
    const client = await appPool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', 'tenant-a', false)");
      const res = await client.query('SELECT correlation_id, tenant_id FROM delegation_events');
      expect(res.rows).toHaveLength(2);
      expect(res.rows.every((r: { tenant_id: string }) => r.tenant_id === 'tenant-a')).toBe(true);
    } finally {
      client.release(true);
    }
  });

  it('tenant B sees only tenant-B rows', async () => {
    const client = await appPool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', 'tenant-b', false)");
      const res = await client.query('SELECT correlation_id FROM delegation_events');
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].correlation_id).toBe('corr-b1');
    } finally {
      client.release(true);
    }
  });

  it('no tenant context => zero rows (fail closed)', async () => {
    const res = await appPool.query('SELECT * FROM delegation_events');
    expect(res.rows).toHaveLength(0);
    const logs = await appPool.query('SELECT * FROM log_entries');
    expect(logs.rows).toHaveLength(0);
  });

  it('empty-string tenant => zero rows (no wildcard tenant)', async () => {
    const client = await appPool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', '', false)");
      const res = await client.query('SELECT * FROM delegation_events');
      expect(res.rows).toHaveLength(0);
    } finally {
      client.release(true);
    }
  });

  it('cross-tenant INSERT by a non-owner writer is rejected (WITH CHECK)', async () => {
    const client = await writerPool.connect();
    try {
      await client.query("SELECT set_config('app.tenant_id', 'tenant-a', false)");
      await expect(
        client.query(
          `INSERT INTO delegation_events (correlation_id, tenant_id) VALUES ('evil', 'tenant-b')`,
        ),
      ).rejects.toThrow(/row-level security/);
      // Same-tenant insert is allowed.
      await client.query(
        `INSERT INTO delegation_events (correlation_id, tenant_id) VALUES ('fine', 'tenant-a')`,
      );
    } finally {
      client.release(true);
    }
  });

  it('end-to-end app path: PostgresProjectionReader under runWithTenantContext', async () => {
    const reader = new PostgresProjectionReader({
      connectionString: withCredentials(ADMIN_URL!, APP_ROLE, APP_ROLE),
    });
    try {
      const tenantA = await runWithTenantContext({ tenantId: 'tenant-a', subject: null }, () =>
        reader.readProjection('onex.snapshot.projection.delegation.decisions.v1'),
      );
      const corrs = tenantA.rows.map((r) => r.correlation_id).sort();
      expect(corrs).toContain('corr-a1');
      expect(corrs).toContain('corr-a2');
      expect(corrs).not.toContain('corr-b1');

      const tenantB = await runWithTenantContext({ tenantId: 'tenant-b', subject: null }, () =>
        reader.readProjection('onex.snapshot.projection.delegation.decisions.v1'),
      );
      expect(tenantB.rows.map((r) => r.correlation_id)).toEqual(['corr-b1']);

      // Unauthenticated app path: no context, no rows.
      const anonymous = await reader.readProjection(
        'onex.snapshot.projection.delegation.decisions.v1',
      );
      expect(anonymous.rows).toHaveLength(0);

      // queryLogEntries path.
      const logsA = await runWithTenantContext({ tenantId: 'tenant-a', subject: null }, () =>
        reader.queryLogEntries({ limit: 100 }),
      );
      expect(logsA).toHaveLength(1);
      expect(logsA[0].message).toBe('a-log');
    } finally {
      await reader.close();
    }
  });

  it('migration is idempotent (re-apply is a no-op, not an error)', async () => {
    await expect(admin.query(readFileSync(MIGRATION_PATH, 'utf8'))).resolves.toBeDefined();
  });
});
