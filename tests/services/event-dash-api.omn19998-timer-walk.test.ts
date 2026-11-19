// OMN-24472: a page timer poll never walks the run history.
//
// fetchDelegationDecisions reads only the newest page, on the first load (OMN-19998: the first-load walk is gone) and on
// every later fetch, which passes the result the caller already holds and merges the newest page into it. Older runs
// are read by fetchMoreDelegationDecisions, one page per call. Failure modes, each with a test below:
//   T1  the unbounded walk itself: the measured 'before' first load, 201 requests for a 120,896-run store; now one
//   T2  a poll with a complete held result walking the run history again instead of reading one newest page
//   T3  a newest page behind a gap of unread runs reading as continuous with the held snapshot
//   T4  a failed newest page dropping the held history instead of surfacing it as stale
//   T5  a held result that cannot anchor a poll (zero rows, or degraded) polling as if history were held
//   T6  the newest-page merge losing runs, double-counting the overlap, or flipping a complete previous
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDelegationDecisions,
  fetchMoreDelegationDecisions,
  mergeNewestDecisionResults,
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
function serve(runs: number, options: { failNewest?: boolean } = {}) {
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
      if (options.failNewest) return { ok: false, status: 503, json: async () => ({}) };
      const newest = [...rows].reverse().slice(0, 500);
      return envelope(newest, rows.length > 500 ? { truncated: true, next_cursor: '0' } : { truncated: false, next_cursor: null });
    }
    sinces.push(since);
    const after = rows.filter(row => row.projection_cursor > Number(since));
    const page = after.slice(0, 500);
    return after.length > 500
      ? envelope(page, { truncated: true, next_cursor: String(page[page.length - 1]!.projection_cursor) })
      : envelope(page, { truncated: false, next_cursor: null });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { rows, urls, sinces };
}

