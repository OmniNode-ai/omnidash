import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveConfiguredTenant,
  resolveTenantFor,
  resetExposureMetadataCache,
  fetchExposureTenantColumns,
} from './projection-tenant';

vi.mock('./projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
}));

const SCOPED = 'onex.snapshot.projection.delegation.summary.v1';
const UNSCOPED = 'onex.snapshot.projection.consumer-flow.v1';
const HOUSE = '820272f9-4aaf-5add-a2df-0af942852ab2';

function catalogue(ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => ({
      topics: [
        { topic: SCOPED, tenant_column: 'tenant_id', tenant_scoped: true },
        { topic: UNSCOPED, tenant_column: null, tenant_scoped: false },
      ],
    }),
  });
}

describe('resolveConfiguredTenant', () => {
  beforeEach(() => {
    resetExposureMetadataCache();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is null when nothing is configured', () => {
    // The contract default is empty by design, so an unconfigured dashboard
    // resolves no tenant rather than somebody's.
    expect(resolveConfiguredTenant()).toBeNull();
  });

  it('reads the env override', () => {
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', HOUSE);
    expect(resolveConfiguredTenant()).toBe(HOUSE);
  });

  it('treats whitespace as unset rather than as a tenant', () => {
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', '   ');
    expect(resolveConfiguredTenant()).toBeNull();
  });
});

describe('resolveTenantFor', () => {
  beforeEach(() => {
    resetExposureMetadataCache();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('scopes an exposure the SERVER says is scoped', async () => {
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', HOUSE);
    vi.stubGlobal('fetch', catalogue());
    expect(await resolveTenantFor(SCOPED)).toEqual({
      kind: 'scoped',
      query: `tenant=${encodeURIComponent(HOUSE)}`,
    });
  });

  it('does not scope an exposure the server says is unscoped', async () => {
    // The discriminating half: the same configured tenant, the same catalogue,
    // a different exposure. Attaching a tenant here is refused by the server as
    // an unsupported filter, so a blanket "always send it" would break every
    // unscoped widget.
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', HOUSE);
    vi.stubGlobal('fetch', catalogue());
    expect(await resolveTenantFor(UNSCOPED)).toEqual({ kind: 'unscoped' });
  });

  it('refuses a scoped exposure when no tenant is configured', async () => {
    vi.stubGlobal('fetch', catalogue());
    const result = await resolveTenantFor(SCOPED);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') throw new Error('unreachable');
    expect(result.reason).toContain('tenant_context_unresolved');
    expect(result.reason).toContain('tenant_id');
  });

  it('never resolves scoping from a topic name', async () => {
    // Positive control on the mechanism: the catalogue, not the string, decides.
    // With the SAME topic name declared unscoped by the server, a configured
    // tenant is not attached.
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', HOUSE);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          topics: [{ topic: SCOPED, tenant_column: null, tenant_scoped: false }],
        }),
      }),
    );
    expect(await resolveTenantFor(SCOPED)).toEqual({ kind: 'unscoped' });
  });

  it('sends the request unscoped when the catalogue cannot be read', async () => {
    // Unknown is not "scoped" and not "refused": the server is the authority and
    // refuses a scoped exposure on its own. Guessing scoped would attach a
    // tenant to exposures that refuse one, taking the whole dashboard down on a
    // metadata blip.
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', HOUSE);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await resolveTenantFor(SCOPED)).toEqual({ kind: 'unscoped' });
  });

  it('memoizes the catalogue across reads but not across failures', async () => {
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', HOUSE);
    const ok = catalogue();
    vi.stubGlobal('fetch', ok);
    await resolveTenantFor(SCOPED);
    await resolveTenantFor(UNSCOPED);
    expect(ok).toHaveBeenCalledTimes(1);

    resetExposureMetadataCache();
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', bad);
    await expect(fetchExposureTenantColumns()).rejects.toThrow();
    await expect(fetchExposureTenantColumns()).rejects.toThrow();
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
