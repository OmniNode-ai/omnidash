// OMN-19998: a page's timer poll must never walk the run history.
//
// decisions.v1 answers a request without `since` with its newest 500 runs and, when more exist, next_cursor; every
// poll used to read every following page (up to DECISIONS_WALK_MAX_PAGES = 200 since requests), so a store of
// 120,896 runs cost 201 decisions requests per 30 s poll and loaded the dev runtime. Failure modes, each with a
// test below:
//   B1  the unbounded walk itself: 201 requests a poll; decisionsWalk maxPages 0 reads one request and stays truncated
//   B2  maxPages 0 mis-marking a store that fits one page
//   B3  the newest-page merge losing runs, double-counting the overlap, or flipping a complete previous
//   B4  a newest page behind a gap of unread runs reading as continuous with the previous snapshot
//   B5  a failed newest page being merged away instead of surfaced
//   B6  a row without a run key merging into a wrong result
//   B7  a timer poll with a previous snapshot failing to converge to the whole store in one request
import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot, ProtocolSnapshotSource } from '../data-source/protocol-snapshot-source';
import type { BoundProjectionSnapshot, LocalPageLoadOptions } from './local-page-loader';
import { DELEGATION_DECISIONS_TOPIC, loadLocalPageConfig, loadLocalPageSnapshots, mergeNewestDecisions } from './local-page-loader';

const BASE = Date.parse('2026-10-14T00:00:00Z');
const page = loadLocalPageConfig('overview');

function store(runs: number, options: { failSince?: string; stuck?: boolean } = {}) {
  const rows = Array.from({ length: runs }, (_, index) => ({
    projection_cursor: index + 1,
    correlation_id: `run-${index + 1}`,
    written_at: new Date(BASE + index * 30 * 60_000).toISOString(),
    quality_gate_passed: 1,
    terminal_ok: 1,
  }));
  const sinces: string[] = [];
  let decisionsRequests = 0;
  const answer = (pageRows: unknown[], extra: Partial<ProjectionSnapshot>): ProjectionSnapshot => ({
    rows: pageRows, rowCount: pageRows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-02T10:00:00Z', ...extra,
  });
  const source: ProtocolSnapshotSource = {
    async *readAll() { /* not used by the page loader */ },
    readSnapshot: async (topic, params) => {
      if (topic !== DELEGATION_DECISIONS_TOPIC) return answer([], {});
      decisionsRequests += 1;
      const since = params?.since;
      if (since === undefined) {
        const newest = [...rows].reverse().slice(0, 500);
        return answer(newest, runs > 500 ? { truncated: true, nextCursor: '0' } : {});
      }
      sinces.push(since);
      if (since === options.failSince) throw new Error(`Projection ${topic} failed: HTTP 503 Service Unavailable`);
      if (options.stuck) return answer(rows.slice(0, 500), { truncated: true, nextCursor: since });
      const after = rows.filter(row => row.projection_cursor > Number(since));
      const walked = after.slice(0, 500);
      return after.length > 500
        ? answer(walked, { truncated: true, nextCursor: String(walked[walked.length - 1]!.projection_cursor) })
        : answer(walked, { nextCursor: null });
    },
  };
  return { source, sinces, decisionsRequests: () => decisionsRequests };
}

async function decisionsFrom(source: ProtocolSnapshotSource, decisionsWalk?: LocalPageLoadOptions['decisionsWalk']) {
  const snapshots = await loadLocalPageSnapshots(page, source, {
    mode: 'http',
    availableTopics: new Set([DELEGATION_DECISIONS_TOPIC]),
    ...(decisionsWalk === undefined ? {} : { decisionsWalk }),
  });
  return snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC)!;
}

const runRow = (cursor: number) => ({
  projection_cursor: cursor,
  correlation_id: `run-${cursor}`,
  written_at: new Date(BASE + (cursor - 1) * 30 * 60_000).toISOString(),
});

const decisionsSnapshot = (rows: unknown[], extra: Partial<BoundProjectionSnapshot> = {}): BoundProjectionSnapshot => ({
  topic: DELEGATION_DECISIONS_TOPIC,
  rows,
  rowCount: rows.length,
  dataFreshness: 'fresh',
  latestEventAt: null,
  readAt: '2026-11-14T00:00:00Z',
  ...extra,
});

const completeSnapshot = (runs: number) =>
  decisionsSnapshot(Array.from({ length: runs }, (_, index) => runRow(runs - index)));

