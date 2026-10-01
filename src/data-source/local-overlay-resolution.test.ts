import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const overlay = vi.hoisted(() => ({
  DATA_SOURCE_DEFAULT_MODE: 'http',
  DATA_SOURCE_DEFAULT_URL: 'http://overlay-projection:13002',
  DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: '~/.omninode/delegation/delegation.sqlite',
  PROJECTION_TENANT_ID_DEFAULT: 'tenant-from-overlay',
}));

vi.mock('@/config/generated/data-source-defaults', () => overlay);

import { resolveProjectionBaseUrl } from './projection-base-url';
import { resolveConfiguredTenant } from './projection-tenant';

describe('local overlay is authoritative for projection binding', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    vi.stubEnv('VITE_PROJECTION_API_URL', undefined);
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', undefined);
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('resolves the projection URL with no env file values', () => {
    expect(resolveProjectionBaseUrl()).toBe(overlay.DATA_SOURCE_DEFAULT_URL);
  });

  it('ignores stale browser env URLs when the overlay has the projection URL', () => {
    vi.stubEnv('VITE_PROJECTION_API_URL', 'http://stale-env:3002');
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', 'http://stale-http-env:3002');

    expect(resolveProjectionBaseUrl()).toBe(overlay.DATA_SOURCE_DEFAULT_URL);
  });

  it('resolves the tenant with no env file values', () => {
    expect(resolveConfiguredTenant()).toBe(overlay.PROJECTION_TENANT_ID_DEFAULT);
  });

  it('ignores a stale browser env tenant when the overlay has the tenant', () => {
    vi.stubEnv('VITE_PROJECTION_TENANT_ID', 'tenant-from-stale-env');

    expect(resolveConfiguredTenant()).toBe(overlay.PROJECTION_TENANT_ID_DEFAULT);
  });
});
