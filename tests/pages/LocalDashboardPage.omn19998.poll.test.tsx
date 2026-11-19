// @vitest-environment jsdom
// OMN-19998: a page's timer poll must never walk the run history (the decisions exposure's since-pages). The dev
// runtime was loaded by ~180 requests a minute from the Overview page walking a 120,896-run store every 30 s poll;
// decisionsWalkFor (src/contracts/local-read-budget.ts) now bounds every load by its trigger. These tests hold the page
// to that budget through its own timer, Refresh and first load, with the store the walk-budget loader tests serve.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';

const harness = vi.hoisted(() => ({
  /** Every readSnapshot call, as (topic, params). */
  calls: [] as Array<{ topic: string; params: Record<string, string> | undefined }>,
  reachable: new Set<string>(),
  runs: 0,
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
        execution_ms: 813,
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
import { requestLocalPageRefresh } from '@/services/local-page-refresh';

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

const decisionsCalls = () => harness.calls.filter(call => call.topic === DECISIONS);
const sinceCursors = () => decisionsCalls().flatMap(call => call.params?.since === undefined ? [] : [call.params.since]);

describe('OMN-19998: a page timer poll never walks the run history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:12:00Z'));
    // OMN-21166 part 19 AC136 keeps the Overview window in the address, which jsdom carries from test to test.
    window.history.replaceState(null, '', '/');
    harness.calls = [];
    harness.reachable = new Set([DECISIONS]);
    harness.runs = 0;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('a 7-day Overview render and its next two timer polls send no since-page request', async () => {
    window.history.replaceState(null, '', '/overview?window=7d');
    harness.runs = 120_896;
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    // One load each: the mount and two timer polls, and no load of the Overview reads past the newest page. Before
    // the budget, each of these three loads walked 200 since-pages of this 120,896-run store.
    expect(sinceCursors()).toHaveLength(0);
    expect(decisionsCalls()).toHaveLength(3);
  });

  it('the Runs page reads only the newest page on first load, and a timer poll reads no more', async () => {
    harness.runs = 1_300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    // OMN-19998: no load walks the run history any more — the mount reads exactly one newest page (500 of this
    // 1,300-run store, marked truncated), where it used to walk since-pages '0', '500' and '1000' to the whole store.
    // The older runs are the viewer's to read, one page per press (LocalDashboardPage.omn19998.load-more.test.tsx).
    expect(sinceCursors()).toEqual([]);
    expect(decisionsCalls()).toHaveLength(1);
    expect(screen.getByText(/^Runs 1–25 of 500$/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    // The timer poll reads only the newest page and merges it into the held snapshot: no since-page request, and the
    // table keeps the 500 runs the mount read.
    expect(sinceCursors()).toEqual([]);
    expect(decisionsCalls()).toHaveLength(2);
    expect(screen.getByText(/^Runs 1–25 of 500$/)).toBeInTheDocument();
  });

  it('the Runs page Refresh button reads the newest page again, not the history', async () => {
    harness.runs = 1_300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    await act(async () => { requestLocalPageRefresh(); await vi.advanceTimersByTimeAsync(0); });
    await settle();
    // OMN-19998: a Refresh is bounded like every load (decisionsWalkFor passes the held snapshot as previous), so it
    // re-reads the newest page and merges it into the rows the page holds; it no longer walks the history again.
    expect(sinceCursors()).toEqual([]);
    expect(decisionsCalls()).toHaveLength(2);
    expect(screen.getByText(/^Runs 1–25 of 500$/)).toBeInTheDocument();
  });

  it('a read of 400 runs is the whole store: the Overview strip states the median run time (control for the next test)', async () => {
    harness.runs = 400;
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    expect(sinceCursors()).toHaveLength(0);
    expect(screen.getByText(/^Median run /)).toBeInTheDocument();
  });

  it('a 2,000-run store read as its newest 500 draws no median run time: the figure covers a window the read does not', async () => {
    harness.runs = 2_000;
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    expect(sinceCursors()).toHaveLength(0);
    expect(screen.queryByText(/^Median run /)).not.toBeInTheDocument();
  });
});
