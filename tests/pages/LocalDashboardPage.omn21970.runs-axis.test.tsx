// @vitest-environment jsdom
// OMN-21970 AC2 (Jonah 2026-11-07, "This should have the same time scale as the graph above. Currently it's set to all
// time but it's only showing data for a week."): when delegation.daily.v1 is not served and the decisions read stopped
// short of every run, Runs per day spans every day metering-summary.v1 serves, the same axis as the Daily trend and
// Tokens per day, instead of the few days whose verdicts the read reached.
//
// Failure modes, each a test below:
//   R1  the axis shrinks to the days with a verdict read (one week) while the trend above spans every served day
//   R2  a day whose verdicts were not read draws a bar or names a count (Lakshman 2026-11-05: no verdict, no bar)
//   R3  a day whose verdicts were read keeps its passed and failed bars and counts
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';

const harness = vi.hoisted(() => ({
  reachable: new Set<string>(),
  rows: {} as Record<string, unknown[]>,
  truncated: new Set<string>(),
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const rows = harness.rows[topic] ?? [];
      // A truncated page with no cursor: the walk cannot continue, so the read stays marked incomplete.
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString(),
        ...(harness.truncated.has(topic) ? { truncated: true } : {}) };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({ rows: [...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' })) }),
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

const NOW = '2026-11-07T12:00:00Z';
const DAY_MS = 86_400_000;
// Ten served UTC days, 2026-10-29 to 2026-11-07, each with runs; only the newest day's run reached the decisions read.
const DAYS = Array.from({ length: 10 }, (_, index) => new Date(Date.parse('2026-10-29T00:00:00Z') + index * DAY_MS).toISOString().slice(0, 10));

const meteringDay = (day: string, runs: number) => ({
  tenant_id: 'tenant-a', window_kind: 'day', window_start: `${day}T00:00:00Z`, window_end: `${day}T23:59:59Z`, as_of: NOW,
  baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '3', baseline_state: 'resolved',
  runs_total: runs, runs_measured: runs, runs_unknown_tokens: 0, runs_unknown_spend: 0,
  tokens_in: runs * 100, tokens_out: runs * 10, spend_usd: '0.010000', counterfactual_usd: '0.200000', savings_usd: '0.190000',
});
const METERING_ALL = { ...meteringDay('2026-11-07', 1000), window_kind: 'all', window_start: '' };
const DECISION = {
  correlation_id: 'run-newest', written_at: '2026-11-07T10:00:00Z', created_at: '2026-11-07T10:00:00Z', quality_gate_passed: true,
  quality_gate_detail: 'completed', model_name: 'Qwen3.8-27B', latency_ms: 813, tokens_input: 162, tokens_output: 52,
  task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000', data_source: 'real',
};

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

const runsPerDayBars = () => within(screen.getByRole('group', { name: 'Runs per day' })).getAllByRole('button');

describe('OMN-21970: Runs per day spans every served day under an incomplete decisions read', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(NOW));
    harness.rows = {
      [DECISIONS]: [DECISION],
      [METERING]: [METERING_ALL, ...DAYS.map((day) => meteringDay(day, 100))],
      [SAVINGS]: [{ tenant_id: 'tenant-a', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '3', sessions: [] }],
    };
    harness.truncated = new Set([DECISIONS]);
    harness.reachable = new Set([DECISIONS, METERING, SAVINGS]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('R1: the axis is the ten served days, oldest first, not the week the read reached', async () => {
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    const bars = runsPerDayBars();
    expect(bars).toHaveLength(DAYS.length);
    expect(bars[0]!.getAttribute('aria-label')).toMatch(/^Oct 29:/);
    expect(bars[bars.length - 1]!.getAttribute('aria-label')).toMatch(/^Nov 7:/);
  });

  it('R2: a day whose verdicts were not read has no bar and no count, only "Verdicts not read"', async () => {
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    const [oldest] = runsPerDayBars();
    expect(oldest!.getAttribute('aria-label')).toBe('Oct 29: Verdicts not read');
    // No bar is drawn: the column holds no filled segment (DayBars draws .gdb-bar only for a value above 0).
    expect(oldest!.querySelectorAll('.gdb-bar').length).toBe(0);
  });

  it('R3: the day whose verdict was read keeps its passed and failed counts', async () => {
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    const bars = runsPerDayBars();
    expect(bars[bars.length - 1]!.getAttribute('aria-label')).toBe('Nov 7: 1 run, 1 passed, 0 failed');
  });
});
