// OMN-19998: the first load of the decisions exposure reads the newest page only, and the older runs are read one page
// per Load more press (fetchMoreDelegationDecisions). The fetch-mocking shape is the timer-walk test's. Failure modes,
// each with a test below:
//   T3a the first-load walk returning: a 120,896-run store costing more than one request
//   T3b a Load more press chasing the cursor, losing runs, duplicating the overlap, or mis-sorting the merge
//   T3c a failed Load more page throwing or replacing held, and a press on a non-truncated result sending requests
//   T3d a Load more press reading more than the one page it was asked for
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDelegationDecisions,
  fetchMoreDelegationDecisions,
  type DelegationDecisionRow,
  type ProjectionResult,
} from '@/services/event-dash-api';

vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string, query?: string) =>
    query ? `/projection/${encodeURIComponent(topic)}?${query}` : `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', () => ({
  resolveTenantFor: async () => ({ kind: 'unscoped' }),
}));

const BASE = Date.parse('2026-10-14T00:00:00Z');
const runRow = (cursor: number) => ({
  id: `id-${cursor}`, projection_cursor: cursor, correlation_id: `run-${cursor}`,
  written_at: new Date(BASE + (cursor - 1) * 60_000).toISOString(), quality_gate_passed: 1,
});
// The store the timer-walk test serves: newest 500 on page one (truncated with next_cursor '0' when more exist); a
// since page serves the next 500 after the cursor ascending, truncated while more remain. failSince fails the since
// pages instead of the newest one (OMN-19998: the failed read is a Load more page here, not a poll).
function serve(runs: number, options: { failSince?: boolean } = {}) {
  const rows = Array.from({ length: runs }, (_, index) => runRow(index + 1));
  const urls: string[] = [];
  const sinces: string[] = [];
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
    sinces.push(since);
    if (options.failSince) return { ok: false, status: 503, json: async () => ({}) };
    const after = rows.filter(row => row.projection_cursor > Number(since));
    const page = after.slice(0, 500);
    return after.length > 500
      ? envelope(page, { truncated: true, next_cursor: String(page[page.length - 1]!.projection_cursor) })
      : envelope(page, { truncated: false, next_cursor: null });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { rows, urls, sinces };
}

const cursors = (rows: readonly { projection_cursor?: unknown }[]) => rows.map(row => row.projection_cursor);
const resultOf = (
  rows: unknown[],
  extra: Partial<ProjectionResult<DelegationDecisionRow>> = {},
): ProjectionResult<DelegationDecisionRow> => ({
  rows: rows as DelegationDecisionRow[],
  rowCount: rows.length,
  freshness: 'fresh',
  latestEventAt: null,
  isDegraded: false,
  degradedReason: null,
  failureReason: null,
  ...extra,
});

describe('OMN-19998: the first load reads one page and Load more reads one page per press', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  // T3a: the first-load walk returning — the unbounded read OMN-21970 introduced cost 201 requests on this store.
  it('T3a: a first read of a 120,896-run store makes exactly one request, no since, and returns the newest 500 truncated, incomplete', async () => {
    const { urls, sinces } = serve(120_896);
    const result = await fetchDelegationDecisions();
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]!, 'http://local').searchParams.has('since')).toBe(false);
    expect(sinces).toEqual([]);
    expect(result.rows).toHaveLength(500);
    expect(result.rowCount).toBe(500);
    expect(cursors(result.rows as never)[0]).toBe(120_896);
    expect(result.truncated).toBe(true);
    expect(result.nextCursor).toBe('0');
    expect(result.complete).toBe(false);
  });

  // T3b: one press reads exactly one page and folds it in by run. The union is computed from the store, not guessed:
  // the held newest 500 are runs 101-600, the since=0 page is runs 1-500, so one press holds every served run once.
  it('T3b: a 600-run store — the first read returns the newest 500 truncated, press one holds all 600 distinct, press two ends the walk', async () => {
    const { rows, urls, sinces } = serve(600);
    const first = await fetchDelegationDecisions();
    expect(urls).toHaveLength(1);
    expect(first.rows).toHaveLength(500);
    expect(first.truncated).toBe(true);
    expect(first.complete).toBe(false);
    const whole = new Set(rows.map(row => row.projection_cursor));
    const pressOne = await fetchMoreDelegationDecisions(first);
    expect(urls).toHaveLength(2);
    expect(sinces).toEqual(['0']);
    expect(pressOne.rows).toHaveLength(whole.size);
    expect(new Set(cursors(pressOne.rows as never)).size).toBe(whole.size);
    expect(cursors(pressOne.rows as never)[0]).toBe(600);
    expect(cursors(pressOne.rows as never)[599]).toBe(1);
    expect(pressOne.complete).toBe(false);
    expect(pressOne.truncated).toBe(true);
    expect(pressOne.nextCursor).toBe('500');
    const pressTwo = await fetchMoreDelegationDecisions(pressOne);
    expect(urls).toHaveLength(3);
    expect(sinces).toEqual(['0', '500']);
    expect(pressTwo.rows).toHaveLength(whole.size);
    expect(new Set(cursors(pressTwo.rows as never)).size).toBe(whole.size);
    expect(cursors(pressTwo.rows as never)[0]).toBe(600);
    expect(cursors(pressTwo.rows as never)[599]).toBe(1);
    expect(pressTwo.complete).toBe(true);
    expect(pressTwo.truncated).toBeUndefined();
    expect(pressTwo.nextCursor).toBeUndefined();
  });

  // T3c: a failed Load more page must not throw and must not replace the runs the viewer holds; a result that is not
  // truncated has nothing older to read, so a press on it sends nothing.
  it('T3c: a 503 since page returns held unchanged — the same object, nothing thrown', async () => {
    const { urls, sinces } = serve(600, { failSince: true });
    const held = await fetchDelegationDecisions();
    expect(held.truncated).toBe(true);
    const before = urls.length;
    const result = await fetchMoreDelegationDecisions(held);
    expect(urls.length - before).toBe(1);
    expect(sinces).toEqual(['0']);
    expect(result).toBe(held);
    expect(result.rows).toHaveLength(500);
    expect(result.truncated).toBe(true);
    expect(result.nextCursor).toBe('0');
  });

  it('T3c: a held result that is not truncated sends zero requests and returns held', async () => {
    const { urls } = serve(600);
    const held = resultOf(Array.from({ length: 3 }, (_, index) => runRow(3 - index)), { complete: true, truncated: false, nextCursor: null });
    const result = await fetchMoreDelegationDecisions(held);
    expect(urls).toHaveLength(0);
    expect(result).toBe(held);
    expect(result.complete).toBe(true);
  });

  // T3d: a walk press must never chase the cursor — ten presses, ten since requests, one each.
  it('T3d: ten presses on a 120,896-run store send exactly ten since requests, one each', async () => {
    const { urls, sinces } = serve(120_896);
    let held = await fetchDelegationDecisions();
    expect(urls).toHaveLength(1);
    for (let press = 0; press < 10; press += 1) {
      const before = urls.length;
      held = await fetchMoreDelegationDecisions(held);
      expect(urls.length - before).toBe(1);
    }
    expect(urls).toHaveLength(11);
    expect(sinces).toEqual(['0', '500', '1000', '1500', '2000', '2500', '3000', '3500', '4000', '4500']);
    expect(new Set(cursors(held.rows as never)).size).toBe(5_500);
    expect(cursors(held.rows as never)[0]).toBe(120_896);
    expect(held.rowCount).toBe(5_500);
    expect(held.truncated).toBe(true);
    expect(held.nextCursor).toBe('5000');
  });
});
