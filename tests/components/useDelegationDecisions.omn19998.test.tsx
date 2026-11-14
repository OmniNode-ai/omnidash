// OMN-24472 AC3: a page's timer poll must never walk the run history.
//
// useDelegationDecisions passes the result the query already holds to every later fetch, so a poll reads one newest
// page and merges it. Failure mode: the poll re-walking the run history on every interval tick.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDelegationDecisions } from '@/components/dashboard/event-dash/useEventDashData';

vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string, query?: string) =>
    query ? `/projection/${encodeURIComponent(topic)}?${query}` : `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', () => ({
  resolveTenantFor: async () => ({ kind: 'unscoped' }),
}));
vi.mock('@/theme/refresh', () => ({ refreshInterval: () => 1000 }));

const BASE = Date.parse('2026-10-14T00:00:00Z');
const runRow = (cursor: number) => ({
  id: `id-${cursor}`, projection_cursor: cursor, correlation_id: `run-${cursor}`,
  written_at: new Date(BASE + (cursor - 1) * 60_000).toISOString(), quality_gate_passed: 1,
});
function serve(runs: number) {
  const rows = Array.from({ length: runs }, (_, index) => runRow(index + 1));
  const urls: string[] = [];
  const envelope = (page: unknown[], extra: Record<string, unknown>) => ({
    ok: true, status: 200, json: async () => ({ rows: page, row_count: page.length, data_freshness: 'fresh', latest_event_at: null, ...extra }),
  });
  const fetchMock = vi.fn(async (url: string) => {
    urls.push(url);
    const since = new URL(url, 'http://local').searchParams.get('since');
    if (since === null) {
      const newest = [...rows].reverse().slice(0, 500);
      return envelope(newest, rows.length > 500 ? { truncated: true, next_cursor: '0' } : { truncated: false, next_cursor: null });
    }
    const after = rows.filter(row => row.projection_cursor > Number(since));
    const page = after.slice(0, 500);
    return after.length > 500
      ? envelope(page, { truncated: true, next_cursor: String(page[page.length - 1]!.projection_cursor) })
      : envelope(page, { truncated: false, next_cursor: null });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { rows, urls };
}

function DecisionsProbe() {
  const { data } = useDelegationDecisions();
  return (
    <div>
      <span data-testid="row-count">{data ? String(data.rows.length) : 'waiting'}</span>
      <span data-testid="newest-id">{data?.rows[0]?.id ?? 'none'}</span>
    </div>
  );
}

describe('OMN-24472 AC3: the decisions timer poll reads the newest page, never the walk', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // AC3: the interval tick re-walking the run history — every poll after the first must be one newest-page read.
  it('AC3: the first fetch walks a 1,200-run store, then two interval ticks add exactly two requests, none with since, and the new runs show', async () => {
    const { rows, urls } = serve(1200);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DecisionsProbe />
      </QueryClientProvider>,
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    const loaded = urls.length;
    expect(loaded).toBe(4);
    expect(urls.slice(0, loaded).filter(url => url.includes('since=')).length).toBe(3);
    expect(screen.getByTestId('row-count').textContent).toBe('1200');
    expect(screen.getByTestId('newest-id').textContent).toBe('id-1200');

    rows.push(...Array.from({ length: 20 }, (_, index) => runRow(1201 + index)));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(urls.length).toBe(loaded + 2);
    expect(urls.slice(loaded).some(url => url.includes('since='))).toBe(false);
    expect(screen.getByTestId('row-count').textContent).toBe('1220');
    expect(screen.getByTestId('newest-id').textContent).toBe('id-1220');
  });
});
