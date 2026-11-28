// @vitest-environment jsdom
// OMN-26665 AC4: the Overview header tells a served-empty read from a failed or timed-out one, and each spend source has
// its own deadline and its own loading state instead of the page waiting on its slowest read. Failure modes:
//   P1  (control; already held on dev) the whole page held in "Loading runtime exposures…" until the slowest source answers, so a 7 s spend read hides
//       every panel that was already served
//   P2  a spend read that takes 7 s (inside its own deadline) cut off at the 5 s default and drawn as a failure
//   P3  a decisions read that times out at 5 s reading "Last run not recorded", the words of an empty store
//   P4  (control) a served-empty decisions read still reads "Last run not recorded"
//   P5  a decisions read still in flight reading as empty instead of loading
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const ALL_ROW = { window_kind: 'all', window_start: '', as_of: '2026-11-25T01:00:00Z', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1.0.0', baseline_state: 'resolved', spend_usd: '0.006860', savings_usd: '1.218400',
  runs_total: 45, runs_measured: 45, runs_unknown_tokens: 0, runs_unknown_spend: 0, tokens_in: 7000, tokens_out: 2844 };

const harness = vi.hoisted(() => ({
  delays: {} as Record<string, number>,
  answers: {} as Record<string, unknown[]>,
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const wait = harness.delays[topic] ?? 0;
      if (wait > 0) await new Promise<void>((resolve) => { setTimeout(resolve, wait); });
      const rows = harness.answers[topic] ?? [];
      return { rows, rowCount: rows.length, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({ rows: [DECISIONS, METERING].map((topic) => ({ topic, reachability: 'reachable' })) }),
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

const decisionRow = {
  correlation_id: 'run-1', written_at: '2026-11-25T01:00:00Z', created_at: '2026-11-25T01:00:00Z', quality_gate_passed: true,
  quality_gate_detail: 'completed', model_name: 'Qwen3.8-27B', latency_ms: 813, tokens_input: 162, tokens_output: 52,
  task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000', data_source: 'real',
};

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const strip = () => screen.getAllByRole('status', { name: 'Runtime status' })[0]!;
const spendCard = () => screen.getByRole('heading', { name: 'Actual spend' }).closest('article')!;

describe('OMN-26665 AC4: per-source deadlines and honest header states', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-25T01:30:00Z'));
    window.history.replaceState(null, '', '/overview');
    harness.delays = {};
    harness.answers = { [DECISIONS]: [decisionRow], [METERING]: [ALL_ROW] };
  });
  afterEach(() => { vi.useRealTimers(); });

  it('P1: while the 7 s spend read is out, the page is drawn and the spend card says it is loading', async () => {
    harness.delays = { [METERING]: 7_000 };
    render(<LocalDashboardPage pageName="overview" />);
    await tick(1_000);
    expect(screen.queryByText('Loading runtime exposures…')).toBeNull();
    expect(within(spendCard()).getByText('Loading data…')).toBeInTheDocument();
  });

  it('P2: the 7 s spend read lands inside its own deadline and draws the figure, not a timeout', async () => {
    harness.delays = { [METERING]: 7_000 };
    render(<LocalDashboardPage pageName="overview" />);
    // Past the 5 s default, inside the spend source's own deadline: still loading, never drawn as a timeout.
    await tick(5_500);
    expect(within(spendCard()).getByText('Loading data…')).toBeInTheDocument();
    expect(within(spendCard()).queryByRole('alert')).toBeNull();
    await tick(2_000);
    expect(within(spendCard()).getByText('$0.0068')).toBeInTheDocument();
    expect(within(spendCard()).queryByRole('alert')).toBeNull();
  });

  it('P3: a decisions read that times out at 5 s says Last run not read, not Last run not recorded', async () => {
    harness.delays = { [DECISIONS]: 6_000 };
    render(<LocalDashboardPage pageName="overview" />);
    await tick(5_500);
    expect(strip().textContent).toContain('Last run not read');
    expect(strip().textContent).not.toContain('Last run not recorded');
  });

  it('P4 control: a served-empty decisions read still reads Last run not recorded', async () => {
    harness.answers = { [DECISIONS]: [], [METERING]: [ALL_ROW] };
    render(<LocalDashboardPage pageName="overview" />);
    await tick(500);
    expect(strip().textContent).toContain('Last run not recorded');
    expect(strip().textContent).not.toContain('Last run not read');
  });

  it('P5: a decisions read still in flight reads as loading, not as an empty store', async () => {
    harness.delays = { [DECISIONS]: 3_000 };
    render(<LocalDashboardPage pageName="overview" />);
    await tick(1_000);
    expect(strip().textContent).toContain('Last run loading');
    expect(strip().textContent).not.toContain('Last run not recorded');
  });
});
