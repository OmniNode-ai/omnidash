// OMN-10875: client seam for the onboarding backend.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { provisionTenant, fetchOnboardingStatus } from './onboarding-api';

const TENANT = {
  tenant_id: 't_abc',
  tenant_slug: 'acme',
  principal_id: 'principal:abc',
  display_name: 'Acme',
  status: 'active',
  created_at: '2026-07-03T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provisionTenant', () => {
  it('POSTs the bearer token and snake_case body, returns the parsed result', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          outcome: 'created',
          tenant: TENANT,
          keycloak: { applied: false, plan: [] },
          credentials: { status: 'deferred', reason: 'p0b', ticket: 'OMN-12911' },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await provisionTenant('tok-1', { requestedSlug: 'acme', displayName: 'Acme' });
    expect(result.outcome).toBe('created');
    expect(result.tenant.tenant_slug).toBe('acme');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/onboarding/provision');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(String(init.body))).toEqual({ requested_slug: 'acme', display_name: 'Acme' });
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(provisionTenant('tok-1')).rejects.toThrow(/HTTP 503/);
  });
});

describe('fetchOnboardingStatus', () => {
  it('GETs with the bearer token and returns the status', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ subject: 'sub-1', provisioned: true, tenant: TENANT }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const status = await fetchOnboardingStatus('tok-2');
    expect(status.provisioned).toBe(true);
    expect(status.tenant?.tenant_id).toBe('t_abc');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/onboarding/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-2');
  });

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(fetchOnboardingStatus('tok-2')).rejects.toThrow(/HTTP 401/);
  });
});
