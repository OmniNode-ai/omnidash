// @vitest-environment jsdom
// OMN-19998: no dashboard page walks the run history — not on a first load, not on a timer poll, not on a Refresh.
// This is the page-level control of the change: on the code before it, a Runs page mount walked a 120,896-run store
// end to end and cost 201 decisions requests where a 600-run store cost 2. The harness is the poll test's
// (LocalDashboardPage.omn19998.poll.test.tsx): a mocked '@/data-source' whose recording createSnapshotSource serves the
// decisions exposure the walk-budget loader tests serve — a request with no `since` answers the newest 500 runs
// (truncated with next_cursor '0' when more exist), a `since` request answers the next 500 after that cursor.
import { act, render } from '@testing-library/react';
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
        const runId = params?.correlation_id;
        if (runId !== undefined) return snapshot(all.filter(row => row.correlation_id === runId));
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

import { loadLocalPageConfig } from '@/layout/local-page-loader';
import { LocalDashboardPage } from '@/pages/LocalDashboardPage';
import { requestLocalPageRefresh } from '@/services/local-page-refresh';

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

const decisionsCalls = () => harness.calls.filter(call => call.topic === DECISIONS);
const sinceCursors = () => decisionsCalls().flatMap(call => call.params?.since === undefined ? [] : [call.params.since]);

const PAGE_NAMES = ['overview', 'runs', 'workflow', 'usage'] as const;

/** Mount one page, let its first load settle, advance one 30 s timer cycle, then count every readSnapshot call. */
async function mountAndPollOnce(pageName: (typeof PAGE_NAMES)[number], runs: number) {
  harness.calls = [];
  harness.runs = runs;
  // Every exposure the page binds is served, so the count is the page's whole read, not the decisions read alone.
  harness.reachable = new Set(loadLocalPageConfig(pageName).components.flatMap(component =>
    (component.data_bindings ?? []).map(binding => binding.projection_topic)));
  const view = render(<LocalDashboardPage pageName={pageName} />);
  await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  await settle();
  const counted = {
    total: harness.calls.length,
    decisionPages: decisionsCalls().filter(call => call.params?.correlation_id === undefined).length,
    decisionPoints: decisionsCalls().flatMap(call => call.params?.correlation_id ?? []),
    sinces: sinceCursors(),
  };
  view.unmount();
  return counted;
}

describe('OMN-19998: no page load walks the run history', () => {
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

  for (const pageName of PAGE_NAMES) {
    it(`${pageName}: mount + one timer cycle send the same requests on a 600-run and a 120,896-run store`, async () => {
      const small = await mountAndPollOnce(pageName, 600);
      const large = await mountAndPollOnce(pageName, 120_896);
      console.log(`OMN-19998 ${pageName}: readSnapshot calls — 600-run store: ${small.total}, 120,896-run store: ${large.total} (decisions pages: ${small.decisionPages} and ${large.decisionPages})`);
      expect(large.total).toBe(small.total);
      expect(small.decisionPages).toBe(2);
      expect(large.decisionPages).toBe(2);
      expect(small.decisionPoints).toEqual(pageName === 'workflow' ? ['run-600', 'run-600'] : []);
      expect(large.decisionPoints).toEqual(pageName === 'workflow' ? ['run-120896', 'run-120896'] : []);
      expect(small.sinces).toEqual([]);
      expect(large.sinces).toEqual([]);
    });
  }

  it('the Runs page Refresh sends no since request on the 120,896-run store', async () => {
    harness.runs = 120_896;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    expect(sinceCursors()).toEqual([]);
    expect(decisionsCalls()).toHaveLength(1);
    await act(async () => { requestLocalPageRefresh(); await vi.advanceTimersByTimeAsync(0); });
    await settle();
    expect(sinceCursors()).toEqual([]);
    expect(decisionsCalls()).toHaveLength(2);
  });
});
