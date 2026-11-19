// @vitest-environment jsdom
// OMN-19998: the Runs page's Load more control. No load walks the decisions run history; a truncated snapshot names
// where its read stopped, and each press of the control reads exactly one older since-page (loadMoreDecisions),
// folding it into the held rows. The control is present only while the held snapshot is truncated; a failed press
// keeps the held rows and shows its message; a timer poll after a press reads no since-page and keeps the rows.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';

const harness = vi.hoisted(() => ({
  /** Every readSnapshot call, as (topic, params). */
  calls: [] as Array<{ topic: string; params: Record<string, string> | undefined }>,
  reachable: new Set<string>(),
  runs: 0,
  /** When set, the next since-page read of the decisions topic throws this message. */
  failSince: null as string | null,
}));

vi.mock('@/data-source', () => {
  // The read node's decisions.v1, as tests/layout/local-page-loader.omn19998-walk-budget.test.ts serves it: a request
  // with no `since` answers the newest 500 runs (truncated with next_cursor '0' when more exist); a `since` request
  // answers the next 500 after that cursor, truncated while more remain. Every other topic answers no rows.
  const BASE = Date.parse('2026-10-02T00:00:00Z');
  const rowsByCount = new Map<number, Array<Record<string, unknown>>>();
  const rows = (count: number) => {
    let built = rowsByCount.get(count);
    if (built === undefined) {
      built = Array.from({ length: count }, (_, index) => ({
        projection_cursor: index + 1,
        correlation_id: `run-${index + 1}`,
        written_at: new Date(BASE + index * 30 * 60_000).toISOString(),
        quality_gate_passed: true,
        terminal_ok: true,
        quality_gate_detail: 'completed',
        model_name: 'Qwen3.8-27B',
        latency_ms: 813,
        tokens_input: 162,
        tokens_output: 52,
        task_type: 'summarization',
        cost_tier_name: 'local',
      }));
      rowsByCount.set(count, built);
    }
    return built;
  };
  const snapshot = (pageRows: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({
    rows: pageRows, rowCount: pageRows.length, dataFreshness: 'fresh' as const, latestEventAt: null,
    readAt: new Date().toISOString(), ...extra,
  });
  return {
    createSnapshotSource: () => ({
      // A fresh object per call, as the real factory returns.
      async *readAll() { yield []; },
      readSnapshot: async (topic: string, params?: Record<string, string>) => {
        harness.calls.push({ topic, params: params === undefined ? undefined : { ...params } });
        if (topic !== DECISIONS) return snapshot([]);
        const all = rows(harness.runs);
        const since = params?.since;
        if (since === undefined) {
          const newest = [...all].reverse().slice(0, 500);
          return snapshot(newest, harness.runs > 500 ? { truncated: true, nextCursor: '0' } : {});
        }
        if (harness.failSince !== null) {
          const message = harness.failSince;
          harness.failSince = null;
          throw new Error(message);
        }
        const after = all.filter(row => Number(row.projection_cursor) > Number(since));
        const walked = after.slice(0, 500);
        return after.length > 500
          ? snapshot(walked, { truncated: true, nextCursor: String(Number(walked[walked.length - 1]!.projection_cursor)) })
          : snapshot(walked, { nextCursor: null });
      },
    }),
  };
});
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({
    rows: [...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' })),
  }),
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

const decisionsCalls = () => harness.calls.filter(call => call.topic === DECISIONS);
const sinceCursors = () => decisionsCalls().flatMap(call => call.params?.since === undefined ? [] : [call.params.since]);

async function pressLoadMore() {
  await act(async () => {
    screen.getByRole('button', { name: 'Load more runs' }).click();
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('OMN-19998: the Runs page reads older runs one page per press', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:12:00Z'));
    // OMN-21166 part 19 AC136 keeps the Overview window in the address, which jsdom carries from test to test.
    window.history.replaceState(null, '', '/');
    harness.calls = [];
    harness.reachable = new Set([DECISIONS]);
    harness.runs = 0;
    harness.failSince = null;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('a 1,300-run store: the mount reads one page, and each press reads one more older page until the walk ends', async () => {
    harness.runs = 1_300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    // The mount reads exactly one decisions request (no since) and the control is present: the held snapshot is
    // truncated, so the viewer can read older rows, one page per press.
    expect(decisionsCalls()).toHaveLength(1);
    expect(sinceCursors()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Load more runs' })).toBeInTheDocument();

    // One press reads the earliest unread page of history (since '0'), folding its 500 rows into the held snapshot.
    await pressLoadMore();
    expect(decisionsCalls()).toHaveLength(2);
    expect(sinceCursors()).toEqual(['0']);

    // A second press reads the next older page (since '500').
    await pressLoadMore();
    expect(decisionsCalls()).toHaveLength(3);
    expect(sinceCursors()).toEqual(['0', '500']);

    // A third press reads the last page (since '1000'); the walk ends, the snapshot is no longer truncated, and the
    // control is gone.
    await pressLoadMore();
    expect(decisionsCalls()).toHaveLength(4);
    expect(sinceCursors()).toEqual(['0', '500', '1000']);
    expect(screen.queryByRole('button', { name: 'Load more runs' })).not.toBeInTheDocument();
  });

  it('a timer tick after a press reads no since-page and keeps the rows the press added', async () => {
    harness.runs = 1_300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    await pressLoadMore();
    expect(decisionsCalls()).toHaveLength(2);
    expect(sinceCursors()).toEqual(['0']);
    // The timer poll passes the held snapshot as previous (decisionsWalkFor), so it re-reads only the newest page and
    // merges it into the rows the press added: no since-page request, and the table keeps the 1,000 runs read so far.
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await settle();
    expect(sinceCursors()).toEqual(['0']);
    expect(decisionsCalls()).toHaveLength(3);
    // OMN-19998: the timer poll re-reads the newest page and merges it into the rows the press added, so the table
    // keeps the 1,000 runs read so far (the pager's count is the held snapshot's row count, not the store's).
    expect(screen.getByText(/^Runs 1–25 of 1K$/)).toBeInTheDocument();
  });

  it('a 300-run store is not truncated: the control is absent', async () => {
    harness.runs = 300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    expect(decisionsCalls()).toHaveLength(1);
    expect(sinceCursors()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Load more runs' })).not.toBeInTheDocument();
  });

  it('a failed press keeps the held rows and shows its message in an alert', async () => {
    harness.runs = 1_300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    harness.failSince = 'the since read was refused';
    await pressLoadMore();
    // The failed press sent one since request; the held rows are kept and the failure is announced.
    expect(sinceCursors()).toEqual(['0']);
    expect(screen.getByText(/^Runs 1–25 of 500$/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('the since read was refused');
  });
});
