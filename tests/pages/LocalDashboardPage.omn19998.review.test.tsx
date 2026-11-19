// @vitest-environment jsdom
// OMN-24473: the review of the page timer budget found two gaps in how a timer poll keeps the Runs page's history.
// Failure modes, each with a test below:
//   R1  after one failed poll the held snapshot carries failure and lastGoodAt, and decisionsWalkFor dropped previous
//   R2  that drop made the Runs page fall from the runs it holds to the newest 500 runs until Refresh
//   R3  a timer tick superseded an in-flight read, so a read slower than the tick was never shown
// OMN-19998: no load walks the history any more, so the rows the page holds are the ones a Load more press read; R2 and R3
// hold the press's rows through a failed poll and through a press slower than the tick.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decisionsWalkFor } from '@/contracts/local-read-budget';
import type { BoundProjectionSnapshot } from '@/layout/local-page-loader';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';

const harness = vi.hoisted(() => ({
  calls: [] as Array<{ topic: string; params: Record<string, string> | undefined }>,
  reachable: new Set<string>(),
  runs: 0,
  /** Milliseconds each since-page read takes to answer (a slow walk); 0 answers at once. */
  pageDelayMs: 0,
  failNewest: false,
}));

vi.mock('@/data-source', () => {
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
      async *readAll() { yield []; },
      readSnapshot: async (topic: string, params?: Record<string, string>) => {
        harness.calls.push({ topic, params: params === undefined ? undefined : { ...params } });
        if (topic !== DECISIONS) return snapshot([]);
        const all = rows(harness.runs);
        const since = params?.since;
        if (since === undefined) {
          if (harness.failNewest) return snapshot([], { failure: { kind: 'error', message: 'newest read failed' } });
          const newest = [...all].reverse().slice(0, 500);
          return snapshot(newest, harness.runs > 500 ? { truncated: true, nextCursor: '0' } : {});
        }
        if (harness.pageDelayMs > 0) await new Promise<void>(resolve => setTimeout(resolve, harness.pageDelayMs));
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

describe('OMN-24473: a timer poll keeps the Runs page history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:12:00Z'));
    window.history.replaceState(null, '', '/');
    harness.calls = [];
    harness.reachable = new Set([DECISIONS]);
    harness.runs = 0;
    harness.pageDelayMs = 0;
    harness.failNewest = false;
  });
  afterEach(() => { vi.useRealTimers(); });

  const held = (extra: Partial<BoundProjectionSnapshot>): BoundProjectionSnapshot => ({
    topic: DECISIONS, rows: [{ projection_cursor: 1 }, { projection_cursor: 2 }, { projection_cursor: 3 }], rowCount: 3,
    dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-14T00:00:00Z', ...extra,
  });

  // R1: a snapshot a failed poll left (failure and lastGoodAt set) dropping previous, so the next poll read 500 runs.
  it('R1: a failed poll that kept its last good rows still passes them as previous, without the failure marks', () => {
    const failed = held({ failure: { kind: 'error', message: 'x' }, lastGoodAt: '2026-11-14T00:00:00Z' });
    const walk = decisionsWalkFor('runs', 'timer', failed);
    expect(walk?.maxPages).toBe(0);
    expect(walk?.previous?.rows).toHaveLength(3);
    expect(walk?.previous).not.toHaveProperty('failure');
    expect(walk?.previous).not.toHaveProperty('lastGoodAt');
    expect(decisionsWalkFor('runs', 'timer', held({ failure: { kind: 'error', message: 'x' } }))).toEqual({ maxPages: 0 });
    expect(decisionsWalkFor('runs', 'timer', held({}))?.previous?.rows).toHaveLength(3);
  });

  const pressLoadMore = async () => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load more runs' })); await vi.advanceTimersByTimeAsync(0); });
  };
  // One press folds one 500-run page into the 500 the mount read: 1,000 runs, which the pager writes as 1K.
  const PRESSED_TEXT = /^Runs 1–25 of 1K$/;

  // R2: one failed timer poll making the next poll replace the runs the viewer pressed Load more for with the newest 500.
  it('R2: the Runs page keeps the 1,000 runs a press read through one failed poll and the poll after it, with no walk', async () => {
    harness.runs = 1_300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    await pressLoadMore();
    expect(screen.getByText(PRESSED_TEXT)).toBeInTheDocument();
    harness.failNewest = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText(PRESSED_TEXT)).toBeInTheDocument();
    harness.failNewest = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText(PRESSED_TEXT)).toBeInTheDocument();
    expect(sinceCursors()).toEqual(['0']);
  });

  // R3: a timer tick superseding the in-flight press, which then publishes nothing.
  it('R3: a Load more press that takes 40 s, longer than the 30 s tick, is not lost to the tick and is shown when it ends', async () => {
    harness.runs = 1_300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    harness.pageDelayMs = 40_000;
    await pressLoadMore();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    // The tick reads the newest page again and no since-page: still exactly the one since-page the press sent.
    expect(sinceCursors()).toEqual(['0']);
    expect(decisionsCalls().filter(call => call.params?.since === undefined)).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText(PRESSED_TEXT)).toBeInTheDocument();
  });
});
