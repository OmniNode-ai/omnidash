// @vitest-environment jsdom
// OMN-26665 AC6 (hosted proof, mechanism a): the 7-day read reports how many rows it holds and how far back they reach,
// through the one shared coverage helper, and a 7-day figure drawn from rows that do not reach the window start reads
// "Not measured for the full window". The merged-build reading of the same thing is a note in the pull request; this file
// is what hosted CI can run before merge. Failure modes:
//   M1  the helper says whether rows cover the window but not how many rows it judged or how far back they go, so a
//       reading of "7 days" cannot be shown with the rows behind it
//   M2  the Overview, with a window of 7 days and 500 rows that all lie in the last 24 hours, draws a Runs figure from
//       them instead of saying the window is not measured
//   M3  (control) the same page with rows that do reach back past the window start draws the figure and no notice
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { windowCoverage, NOT_MEASURED_FULL_WINDOW } from '@/pages/local/insight-aggregates';
import { toInsightRuns } from '@/pages/local/insights';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const NOW = Date.parse('2026-11-25T12:00:00Z');
const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(NOW - offset * DAY_MS).toISOString().slice(0, 10);

const harness = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    // The page's 7-day read ({window: '7d', limit}) is one capped page of a store with more runs than it holds: it is marked
    // truncated and names a cursor, and any page behind that cursor fails, so the read stays incomplete as a busy store's does.
    readSnapshot: async (topic: string, params?: Record<string, string>) => {
      if (topic === DECISIONS && params !== undefined && 'since' in params) throw new Error('page 2 failed');
      const rows = topic === DECISIONS ? harness.rows : [];
      const capped = topic === DECISIONS && (params === undefined || 'window' in params) ? { truncated: true, nextCursor: 'cursor-1' } : {};
      return { rows, rowCount: rows.length, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: new Date().toISOString(), ...capped };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({ rows: [{ topic: DECISIONS, reachability: 'reachable' }] }),
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

const row = (id: string, at: string) => ({
  correlation_id: id, written_at: at, created_at: at, quality_gate_passed: true, quality_gate_detail: 'completed',
  model_name: 'Qwen3.8-27B', latency_ms: 813, tokens_input: 162, tokens_output: 52, task_type: 'summarization',
  cost_tier_name: 'local', actual_score: '1.000', data_source: 'real',
});
/** 500 runs, every one inside the 24 hours before NOW, as a capped read of a busy day holds. */
const lastDay = () => Array.from({ length: 500 }, (_, i) => row(`run-${i}`, new Date(NOW - (i % 20) * 3_600_000 - i * 1000).toISOString()));
/** The same read with its oldest run eight days back, past the first day of a 7-day window. */
const spanning = () => lastDay().map((r, i) => (i === 499 ? row('run-old', `${day(8)}T10:00:00Z`) : r));

describe('OMN-26665 AC6 mechanism a: the 7-day read says what it reached', () => {
  it('M1: windowCoverage reports the row count it judged and the oldest day read, covered or not', () => {
    const seven = { kind: 'days', days: 7 } as const;
    const short = toInsightRuns(lastDay());
    const reach = windowCoverage(short, seven, NOW, false);
    expect(reach).toMatchObject({ covered: false, rows: 500, oldestRead: day(1) });
    const wide = toInsightRuns(spanning());
    expect(windowCoverage(wide, seven, NOW, false)).toMatchObject({ covered: true, rows: 500, oldestRead: day(8) });
    expect(windowCoverage([], seven, NOW, false)).toMatchObject({ covered: false, rows: 0, oldestRead: null });
  });
});

describe('OMN-26665 AC6 mechanism a: the Overview under a 7-day window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(NOW));
    window.history.replaceState(null, '', '/overview?window=7d');
  });
  afterEach(() => { vi.useRealTimers(); });

  const draw = async (rows: unknown[]) => {
    harness.rows = rows;
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  };

  it('M2: 500 rows from the last 24 h read Not measured for the full window, not 500 runs', async () => {
    await draw(lastDay());
    expect(screen.getAllByText(NOT_MEASURED_FULL_WINDOW).length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Runs per day' })).toBeNull();
  });

  it('M3 control: rows that reach back past the window start draw the figure and no notice', async () => {
    await draw(spanning());
    expect(screen.queryByText(NOT_MEASURED_FULL_WINDOW)).toBeNull();
    expect(screen.getByRole('group', { name: 'Runs per day' })).toBeInTheDocument();
  });
});
