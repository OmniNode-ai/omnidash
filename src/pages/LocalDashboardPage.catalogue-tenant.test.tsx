// @vitest-environment jsdom
// OMN-20728: the released bundle carries no build-time tenant, so on `onex dashboard` the tenant comes from the
// server's own `GET /projections`. The real HTTP source, census and tenant resolver run here; only the network is
// stubbed. The no-tenant-anywhere half is LocalDashboardPage.tenant.test.tsx, whose catalogue declares none.
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExposureMetadataCache } from '@/data-source/projection-tenant';

const BASE = 'http://projection.test';
const INSTALL = 'c94fa3c5-ea87-4dbb-a4fc-424343bac7a0';
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const USAGE = 'onex.snapshot.projection.usage-by-model-day.v1';
const SCOPED = new Set([DECISIONS, SAVINGS]);

vi.mock('@/data-source/data-source-override', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/data-source-override')>()),
  resolveEffectiveDataSource: () => ({ mode: 'http', baseUrl: BASE }),
}));
// The released bundle: no build-time tenant.
vi.mock('@/config/generated/data-source-defaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/generated/data-source-defaults')>()),
  PROJECTION_TENANT_ID_DEFAULT: '',
}));

import { LocalDashboardPage } from './LocalDashboardPage';

const reads: string[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  resetExposureMetadataCache();
  reads.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${BASE}/projections`) {
      return json({
        tenant: INSTALL,
        topics: [DECISIONS, SAVINGS, USAGE].map((topic) => ({
          topic,
          backing: 'bus',
          tenant_column: SCOPED.has(topic) ? 'tenant_id' : null,
          tenant_scoped: SCOPED.has(topic),
        })),
      });
    }
    reads.push(url);
    return json({ rows: [], row_count: 0, data_freshness: 'fresh' });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetExposureMetadataCache();
});

describe('LocalDashboardPage reading the tenant the server declares (OMN-20728)', () => {
  it('the Runs page reads the decisions exposure as the declared tenant', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    await waitFor(() => expect(screen.queryByText(/Loading runtime exposures/)).not.toBeInTheDocument());
    await waitFor(() =>
      expect(reads).toContain(`${BASE}/projection/${DECISIONS}?tenant=${encodeURIComponent(INSTALL)}`),
    );
    expect(document.querySelector('[data-tenant-state="not-configured"]')).not.toBeInTheDocument();
    // An unscoped exposure never carries the tenant.
    expect(reads.filter((url) => url.includes(USAGE) && url.includes('tenant='))).toEqual([]);
  });
});
