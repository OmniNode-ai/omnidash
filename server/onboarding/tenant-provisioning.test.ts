// @vitest-environment node
// OMN-10875: tenant provisioning — idempotency, slug handling, immutable
// principal derivation, and the deferred OMN-12911 credentials stub.
import { describe, it, expect, vi } from 'vitest';
import {
  createTenantProvisioner,
  derivePrincipalId,
  normalizeSlug,
  type Queryable,
} from './tenant-provisioning.js';
import type { KeycloakAdminClient } from './keycloak-admin.js';

function planKeycloak(): KeycloakAdminClient {
  return {
    applyMode: 'plan',
    applyTenantAttributes: vi.fn((subject: string, attrs) =>
      Promise.resolve({
        applied: false,
        plan: [
          {
            kind: 'keycloak_admin' as const,
            method: 'PUT' as const,
            path: `/users/${subject}`,
            description: `tenant ${attrs.tenantId}`,
          },
        ],
      }),
    ),
  };
}

/** In-memory tenants table honoring the two UNIQUE constraints. */
function fakeDb(): Queryable & { tenants: Record<string, unknown>[] } {
  const tenants: Record<string, unknown>[] = [];
  return {
    tenants,
    async query(text: string, params: unknown[] = []) {
      if (text.startsWith('SELECT')) {
        return { rows: tenants.filter((t) => t.created_by_subject === params[0]) };
      }
      if (text.startsWith('INSERT')) {
        const [tenantId, slug, principalId, displayName, subject, email] = params as string[];
        if (tenants.some((t) => t.created_by_subject === subject)) {
          return { rows: [] }; // ON CONFLICT (created_by_subject) DO NOTHING
        }
        if (tenants.some((t) => t.tenant_slug === slug)) {
          const err = new Error('duplicate key value violates unique constraint "tenants_tenant_slug_key"');
          (err as Error & { code: string }).code = '23505';
          throw err;
        }
        tenants.push({
          tenant_id: tenantId,
          tenant_slug: slug,
          principal_id: principalId,
          display_name: displayName,
          status: 'active',
          created_by_subject: subject,
          created_by_email: email,
          created_at: new Date('2026-07-03T00:00:00Z'),
        });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

describe('normalizeSlug', () => {
  it('lowercases and collapses non-alphanumerics', () => {
    expect(normalizeSlug('Acme Corp!')).toBe('acme-corp');
  });
  it('returns null for unusable input', () => {
    expect(normalizeSlug('')).toBeNull();
    expect(normalizeSlug('--')).toBeNull();
    expect(normalizeSlug(null)).toBeNull();
    expect(normalizeSlug('a')).toBeNull();
  });
  it('caps length', () => {
    const slug = normalizeSlug('x'.repeat(100));
    expect(slug).toHaveLength(40);
  });
});

describe('derivePrincipalId', () => {
  it('is deterministic over tenant_id and independent of slug', () => {
    expect(derivePrincipalId('t_1')).toBe(derivePrincipalId('t_1'));
    expect(derivePrincipalId('t_1')).not.toBe(derivePrincipalId('t_2'));
    expect(derivePrincipalId('t_1')).toMatch(/^principal:[0-9a-f]{32}$/);
  });
});

describe('provision', () => {
  it('creates a tenant on first call and returns the same one on repeat (idempotent)', async () => {
    const db = fakeDb();
    const provisioner = createTenantProvisioner({ db, keycloak: planKeycloak() });

    const first = await provisioner.provision({
      subject: 'sub-1',
      email: 'alice@example.com',
      requestedSlug: 'Acme Corp',
    });
    expect(first.outcome).toBe('created');
    expect(first.tenant.tenantSlug).toBe('acme-corp');
    expect(first.tenant.principalId).toBe(derivePrincipalId(first.tenant.tenantId));

    const second = await provisioner.provision({ subject: 'sub-1' });
    expect(second.outcome).toBe('existing');
    expect(second.tenant.tenantId).toBe(first.tenant.tenantId);
    expect(db.tenants).toHaveLength(1);
  });

  it('falls back to the email local-part slug, then a generated slug', async () => {
    const db = fakeDb();
    const provisioner = createTenantProvisioner({ db, keycloak: planKeycloak() });
    const fromEmail = await provisioner.provision({ subject: 'sub-2', email: 'bob.smith@example.com' });
    expect(fromEmail.tenant.tenantSlug).toBe('bob-smith');

    const generated = await provisioner.provision({ subject: 'sub-3' });
    expect(generated.tenant.tenantSlug).toMatch(/^tenant-[0-9a-f]{8}$/);
  });

  it('retries with a suffixed slug when another subject owns the slug', async () => {
    const db = fakeDb();
    const provisioner = createTenantProvisioner({ db, keycloak: planKeycloak() });
    const a = await provisioner.provision({ subject: 'sub-a', requestedSlug: 'shared' });
    const b = await provisioner.provision({ subject: 'sub-b', requestedSlug: 'shared' });
    expect(a.tenant.tenantSlug).toBe('shared');
    expect(b.tenant.tenantSlug).toMatch(/^shared-/);
    expect(db.tenants).toHaveLength(2);
  });

  it('rejects an empty subject', async () => {
    const provisioner = createTenantProvisioner({ db: fakeDb(), keycloak: planKeycloak() });
    await expect(provisioner.provision({ subject: '  ' })).rejects.toThrow(/subject/);
  });

  it('returns the deferred OMN-12911 credentials stub — nothing is minted', async () => {
    const provisioner = createTenantProvisioner({ db: fakeDb(), keycloak: planKeycloak() });
    const result = await provisioner.provision({ subject: 'sub-4' });
    expect(result.credentials.status).toBe('deferred');
    expect(result.credentials.ticket).toBe('OMN-12911');
  });

  it('threads the tenant identity into the keycloak apply step', async () => {
    const keycloak = planKeycloak();
    const provisioner = createTenantProvisioner({ db: fakeDb(), keycloak });
    const result = await provisioner.provision({ subject: 'sub-5', requestedSlug: 'acme' });
    expect(keycloak.applyTenantAttributes).toHaveBeenCalledWith('sub-5', {
      tenantId: result.tenant.tenantId,
      tenantSlug: 'acme',
    });
    expect(result.keycloak.applied).toBe(false);
    expect(result.keycloak.plan.length).toBeGreaterThan(0);
  });
});

describe('lookup', () => {
  it('returns null before provisioning and the tenant after', async () => {
    const db = fakeDb();
    const provisioner = createTenantProvisioner({ db, keycloak: planKeycloak() });
    expect(await provisioner.lookup('sub-9')).toBeNull();
    await provisioner.provision({ subject: 'sub-9', requestedSlug: 'niner' });
    expect((await provisioner.lookup('sub-9'))?.tenantSlug).toBe('niner');
  });
});