/** The runs a viewer holds after pressing Load more until the walk ends (the held result the poll tests start from). */
async function heldAfterWalk(): Promise<ProjectionResult<DelegationDecisionRow>> {
  let held = await fetchDelegationDecisions();
  while (held.truncated === true) held = await fetchMoreDelegationDecisions(held);
  return held;
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

describe('OMN-24472: a page timer poll never walks the run history', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  // T1, the measured 'before': with nothing held the first load walked every page the exposure serves (201 requests for
  // this store). OMN-19998: it reads the newest page only.
  it('T1: a first read of a 120,896-run store with no held data makes exactly 1 request and no since-page', async () => {
    const { urls, sinces } = serve(120_896);
    const result = await fetchDelegationDecisions();
    expect(urls).toHaveLength(1);
    expect(sinces).toHaveLength(0);
    expect(result.rows).toHaveLength(500);
    expect(result.truncated).toBe(true);
    expect(result.complete).toBe(false);
  });

  // T2: a poll with a complete held result walking the run history again instead of reading one newest page.
  it('T2: held 1,200 complete runs, 20 new arrive — the poll makes one request with no since and returns 1,220 distinct rows, newest first, complete', async () => {
    const { rows, urls } = serve(1200);
    const held = await heldAfterWalk();
    expect(held.complete).toBe(true);
    const before = urls.length;
    rows.push(...Array.from({ length: 20 }, (_, index) => runRow(1201 + index)));
    const result = await fetchDelegationDecisions(held);
    expect(urls.length - before).toBe(1);
    expect(new URL(urls[before]!, 'http://local').searchParams.has('since')).toBe(false);
    expect(result.rows).toHaveLength(1220);
    expect(new Set(cursors(result.rows as never)).size).toBe(1220);
    expect(cursors(result.rows as never)[0]).toBe(1220);
    expect(result.complete).toBe(true);
  });

  // T3: a newest page behind a gap of unread runs reading as continuous with the held snapshot.
  it('T3: held 1,200 complete runs, 700 new arrive — the newest 500 share no run with held, so one request returns complete false and truncated true', async () => {
    const { rows, urls } = serve(1200);
    const held = await heldAfterWalk();
    const before = urls.length;
    rows.push(...Array.from({ length: 700 }, (_, index) => runRow(1201 + index)));
    const result = await fetchDelegationDecisions(held);
    expect(urls.length - before).toBe(1);
    expect(result.complete).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.nextCursor).toBe('0');
    expect(result.rows).toHaveLength(1700);
    expect(new Set(cursors(result.rows as never)).size).toBe(1700);
  });

  // T4: a failed newest page dropping the held history instead of surfacing it as stale.
  it('T4: a 503 on the newest page keeps all 1,200 held rows, reads stale, leaves complete unchanged, one request', async () => {
    const options: { failNewest?: boolean } = {};
    const { urls } = serve(1200, options);
    const held = await heldAfterWalk();
    expect(held.complete).toBe(true);
    const before = urls.length;
    options.failNewest = true;
    const result = await fetchDelegationDecisions(held);
    expect(urls.length - before).toBe(1);
    expect(result.rows).toHaveLength(1200);
    expect(new Set(cursors(result.rows as never)).size).toBe(1200);
    expect(result.freshness).toBe('stale');
    expect(result.complete).toBe(true);
  });

  // T5: a held result that cannot anchor a poll — zero rows, or a failed read — polls as if history were not held. It
  // falls back to the newest page alone (OMN-19998: no fetch walks the history), never to a walk.
  it('T5: an empty or failed held result reads the newest page alone (one request, no walk)', async () => {
    const emptyHeld: ProjectionResult<DelegationDecisionRow> = {
      rows: [], rowCount: 0, freshness: 'fresh', latestEventAt: null, isDegraded: false, degradedReason: null, failureReason: null,
    };
    const { urls } = serve(1200);
    const before = urls.length;
    await fetchDelegationDecisions(emptyHeld);
    expect(urls.length - before).toBe(1);

    const degraded = serve(1200);
    const full = await heldAfterWalk();
    const beforeDegraded = degraded.urls.length;
    const read = await fetchDelegationDecisions({ ...full, degradedReason: 'HTTP 503', failureReason: 'HTTP 503', isDegraded: true });
    expect(degraded.urls.length - beforeDegraded).toBe(1);
    expect(read.rows).toHaveLength(500);
  });

  // OMN-24616 AC6: a refused newest page keeps the held rows and says the poll failed, so no page reads it as a new read.
  it('T7: a refused newest page keeps the held rows and carries the poll\'s reason', () => {
    const held = resultOf(Array.from({ length: 3 }, (_, index) => runRow(3 - index)), { complete: true, truncated: false, nextCursor: null });
    const refused: ProjectionResult<DelegationDecisionRow> = {
      rows: [], rowCount: 0, freshness: 'unknown', latestEventAt: null, isDegraded: true, degradedReason: 'HTTP 503', failureReason: 'HTTP 503',
    };
    const merged = mergeNewestDecisionResults(held, refused);
    expect(merged.rows).toHaveLength(3);
    expect(merged.pollFailureReason).toBe('HTTP 503');
    expect(merged.failureReason ?? null).toBeNull();
  });

  // T6: the newest-page merge losing runs, double-counting the overlap, or flipping a complete previous.
  it('T6: held 600 complete + a newest page of 100 new runs with overlap merges to 700 distinct runs, newest first, complete', () => {
    const held = resultOf(Array.from({ length: 600 }, (_, index) => runRow(600 - index)), { complete: true, truncated: false, nextCursor: null });
    const newest = resultOf(Array.from({ length: 500 }, (_, index) => runRow(700 - index)), { truncated: true, nextCursor: '0' });
    const merged = mergeNewestDecisionResults(held, newest);
    expect(merged.rows).toHaveLength(700);
    expect(new Set(cursors(merged.rows as never)).size).toBe(700);
    expect(cursors(merged.rows as never)[0]).toBe(700);
    expect(cursors(merged.rows as never)[699]).toBe(1);
    expect(merged.rowCount).toBe(700);
    expect(merged.complete).toBe(true);
  });
});
