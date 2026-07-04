// @vitest-environment node
// OMN-10875: Keycloak admin surface — plan mode must be pure (zero network),
// execute mode must perform the token + GET + PUT sequence.
import { describe, it, expect, vi } from 'vitest';
import { createKeycloakAdminClient, planTenantAttributeSteps } from './keycloak-admin.js';

const ATTRS = { tenantId: 't_abc123', tenantSlug: 'acme' };

describe('planTenantAttributeSteps', () => {
  it('describes a GET-then-PUT against the user resource', () => {
    const steps = planTenantAttributeSteps('user-sub-1', ATTRS);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ kind: 'keycloak_admin', method: 'GET', path: '/users/user-sub-1' });
    expect(steps[1]).toMatchObject({ kind: 'keycloak_admin', method: 'PUT', path: '/users/user-sub-1' });
    expect(steps[1].description).toContain('tenant_id=["t_abc123"]');
    expect(steps[1].description).toContain('tenant_slug=["acme"]');
  });

  it('URL-encodes the subject', () => {
    const steps = planTenantAttributeSteps('a/b c', ATTRS);
    expect(steps[0].path).toBe('/users/a%2Fb%20c');
  });
});

describe('plan mode', () => {
  it('never touches the network and reports applied: false', async () => {
    const fetchImpl = vi.fn();
    const client = createKeycloakAdminClient({
      applyMode: 'plan',
      adminBaseUrl: '',
      tokenUrl: '',
      clientId: '',
      clientSecret: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.applyTenantAttributes('sub-1', ATTRS);
    expect(result.applied).toBe(false);
    expect(result.plan).toHaveLength(2);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('execute mode', () => {
  it('fails fast at construction without a client secret', () => {
    expect(() =>
      createKeycloakAdminClient({
        applyMode: 'execute',
        adminBaseUrl: 'https://auth.example.com/admin/realms/r',
        tokenUrl: 'https://auth.example.com/realms/r/protocol/openid-connect/token',
        clientId: 'onboarding',
        clientSecret: null,
      }),
    ).toThrow(/client secret/);
  });

  it('fails fast at construction without an admin base URL', () => {
    expect(() =>
      createKeycloakAdminClient({
        applyMode: 'execute',
        adminBaseUrl: '',
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'onboarding',
        clientSecret: 's3cr3t',
      }),
    ).toThrow(/keycloak_admin_base_url/);
  });

  it('performs token -> GET user -> PUT user with merged attributes', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/token')) {
        return new Response(JSON.stringify({ access_token: 'admin-token' }), { status: 200 });
      }
      if (!init || init.method === undefined) {
        return new Response(
          JSON.stringify({ username: 'alice', attributes: { locale: ['en'] } }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 204 });
    });

    const client = createKeycloakAdminClient({
      applyMode: 'execute',
      adminBaseUrl: 'https://auth.example.com/admin/realms/r/',
      tokenUrl: 'https://auth.example.com/realms/r/protocol/openid-connect/token',
      clientId: 'onboarding',
      clientSecret: 's3cr3t',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.applyTenantAttributes('sub-1', ATTRS);
    expect(result.applied).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain('/token');
    expect(calls[1].url).toBe('https://auth.example.com/admin/realms/r/users/sub-1');
    expect(calls[2].init?.method).toBe('PUT');
    const putBody = JSON.parse(String(calls[2].init?.body)) as {
      attributes: Record<string, string[]>;
    };
    // Existing attributes are preserved; tenant attributes are set.
    expect(putBody.attributes.locale).toEqual(['en']);
    expect(putBody.attributes.tenant_id).toEqual(['t_abc123']);
    expect(putBody.attributes.tenant_slug).toEqual(['acme']);
  });

  it('propagates a failed token request', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
    const client = createKeycloakAdminClient({
      applyMode: 'execute',
      adminBaseUrl: 'https://auth.example.com/admin/realms/r',
      tokenUrl: 'https://auth.example.com/token',
      clientId: 'onboarding',
      clientSecret: 's3cr3t',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.applyTenantAttributes('sub-1', ATTRS)).rejects.toThrow(/HTTP 401/);
  });
});
