// @vitest-environment jsdom
// OMN-24473: the review of the page timer budget found two gaps in how a timer poll keeps the Runs page's history.
// Failure modes, each with a test below:
//   R1  after one failed poll the held snapshot carries failure and lastGoodAt, and decisionsWalkFor dropped previous
//   R2  that drop made the Runs page fall from its full history to the newest 500 runs until Refresh
//   R3  a timer tick superseded an in-flight mount walk, so a walk slower than the tick was never shown
import { act, render, screen } from '@testing-library/react';
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

const RUNS_TEXT = /^Runs 1–25 of 1\.3K$/;

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

  // R2: one failed timer poll making the next poll replace the walked history with the newest 500 runs.
  it('R2: the Runs page keeps its 1,300 runs through one failed poll and the poll after it, with no re-walk', async () => {
    harness.runs = 1_300;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    expect(screen.getByText(RUNS_TEXT)).toBeInTheDocument();
    harness.failNewest = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText(RUNS_TEXT)).toBeInTheDocument();
    harness.failNewest = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText(RUNS_TEXT)).toBeInTheDocument();
    expect(sinceCursors()).toEqual(['0', '500', '1000']);
  });

  // R3: a timer tick superseding the in-flight mount walk, which then publishes nothing.
  it('R3: a 5,000-run walk of ten 4 s pages, longer than the 30 s tick, is not superseded and is shown when it ends', async () => {
    harness.runs = 5_000;
    harness.pageDelayMs = 4_000;
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    // The tick found the walk open and waited: still one newest-page read, no second one from a timer load.
    expect(decisionsCalls().filter(call => call.params?.since === undefined)).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText(/^Runs 1–25 of 5(\.0)?K$/)).toBeInTheDocument();
  });
});
