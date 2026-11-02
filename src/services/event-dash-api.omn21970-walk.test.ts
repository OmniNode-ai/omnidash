// OMN-21970 (ticket body: "remove the 500-run limit from every view"): Delegation Evidence reads every served run.
//
// Delegation Evidence reads decisions.v1 through its own reader, not the page loader. Failure modes, each with a test:
//   E1  the reader stops at the first page, so Evidence counts only the newest 500 runs
//   E2  the ranked first page and the walk overlap, so runs are counted twice
//   E3  a walk page that fails is presented as complete
//   E4  a store of 500 runs or fewer sends walk requests it does not need
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDelegationDecisions } from './event-dash-api';

vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string, query?: string) =>
    query ? `/projection/${encodeURIComponent(topic)}?${query}` : `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', () => ({
  resolveTenantFor: async () => ({ kind: 'unscoped' }),
}));

const BASE = Date.parse('2026-10-14T00:00:00Z');
function serve(runs: number, failSince?: string) {
  const rows = Array.from({ length: runs }, (_, index) => ({
    id: `id-${index + 1}`, projection_cursor: index + 1, correlation_id: `run-${index + 1}`,
    written_at: new Date(BASE + index * 60_000).toISOString(), quality_gate_passed: 1,
  }));
  const sinces: string[] = [];
  const envelope = (page: unknown[], extra: Record<string, unknown>) => ({
    ok: true, status: 200, json: async () => ({ rows: page, row_count: page.length, data_freshness: 'fresh', latest_event_at: null, ...extra }),
  });
  const fetchMock = vi.fn(async (url: string) => {
    const since = new URL(url, 'http://local').searchParams.get('since');
    if (since === null) {
      const newest = [...rows].reverse().slice(0, 500);
      return envelope(newest, runs > 500 ? { truncated: true, next_cursor: '0' } : { truncated: false, next_cursor: null });
    }
    sinces.push(since);
    if (since === failSince) return { ok: false, status: 503, json: async () => ({}) };
    const after = rows.filter(row => row.projection_cursor > Number(since));
    const page = after.slice(0, 500);
    return after.length > 500
      ? envelope(page, { truncated: true, next_cursor: String(page[page.length - 1]!.projection_cursor) })
      : envelope(page, { truncated: false, next_cursor: null });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sinces };
}

const cursors = (rows: readonly { projection_cursor?: unknown }[]) => rows.map(row => row.projection_cursor);

describe('OMN-21970: Delegation Evidence reads every served run', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('E1, E2: 1,200 served runs read as 1,200 distinct runs, newest first, and the read is complete', async () => {
    const { sinces } = serve(1200);
    const result = await fetchDelegationDecisions();
    expect(result.rows).toHaveLength(1200);
    expect(new Set(cursors(result.rows as never)).size).toBe(1200);
    expect(cursors(result.rows as never)[0]).toBe(1200);
    expect(result.complete).toBe(true);
    expect(sinces).toEqual(['0', '500', '1000']);
  });

  it('E3: a failed walk page keeps the runs read so far and marks the read incomplete', async () => {
    serve(1200, '500');
    const result = await fetchDelegationDecisions();
    expect(result.complete).toBe(false);
    expect(result.rows.length).toBeGreaterThanOrEqual(500);
    expect(result.rows.length).toBeLessThan(1200);
    expect(new Set(cursors(result.rows as never)).size).toBe(result.rows.length);
  });

  it('E4: 500 runs or fewer is one read, complete, with no walk', async () => {
    const { sinces } = serve(500);
    const result = await fetchDelegationDecisions();
    expect(result.rows).toHaveLength(500);
    expect(result.complete).toBe(true);
    expect(sinces).toEqual([]);
  });
});
