// OMN-19998: no dashboard page walks the run history — not on a first load, not on a Refresh, not on a timer poll —
// and the older runs a page does not hold are read only one page per Load more press (loadMoreDecisions).
// Failure modes, each with a test below:
//   P1  the Runs page on mount or Refresh getting decisionsWalkFor's undefined, the loader's full 200-page walk:
//       a 120,896-run store cost 201 decisions requests where the same load on a 600-run store cost 2
//   P2  loadMoreDecisions walking: one press must send exactly one since request, never chase the cursor
//   P3  loadMoreDecisions losing runs, duplicating the overlap, or sorting anything but newest first
//   P4  a failed or stuck Load more page replacing the runs the viewer already holds
//   P5  a Load more press on a snapshot that is not truncated sending requests it does not need
import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot, ProtocolSnapshotSource } from '@/data-source/protocol-snapshot-source';
import type { BoundProjectionSnapshot, LocalPageDocument } from '@/layout/local-page-loader';
import { DELEGATION_DECISIONS_TOPIC, loadLocalPageConfig, loadLocalPageSnapshots, loadMoreDecisions } from '@/layout/local-page-loader';
import { decisionsWalkFor, type LocalLoadTrigger } from '@/contracts/local-read-budget';

const BASE = Date.parse('2026-10-14T00:00:00Z');
const PAGE_NAMES = ['overview', 'runs', 'workflow', 'usage', 'status', 'pricing', 'credentials', 'api-keys'] as const;
const TRIGGERS = ['mount', 'manual', 'timer'] as const;

