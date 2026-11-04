// OMN-21970 AC3: the Overview, Runs and Usage pages read every served run, not the newest 500.
//
// decisions.v1 answers a request without `since` with its newest 500 runs (a ranked page) and, when more exist, the
// origin of an ascending walk in next_cursor; each `since` page continues it. Failure modes, each with a test below:
//   W1  the loader stops at the first page, so a store of 600 runs shows 500
//   W2  the ranked first page overlaps the walk, so runs are counted twice (1,100 instead of 600)
//   W3  a server that repeats a cursor keeps the walk going for ever
//   W4  a walk page that fails is presented as complete, so missing runs read as none
//   W5  a store of 500 runs or fewer sends walk requests it does not need
import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot, ProtocolSnapshotSource } from '../data-source/protocol-snapshot-source';
import { DELEGATION_DECISIONS_TOPIC, loadLocalPageConfig, loadLocalPageSnapshots } from './local-page-loader';

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
  const answer = (pageRows: unknown[], extra: Partial<ProjectionSnapshot>): ProjectionSnapshot => ({
    rows: pageRows, rowCount: pageRows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-02T10:00:00Z', ...extra,
  });
  const source: ProtocolSnapshotSource = {
    async *readAll() { /* not used by the page loader */ },
    readSnapshot: async (topic, params) => {
      if (topic !== DELEGATION_DECISIONS_TOPIC) return answer([], {});
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
  return { source, sinces };
}

async function decisionsFrom(source: ProtocolSnapshotSource) {
  const snapshots = await loadLocalPageSnapshots(page, source, {
    mode: 'http', availableTopics: new Set([DELEGATION_DECISIONS_TOPIC]),
  });
  return snapshots.find(snapshot => snapshot.topic === DELEGATION_DECISIONS_TOPIC)!;
}

const cursors = (rows: readonly unknown[]) => rows.map(row => (row as { projection_cursor: number }).projection_cursor);

describe('OMN-21970 AC3: the decisions read walks every page', () => {
  it('W1, W2: 600 served runs read as exactly 600 distinct runs, newest first, and complete', async () => {
    const { source, sinces } = store(600);
    const decisions = await decisionsFrom(source);
    expect(decisions.failure).toBeUndefined();
    expect(decisions.rows).toHaveLength(600);
    expect(new Set(cursors(decisions.rows)).size).toBe(600);
    expect(cursors(decisions.rows)[0]).toBe(600);
    expect(cursors(decisions.rows)[599]).toBe(1);
    expect(decisions.rowCount).toBe(600);
    expect(decisions.truncated).toBeFalsy();
    expect(sinces).toEqual(['0', '500']);
  });

  it('W1: a store four pages deep (1,955 runs, the measured local store) reads every run', async () => {
    const decisions = await decisionsFrom(store(1955).source);
    expect(new Set(cursors(decisions.rows)).size).toBe(1955);
    expect(decisions.rows).toHaveLength(1955);
    expect(decisions.truncated).toBeFalsy();
  });

  it('W3: a cursor that does not move ends the walk and the read stays marked incomplete', async () => {
    const decisions = await decisionsFrom(store(600, { stuck: true }).source);
    expect(decisions.truncated).toBe(true);
    expect(new Set(cursors(decisions.rows)).size).toBe(decisions.rows.length);
  });

  it('W4: a failed walk page keeps the runs already read and marks the read incomplete', async () => {
    const decisions = await decisionsFrom(store(1200, { failSince: '500' }).source);
    expect(decisions.failure).toBeUndefined();
    expect(decisions.truncated).toBe(true);
    expect(decisions.rows.length).toBeGreaterThanOrEqual(500);
    expect(decisions.rows.length).toBeLessThan(1200);
    expect(new Set(cursors(decisions.rows)).size).toBe(decisions.rows.length);
  });

  it('W5: 500 runs or fewer is one read, with no walk', async () => {
    const { source, sinces } = store(500);
    const decisions = await decisionsFrom(source);
    expect(decisions.rows).toHaveLength(500);
    expect(decisions.truncated).toBeFalsy();
    expect(sinces).toEqual([]);
  });
});
