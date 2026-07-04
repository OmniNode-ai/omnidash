// @vitest-environment node
// OMN-10875: onboarding integration proof against a REAL throwaway Postgres.
//
// Applies db/migrations/0002_tenant_onboarding.sql and proves:
//   1. provisioning creates exactly one tenant row per OIDC subject
//   2. repeated + concurrent provisioning is idempotent (no duplicate tenants
//      — the OMN-10875 acceptance criterion)
//   3. slug collisions across subjects converge on suffixed slugs
//   4. the tenants registry is RLS-scoped for the app role: active-tenant
//      context sees only its own row; no context => ZERO rows (fail closed)
//   5. the default 'omninode' tenant registry row is seeded
//
// Same harness contract as tenant-rls.integration.test.ts: requires
// TENANT_RLS_TEST_DATABASE_URL (disposable database, owner credentials); the
// CI `tenant-rls` job provides postgres:16 and sets TENANT_RLS_REQUIRED so
// this suite can never pass vacuously via skip.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  createTenantProvisioner,
  derivePrincipalId,
  type TenantProvisioner,
} from '../onboarding/tenant-provisioning.js';
import { createKeycloakAdminClient } from '../onboarding/keycloak-admin.js';

const ADMIN_URL = process.env.TENANT_RLS_TEST_DATABASE_URL;

if (!ADMIN_URL && process.env.TENANT_RLS_REQUIRED) {
  throw new Error(
    'TENANT_RLS_REQUIRED is set but TENANT_RLS_TEST_DATABASE_URL is missing — refusing to skip the onboarding gate',
  );
}

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const MIGRATION_PATH = resolve(__dirname, '..', '..', 'db', 'migrations', '0002_tenant_onboarding.sql');

const APP_ROLE = 'onboarding_test_app';

function withCredentials(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

describe.skipIf(!ADMIN_URL)('tenant onboarding (real Postgres)', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let provisioner: TenantProvisioner;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });

    await admin.query('DROP TABLE IF EXISTS tenants CASCADE');
    // Apply the REAL migration file — the artifact under test. Twice, to
    // prove idempotency of the migration itself.
    const migration = readFileSync(MIGRATION_PATH, 'utf8');
    await admin.query(migration);
    await admin.query(migration);

    await admin.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          EXECUTE 'DROP OWNED BY ${APP_ROLE}';
          EXECUTE 'DROP ROLE ${APP_ROLE}';
        END IF;
      END
      $$;
      CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_ROLE}' IN ROLE omnidash_app;
    `);

    appPool = new pg.Pool({ connectionString: withCredentials(ADMIN_URL!, APP_ROLE, APP_ROLE) });

    // The provisioner writes as the table owner (admin) — provisioning runs
    // BEFORE any tenant context exists. Keycloak stays in plan mode: the
    // integration proof must not require (or touch) a live realm.
    provisioner = createTenantProvisioner({
      db: admin,
      keycloak: createKeycloakAdminClient({
        applyMode: 'plan',
        adminBaseUrl: '',
        tokenUrl: '',
        clientId: '',
        clientSecret: null,
      }),
    });
  }, 30_000);

  afterAll(async () => {
    await appPool?.end();
    await admin?.end();
  });

  it('seeds the default omninode tenant registry row', async () => {
    const res = await admin.query("SELECT tenant_slug, status FROM tenants WHERE tenant_id = 'omninode'");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ tenant_slug: 'omninode', status: 'active' });
  });

  it('creates one tenant per subject and repeats idempotently', async () => {
    const first = await provisioner.provision({
      subject: 'itest-sub-1',
      email: 'alice@example.com',
      requestedSlug: 'Acme Corp',
    });
    expect(first.outcome).toBe('created');
    expect(first.tenant.tenantSlug).toBe('acme-corp');
    expect(first.tenant.principalId).toBe(derivePrincipalId(first.tenant.tenantId));
    expect(first.keycloak.applied).toBe(false);
    expect(first.credentials).toMatchObject({ status: 'deferred', ticket: 'OMN-12911' });

    const second = await provisioner.provision({ subject: 'itest-sub-1' });
    expect(second.outcome).toBe('existing');
    expect(second.tenant.tenantId).toBe(first.tenant.tenantId);

    const count = await admin.query(
      "SELECT count(*)::int AS n FROM tenants WHERE created_by_subject = 'itest-sub-1'",
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('concurrent provisioning for the same subject converges on one tenant', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        provisioner.provision({ subject: 'itest-racer', requestedSlug: 'racer' }),
      ),
    );
    const ids = new Set(results.map((r) => r.tenant.tenantId));
    expect(ids.size).toBe(1);
    const count = await admin.query(
      "SELECT count(*)::int AS n FROM tenants WHERE created_by_subject = 'itest-racer'",
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('slug collision across different subjects resolves with a suffix', async () => {
    const a = await provisioner.provision({ subject: 'itest-slug-a', requestedSlug: 'shared-slug' });
    const b = await provisioner.provision({ subject: 'itest-slug-b', requestedSlug: 'shared-slug' });
    expect(a.tenant.tenantSlug).toBe('shared-slug');
    expect(b.tenant.tenantSlug).toMatch(/^shared-slug-/);
    expect(b.tenant.tenantId).not.toBe(a.tenant.tenantId);
  });

  it('RLS: app role with tenant context sees ONLY its own registry row', async () => {
    const target = await provisioner.provision({ subject: 'itest-rls', requestedSlug: 'rls-tenant' });
    const client = await appPool.connect();
    try {
      await client.query(
        "SELECT set_config('app.tenant_id', $1, false)",
        [target.tenant.tenantId],
      );
      const res = await client.query('SELECT tenant_id FROM tenants');
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].tenant_id).toBe(target.tenant.tenantId);
    } finally {
      client.release(true);
    }
  });

  it('RLS: app role with NO tenant context sees zero registry rows (fail closed)', async () => {
    const client = await appPool.connect();
    try {
      const res = await client.query('SELECT tenant_id FROM tenants');
      expect(res.rows).toHaveLength(0);
    } finally {
      client.release(true);
    }
  });

  it('RLS: app role cannot insert into the registry (fail closed WITH CHECK)', async () => {
    const client = await appPool.connect();
    try {
      await expect(
        client.query(
          "INSERT INTO tenants (tenant_id, tenant_slug, principal_id, display_name, created_by_subject) "
          + "VALUES ('t_evil', 'evil', 'principal:evil', 'Evil', 'itest-evil')",
        ),
      ).rejects.toThrow(/permission denied|row-level security/);
    } finally {
      client.release(true);
    }
  });
});