/** The store() of tests/layout/local-page-loader.omn19998-walk-budget.test.ts, counting every readSnapshot call. */
function store(runs: number, options: { failSince?: string; stuck?: boolean } = {}) {
  const rows = Array.from({ length: runs }, (_, index) => ({
    projection_cursor: index + 1,
    correlation_id: `run-${index + 1}`,
    written_at: new Date(BASE + index * 30 * 60_000).toISOString(),
    quality_gate_passed: 1,
    terminal_ok: 1,
  }));
  const sinces: string[] = [];
  const decisionPointReads: string[] = [];
  let requests = 0;
  let decisionPageRequests = 0;
  const answer = (pageRows: unknown[], extra: Partial<ProjectionSnapshot>): ProjectionSnapshot => ({
    rows: pageRows, rowCount: pageRows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-02T10:00:00Z', ...extra,
  });
  const source: ProtocolSnapshotSource = {
    async *readAll() { /* not used by the page loader */ },
    readSnapshot: async (topic, params) => {
      requests += 1;
      if (topic !== DELEGATION_DECISIONS_TOPIC) return answer([], {});
      const runId = params?.correlation_id;
      if (runId !== undefined) {
        decisionPointReads.push(runId);
        return answer(rows.filter(row => row.correlation_id === runId), {});
      }
      decisionPageRequests += 1;
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
  return { source, sinces, requests: () => requests, decisionPageRequests: () => decisionPageRequests, decisionPointReads };
}

const topicsBound = (page: LocalPageDocument) =>
  new Set(page.components.flatMap(component => (component.data_bindings ?? []).map(binding => binding.projection_topic)));

async function loadPage(pageName: (typeof PAGE_NAMES)[number], trigger: LocalLoadTrigger, runs: number) {
  const page = loadLocalPageConfig(pageName);
  const source = store(runs);
  await loadLocalPageSnapshots(page, source.source, {
    mode: 'http',
    availableTopics: topicsBound(page),
    decisionsWalk: decisionsWalkFor(pageName, trigger, undefined),
  });
  return source;
}

const cursors = (rows: readonly unknown[]) => rows.map(row => (row as { projection_cursor: number }).projection_cursor);

const runRow = (cursor: number) => ({
  projection_cursor: cursor,
  correlation_id: `run-${cursor}`,
  written_at: new Date(BASE + (cursor - 1) * 30 * 60_000).toISOString(),
});

const heldSnapshot = (rows: unknown[], extra: Partial<BoundProjectionSnapshot> = {}): BoundProjectionSnapshot => ({
  topic: DELEGATION_DECISIONS_TOPIC,
  rows,
  rowCount: rows.length,
  dataFreshness: 'fresh',
  latestEventAt: null,
  readAt: '2026-11-14T00:00:00Z',
  ...extra,
});

/** The newest page of a bounded page load: what the viewer's page holds before its first Load more press. */
async function newestPageOf(runs: number, options: { failSince?: string; stuck?: boolean } = {}) {
  const page = loadLocalPageConfig('overview');
  const source = store(runs, options);
  const snapshots = await loadLocalPageSnapshots(page, source.source, {
    mode: 'http',
    availableTopics: new Set([DELEGATION_DECISIONS_TOPIC, ...topicsBound(page)]),
    decisionsWalk: { maxPages: 0 },
  });
  const held = snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC)!;
  return { held, source };
}

describe('OMN-19998: no page load walks the run history', () => {
  // P1: the Runs page on mount or Refresh getting decisionsWalkFor's undefined, the loader's full 200-page walk.
  for (const pageName of PAGE_NAMES) {
    for (const trigger of TRIGGERS) {
      it(`${pageName} on ${trigger} sends the same requests for a 600-run and a 120,896-run store, at most one decisions page`, async () => {
        const small = await loadPage(pageName, trigger, 600);
        const large = await loadPage(pageName, trigger, 120_896);
        expect(small.requests()).toBe(large.requests());
        expect(small.decisionPageRequests()).toBeLessThanOrEqual(1);
        expect(large.decisionPageRequests()).toBeLessThanOrEqual(1);
        expect(small.decisionPointReads).toEqual(pageName === 'workflow' ? ['run-600'] : []);
        expect(large.decisionPointReads).toEqual(pageName === 'workflow' ? ['run-120896'] : []);
        expect(small.sinces).toEqual([]);
        expect(large.sinces).toEqual([]);
      });
    }
  }
});

describe('OMN-19998: loadMoreDecisions reads one page per press', () => {
  // P2: loadMoreDecisions walking — one press must send exactly one since request, never chase the cursor.
  it('P2, P3: ten presses on a 120,896-run store send one request each and hold 5,500 distinct runs, newest first', async () => {
    const { held, source } = await newestPageOf(120_896);
    expect(held.rows).toHaveLength(500);
    expect(held.truncated).toBe(true);
    expect(held.nextCursor).toBe('0');
    let more = held;
    for (let press = 0; press < 10; press += 1) {
      const before = source.requests();
      const result = await loadMoreDecisions(source.source, more);
      expect(result.failure).toBeUndefined();
      expect(source.requests() - before).toBe(1);
      more = result.snapshot;
    }
    expect(source.sinces).toEqual(['0', '500', '1000', '1500', '2000', '2500', '3000', '3500', '4000', '4500']);
    expect(more.rows).toHaveLength(5_500);
    expect(new Set(cursors(more.rows)).size).toBe(5_500);
    expect(cursors(more.rows)[0]).toBe(120_896);
    expect(cursors(more.rows)[499]).toBe(120_397);
    expect(cursors(more.rows)[5_499]).toBe(1);
    expect(more.rowCount).toBe(5_500);
    expect(more.truncated).toBe(true);
    expect(more.nextCursor).toBe('5000');
  });

  // P3: a page that is not truncated ends the walk: no truncated, no nextCursor on the result. A 600-run store holds the
  // newest 500 on page one; press one reads runs 1-500 (still truncated), press two reads the last 100 and ends it.
  it('P3: the second press on a 600-run store ends the walk — 600 distinct runs, no truncated, no nextCursor', async () => {
    const { held, source } = await newestPageOf(600);
    const first = await loadMoreDecisions(source.source, held);
    expect(first.failure).toBeUndefined();
    expect(first.snapshot.truncated).toBe(true);
    expect(first.snapshot.nextCursor).toBe('500');
    const result = await loadMoreDecisions(source.source, first.snapshot);
    expect(result.failure).toBeUndefined();
    expect(source.sinces).toEqual(['0', '500']);
    expect(result.snapshot.rows).toHaveLength(600);
    expect(new Set(cursors(result.snapshot.rows)).size).toBe(600);
    expect(cursors(result.snapshot.rows)[0]).toBe(600);
    expect(cursors(result.snapshot.rows)[599]).toBe(1);
    expect(result.snapshot.rowCount).toBe(600);
    expect('truncated' in result.snapshot).toBe(false);
    expect('nextCursor' in result.snapshot).toBe(false);
  });

  // P4: a failed or stuck Load more page replacing the runs the viewer already holds.
  it('P4: a failed page returns held unchanged, the same object, with a typed failure', async () => {
    const { held, source } = await newestPageOf(120_896, { failSince: '0' });
    const result = await loadMoreDecisions(source.source, held);
    expect(result.snapshot).toBe(held);
    expect(result.failure?.kind).toBe('error');
    expect(result.failure?.message).toContain('HTTP 503');
    expect(held.rows).toHaveLength(500);
  });

  it('P4: a page whose nextCursor equals the cursor sent is stuck: held unchanged with a failure, held not advanced', async () => {
    const { held, source } = await newestPageOf(600, { stuck: true });
    const result = await loadMoreDecisions(source.source, held);
    expect(result.snapshot).toBe(held);
    expect(result.failure?.kind).toBe('error');
    expect(held.truncated).toBe(true);
    expect(held.nextCursor).toBe('0');
  });

  // P5: a Load more press on a snapshot that is not truncated sending requests it does not need.
  it('P5: a held snapshot that is not truncated sends zero requests and returns held', async () => {
    const held = heldSnapshot([runRow(3), runRow(2), runRow(1)]);
    const source = store(400);
    const result = await loadMoreDecisions(source.source, held);
    expect(source.requests()).toBe(0);
    expect(result.snapshot).toBe(held);
    expect(result.failure).toBeUndefined();
  });
});
