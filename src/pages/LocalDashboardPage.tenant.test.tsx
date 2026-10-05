// @vitest-environment jsdom
// OMN-19994 AC2: with no tenant configured, every tenant-scoped panel on the local pages shows the typed
// tenant-not-configured state, not a red read error. The real HTTP source, census and tenant resolver run here;
// only the network is stubbed, with the catalogue declaring which exposures are tenant-scoped.
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExposureMetadataCache } from '@/data-source/projection-tenant';

const BASE = 'http://projection.test';
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const CREDENTIALS = 'onex.snapshot.projection.tenant-credentials.v1';
const USAGE = 'onex.snapshot.projection.usage-by-model-day.v1';
const SCOPED = new Set([DECISIONS, SAVINGS, OVERVIEW, CREDENTIALS]);

vi.mock('@/data-source/data-source-override', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/data-source-override')>()),
  resolveEffectiveDataSource: () => ({ mode: 'http', baseUrl: BASE }),
}));
// No tenant: the generated contract default is empty unless contract.local.yaml sets one.
vi.mock('@/config/generated/data-source-defaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/generated/data-source-defaults')>()),
  PROJECTION_TENANT_ID_DEFAULT: '',
}));

import { LocalDashboardPage } from './LocalDashboardPage';

const projectionReads: string[] = [];

function catalogue() {
  return {
    topics: [DECISIONS, SAVINGS, OVERVIEW, CREDENTIALS, USAGE].map((topic) => ({
      topic,
      backing: 'bus',
      tenant_column: SCOPED.has(topic) ? 'tenant_id' : null,
      tenant_scoped: SCOPED.has(topic),
    })),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  resetExposureMetadataCache();
  projectionReads.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${BASE}/projections`) return json(catalogue());
    const topic = decodeURIComponent(url.slice(`${BASE}/projection/`.length).split('?')[0]);
    projectionReads.push(topic);
    // What the server answers a scoped exposure read with no tenant.
    if (SCOPED.has(topic)) return json({ detail: 'tenant_context_unresolved' }, 422);
    return json({ rows: [], row_count: 0, data_freshness: 'fresh' });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetExposureMetadataCache();
});

async function panelsOf(pageName: 'overview' | 'runs' | 'workflow' | 'credentials' | 'api-keys') {
  render(<LocalDashboardPage pageName={pageName} />);
  await waitFor(() => expect(screen.queryByText(/Loading runtime exposures/)).not.toBeInTheDocument());
  return screen.getAllByRole('article');
}

describe('LocalDashboardPage with no tenant configured (OMN-19994 AC2)', () => {
  it.each(['overview', 'runs', 'workflow', 'credentials', 'api-keys'] as const)(
    'the %s page shows the typed tenant state on every tenant-scoped panel and no read error',
    async (pageName) => {
      const panels = await panelsOf(pageName);
      // Panels bound to no exposure (pending sources, unlinked cloud keys) read nothing and keep their own state.
      const scopedPanels = panels.filter((panel) => !within(panel).queryByText(/waits on|Not served|CLOUD_NOT_LINKED/));
      expect(scopedPanels.length).toBeGreaterThan(0);
      for (const panel of scopedPanels) {
        expect(panel.querySelector('[data-tenant-state="not-configured"]')).toBeInTheDocument();
        expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
        expect(within(panel).queryByText(/HTTP \d{3}/)).not.toBeInTheDocument();
      }
      // The browser never sends a read it knows the server refuses.
      expect(projectionReads.filter((topic) => SCOPED.has(topic))).toEqual([]);
    },
  );

  it('one Tenant not configured state per panel, even when a panel binds several scoped exposures', async () => {
    const panels = await panelsOf('overview');
    for (const panel of panels) {
      expect(panel.querySelectorAll('[data-tenant-state="not-configured"]').length).toBeLessThanOrEqual(1);
    }
  });
});
