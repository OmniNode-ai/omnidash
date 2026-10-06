import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// OMN-19994 AC1. The overlay's data_source.url names the local runtime (`onex dashboard`, loopback, no CORS).
// When the dev server proxies it (vite.config.ts sets OMNIDASH_SAME_ORIGIN_PROJECTION), the browser must read
// same-origin; an absolute cross-origin read failed with "Failed to fetch" on .201, 2026-10-05 18:14Z.
const overlay = vi.hoisted(() => ({
  DATA_SOURCE_DEFAULT_MODE: 'http',
  DATA_SOURCE_DEFAULT_URL: 'http://127.0.0.1:47694',
  DATA_SOURCE_DEFAULT_SQLITE_DB_PATH: '~/.omninode/delegation/delegation.sqlite',
  PROJECTION_TENANT_ID_DEFAULT: 'tenant-from-overlay',
}));

vi.mock('@/config/generated/data-source-defaults', () => overlay);

import { projectionUrl, resolveProjectionBaseUrl } from './projection-base-url';
import { clearDataSourceOverride, setDataSourceOverride } from './data-source-override';

const TOPIC = 'onex.snapshot.projection.delegation.decisions.v1';

describe('the dev server proxies the overlay projection URL (OMN-19994 AC1)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    vi.stubEnv('VITE_PROJECTION_API_URL', undefined);
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', undefined);
  });

  afterEach(() => {
    clearDataSourceOverride();
    vi.unstubAllEnvs();
  });

  it('reads same-origin when the dev server says it proxies the overlay URL', () => {
    vi.stubEnv('OMNIDASH_SAME_ORIGIN_PROJECTION', '1');
    expect(resolveProjectionBaseUrl()).toBe('');
    expect(projectionUrl(TOPIC, 'tenant=t')).toBe(`/projection/${TOPIC}?tenant=t`);
  });

  it('keeps the overlay URL when nothing proxies it (a built bundle)', () => {
    vi.stubEnv('OMNIDASH_SAME_ORIGIN_PROJECTION', undefined);
    expect(resolveProjectionBaseUrl()).toBe(overlay.DATA_SOURCE_DEFAULT_URL);
  });

  it('accepts only the exact flag value the dev server writes', () => {
    vi.stubEnv('OMNIDASH_SAME_ORIGIN_PROJECTION', 'true');
    expect(resolveProjectionBaseUrl()).toBe(overlay.DATA_SOURCE_DEFAULT_URL);
  });

  it('still lets an operator-pinned absolute base win', () => {
    vi.stubEnv('OMNIDASH_SAME_ORIGIN_PROJECTION', '1');
    setDataSourceOverride({ mode: 'live', baseUrl: 'http://operator-pinned:13002' });
    expect(resolveProjectionBaseUrl()).toBe('http://operator-pinned:13002');
  });

  it('still has no backend in file mode', () => {
    vi.stubEnv('OMNIDASH_SAME_ORIGIN_PROJECTION', '1');
    setDataSourceOverride({ mode: 'file' });
    expect(resolveProjectionBaseUrl()).toBeNull();
  });
});
