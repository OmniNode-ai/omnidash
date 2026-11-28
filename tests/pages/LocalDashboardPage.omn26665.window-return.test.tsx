// @vitest-environment jsdom
// OMN-26665 AC1: the Overview window stays in the address on every way back to Overview. The page wrote ?window=7d to
// its address, but the sidebar link and the "Go to Overview" link point at the bare /overview, so Runs and back opened
// on all time. Failure modes, each with a test below:
//   R1  a 7-day Overview left for Runs and returned to by the sidebar opens without its window
//   R2  the 30-day control: an address that names a window still reads it
//   R3  a fresh tab (no window ever chosen) must still open on all time, not on a window remembered from nowhere
//   R4  an explicit ?day= in the address wins over the window remembered from the earlier visit
//   R5  the "Go to Overview" link of the not-found page returns to the remembered window
//   R6  landing on the bare /overview (all time) forgets the window, so the way back is the bare /overview
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/data-source/data-source-override', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/data-source-override')>()),
  resolveEffectiveDataSource: () => ({ mode: 'http', baseUrl: 'http://projection.test' }),
}));
vi.mock('@/data-source/projection-base-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-base-url')>()),
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string, query?: string) =>
    query ? `/projection/${encodeURIComponent(topic)}?${query}` : `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));

import { App } from '@/App';
import { Providers } from '@/providers/Providers';
import { RegistryProvider } from '@/registry/RegistryProvider';
import * as routes from '@/navigation/page-routes';

const address = () => window.location.pathname + window.location.search;

/** The Overview page is a lazy chunk: its window is remembered only once it has mounted and shown its window switch. */
const overviewMounted = () => waitFor(() => expect(document.querySelector('.local-window-switch')).not.toBeNull(), { timeout: 10_000 });

function mountAt(path: string) {
  window.history.replaceState(null, '', path);
  return render(<Providers><RegistryProvider manifest={{ manifestVersion: '1.0', generatedAt: '2026-04-10T00:00:00Z', components: {} }}><App /></RegistryProvider></Providers>);
}

async function click(testId: string) {
  await act(async () => { fireEvent.click(await screen.findByTestId(testId)); });
}

describe('OMN-26665 AC1: the Overview window survives leaving and returning', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input), 'http://projection.test');
      if (url.pathname.endsWith('/projections')) return new Response(JSON.stringify({ topics: [] }), { status: 200 });
      return new Response(JSON.stringify({ rows: [], row_count: 0, data_freshness: 'fresh', latest_event_at: null }), { status: 200 });
    }));
    // A fresh tab has nothing remembered; the module is the tab's memory, so each test starts from that.
    (routes as { resetOverviewWindowMemory?: () => void }).resetOverviewWindowMemory?.();
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

  it('R1: /overview?window=7d to Runs and back by the sidebar is /overview?window=7d', async () => {
    mountAt('/overview?window=7d');
    await overviewMounted();
    await click('nav-local-runs');
    await waitFor(() => expect(window.location.pathname).toBe('/runs'));
    await click('nav-local-overview');
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));
    expect(address()).toBe('/overview?window=7d');
  });

  it('R2 control: /overview?window=30d still reads 30d, on the mount and on the way back', async () => {
    mountAt('/overview?window=30d');
    await overviewMounted();
    await click('nav-local-runs');
    await waitFor(() => expect(window.location.pathname).toBe('/runs'));
    await click('nav-local-overview');
    await waitFor(() => expect(address()).toBe('/overview?window=30d'));
  });

  it('R3: a fresh tab that goes to Runs and back opens on all time', async () => {
    mountAt('/overview');
    await overviewMounted();
    await click('nav-local-runs');
    await waitFor(() => expect(window.location.pathname).toBe('/runs'));
    await click('nav-local-overview');
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));
    expect(address()).toBe('/overview');
  });

  it('R4: an explicit ?day= address wins over the remembered window', async () => {
    mountAt('/overview?window=7d');
    await overviewMounted();
    await click('nav-local-runs');
    await waitFor(() => expect(window.location.pathname).toBe('/runs'));
    await act(async () => {
      window.history.pushState(null, '', '/overview?day=2026-11-10');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(address()).toBe('/overview?day=2026-11-10'));
  });

  it('R5: the not-found page "Go to Overview" link returns to the remembered window', async () => {
    mountAt('/overview?window=7d');
    await overviewMounted();
    await click('nav-local-runs');
    await act(async () => {
      window.history.pushState(null, '', '/no-such-page');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => { fireEvent.click(await screen.findByRole('link', { name: 'Go to Overview' })); });
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));
    expect(address()).toBe('/overview?window=7d');
  });

  it('R6: landing on the bare /overview (all time) forgets the window', async () => {
    mountAt('/overview?window=7d');
    await overviewMounted();
    await click('nav-local-runs');
    await waitFor(() => expect(window.location.pathname).toBe('/runs'));
    await act(async () => {
      window.history.pushState(null, '', '/overview');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(address()).toBe('/overview'));
    await click('nav-local-runs');
    await waitFor(() => expect(window.location.pathname).toBe('/runs'));
    await click('nav-local-overview');
    await waitFor(() => expect(window.location.pathname).toBe('/overview'));
    expect(address()).toBe('/overview');
  });
});