const cursors = (rows: readonly unknown[]) => rows.map(row => (row as { projection_cursor: number }).projection_cursor);

describe('OMN-19998: a page timer poll never walks the run history', () => {
  it('B1: the unbounded walk reads a 120,896-run store with 201 decisions requests every poll; maxPages 0 costs one request and stays truncated at the newest 500', async () => {
    const bounded = store(120_896);
    const decisions = await decisionsFrom(bounded.source, { maxPages: 0 });
    expect(bounded.decisionsRequests()).toBe(1);
    expect(bounded.sinces).toEqual([]);
    expect(decisions.failure).toBeUndefined();
    expect(decisions.rows).toHaveLength(500);
    expect(new Set(cursors(decisions.rows)).size).toBe(500);
    expect(decisions.truncated).toBe(true);

    const unbounded = store(120_896);
    const walked = await decisionsFrom(unbounded.source);
    expect(unbounded.decisionsRequests()).toBe(201);
    expect(unbounded.sinces).toHaveLength(200);
    expect(walked.truncated).toBe(true);
  });

  it('B2: maxPages 0 on a store that fits one page is one request and the read stays complete', async () => {
    const { source, sinces, decisionsRequests } = store(400);
    const decisions = await decisionsFrom(source, { maxPages: 0 });
    expect(decisionsRequests()).toBe(1);
    expect(sinces).toEqual([]);
    expect(decisions.rows).toHaveLength(400);
    expect(decisions.truncated).toBeFalsy();
    expect('truncated' in decisions).toBe(false);
    expect('nextCursor' in decisions).toBe(false);
  });

  it('B3: merging the newest page into a complete previous keeps every run once, newest first, and stays complete', () => {
    const previous = completeSnapshot(600);
    const newest = decisionsSnapshot([
      ...Array.from({ length: 100 }, (_, index) => runRow(700 - index)),
      ...Array.from({ length: 500 }, (_, index) => runRow(600 - index)),
    ]);
    const merged = mergeNewestDecisions(previous, newest);
    expect(merged.failure).toBeUndefined();
    expect(merged.rows).toHaveLength(700);
    expect(new Set(cursors(merged.rows)).size).toBe(700);
    expect(cursors(merged.rows)[0]).toBe(700);
    expect(cursors(merged.rows)[699]).toBe(1);
    expect(merged.truncated).toBeFalsy();
    expect('truncated' in merged).toBe(false);
    expect('nextCursor' in merged).toBe(false);
  });

  it('B4: a newest page sharing no run key with the previous snapshot sits behind a gap: the merge stays truncated at the newest cursor', () => {
    const previous = completeSnapshot(600);
    const newest = decisionsSnapshot(
      Array.from({ length: 500 }, (_, index) => runRow(1500 - index)),
      { truncated: true, nextCursor: '0' },
    );
    const merged = mergeNewestDecisions(previous, newest);
    expect(merged.truncated).toBe(true);
    expect(merged.nextCursor).toBe('0');
    expect(new Set(cursors(merged.rows)).size).toBe(1100);
  });

  it('B5: a failed newest page is returned unchanged, not merged', () => {
    const newest = decisionsSnapshot([runRow(601)], { failure: { kind: 'error', message: 'x' } });
    const merged = mergeNewestDecisions(completeSnapshot(600), newest);
    expect(merged).toBe(newest);
  });

  it('B6: a previous row without a run key returns the newest page unchanged', () => {
    const previous = decisionsSnapshot([{}, runRow(599)]);
    const newest = decisionsSnapshot([runRow(601)]);
    const merged = mergeNewestDecisions(previous, newest);
    expect(merged).toBe(newest);
  });

  it('B7: a timer poll with maxPages 0 and a complete previous converges to the whole store in one request', async () => {
    const { source, sinces, decisionsRequests } = store(700);
    const decisions = await decisionsFrom(source, { maxPages: 0, previous: completeSnapshot(600) });
    expect(decisionsRequests()).toBe(1);
    expect(sinces).toEqual([]);
    expect(decisions.rows).toHaveLength(700);
    expect(new Set(cursors(decisions.rows)).size).toBe(700);
    expect(cursors(decisions.rows)[0]).toBe(700);
    expect(decisions.truncated).toBeFalsy();
    expect('truncated' in decisions).toBe(false);
  });
});
