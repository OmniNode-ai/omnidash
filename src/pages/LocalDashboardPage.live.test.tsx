// @vitest-environment jsdom
// OMN-19981 Amendment 6: live re-reads, per-widget states, the partial pages and no edit affordance.
import { StrictMode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
// OMN-19980 Amendment 2: Overview's Spend, Savings, Measured runs and Tokens read this exposure's all-time row.
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const CREDENTIALS = 'onex.snapshot.projection.tenant-credentials.v1';
const USAGE = 'onex.snapshot.projection.usage-by-model-day.v1';

const harness = vi.hoisted(() => ({
  reads: [] as string[],
  reachable: new Set<string>(),
  answer: (_topic: string): Promise<unknown[]> => Promise.resolve([]),
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    // A fresh object per call, as the real factory returns.
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      harness.reads.push(topic);
      const rows = await harness.answer(topic);
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
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

import { LocalDashboardPage } from './LocalDashboardPage';

const decisionRow = (id: string) => ({
  correlation_id: id, written_at: '2026-10-02T10:07:00Z', created_at: '2026-10-02T10:07:00Z', quality_gate_passed: true,
  quality_gate_detail: 'completed', model_name: 'Qwen3.8-27B', latency_ms: 813, tokens_input: 162, tokens_output: 52,
  task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000', data_source: 'real',
});

const METERING_ALL_ROW = {
  tenant_id: 'tenant-a', window_kind: 'all', window_start: '', window_end: '2026-10-02T10:07:00+00:00',
  as_of: '2026-10-02T10:07:00+00:00', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '3',
  baseline_state: 'resolved', runs_total: 46, runs_measured: 45, runs_unknown_tokens: 1, runs_unknown_spend: 0,
  tokens_in: 7452, tokens_out: 2392, spend_usd: '0.006860', counterfactual_usd: '1.225260', savings_usd: '1.218400',
};

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe('LocalDashboardPage live data (F25)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:12:00Z'));
    harness.reads = [];
    harness.reachable = new Set([DECISIONS, SAVINGS]);
    harness.answer = (topic) => Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : [{ sessions: [] }]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('re-reads its exposures every refresh interval and shows the new rows', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    expect(screen.getByText('run-1')).toBeInTheDocument();
    const first = harness.reads.length;
    harness.answer = (topic) => Promise.resolve(topic === DECISIONS ? [decisionRow('run-2'), decisionRow('run-1')] : [{ sessions: [] }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(harness.reads.length).toBeGreaterThan(first);
    expect(screen.getByText('run-2')).toBeInTheDocument();
  });

  it('reads each exposure once on a first load under StrictMode (the dev server\'s double mount)', async () => {
    render(<StrictMode><LocalDashboardPage pageName="runs" /></StrictMode>);
    await settle();
    expect(harness.reads.filter((topic) => topic === DECISIONS)).toHaveLength(1);
    expect(harness.reads.filter((topic) => topic === SAVINGS)).toHaveLength(1);
    expect(screen.getByText('run-1')).toBeInTheDocument();
  });

  it('keeps the last good rows on screen while a re-read is in flight', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    harness.answer = () => new Promise(() => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText('run-1')).toBeInTheDocument();
    expect(screen.queryByText(/Loading runtime exposures/)).not.toBeInTheDocument();
  });

  it('shows how old each panel\'s data is', async () => {
    render(<LocalDashboardPage pageName="runs" />);
    await settle();
    const panel = screen.getByRole('heading', { name: 'Recent runs' }).closest('article')!;
    expect(within(panel).getByText(/^As of \d+s ago$/)).toBeInTheDocument();
  });
});

describe('LocalDashboardPage widget states (F26, F27)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:12:00Z'));
    harness.reads = [];
    harness.answer = (topic) => Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : topic === SAVINGS ? [{ sessions: [] }] : [METERING_ALL_ROW]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('an unserved exposure blanks only its own widgets, naming the exposure', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS]);
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    const spend = screen.getByRole('heading', { name: 'Spend' }).closest('article')!;
    expect(within(spend).getByText(`Not served: ${METERING}`)).toBeInTheDocument();
    const lastRun = screen.getByRole('heading', { name: 'Last run' }).closest('article')!;
    expect(within(lastRun).getByText('run-1')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /page/i })).not.toBeInTheDocument();
  });

  it('an unserved secondary binding blanks the widget and names that exposure', async () => {
    harness.reachable = new Set([DECISIONS]);
    render(<LocalDashboardPage pageName="runs" />);
    await settle();

    const runs = screen.getByRole('heading', { name: 'Recent runs' }).closest('article')!;
    expect(within(runs).getByRole('status')).toHaveTextContent(`Not served: ${SAVINGS}`);
    expect(within(runs).queryByRole('table')).not.toBeInTheDocument();
    expect(within(runs).queryByText('run-1')).not.toBeInTheDocument();
  });

  // OMN-19980 Amendment 2: no Overview panel binds one topic twice any more (Measured runs' second binding on
  // cost.savings-overview.v1 is gone); four panels now share metering-summary.v1, each with its own one status.
  it('a topic bound by several panels renders one failure status per panel, with no duplicate React key', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS, METERING]);
    harness.answer = (topic) => topic === METERING
      ? Promise.reject(new Error(`Projection ${METERING} failed: HTTP 503 Service Unavailable`))
      : Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : [{ sessions: [] }]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<LocalDashboardPage pageName="overview" />);
      await settle();

      for (const title of ['Spend', 'Savings', 'Measured runs', 'Tokens in and out']) {
        const panel = screen.getByRole('heading', { name: title }).closest('article')!;
        expect(within(panel).getAllByRole('alert'), title).toHaveLength(1);
      }
      expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('same key'));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('a read error shows the exposure and the HTTP status, not a bare message', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS, METERING]);
    harness.answer = (topic) => topic === METERING
      ? Promise.reject(new Error(`Projection ${METERING} failed: HTTP 503 Service Unavailable`))
      : Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : [{ sessions: [] }]);
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    const spend = screen.getByRole('heading', { name: 'Spend' }).closest('article')!;
    expect(within(spend).getByRole('alert')).toHaveTextContent(`${METERING}: HTTP 503`);
  });

  it('a read that never answers becomes a typed timeout after 5 s', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS, METERING]);
    harness.answer = (topic) => topic === METERING ? new Promise(() => {}) : Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : [{ sessions: [] }]);
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    const spend = screen.getByRole('heading', { name: 'Spend' }).closest('article')!;
    expect(within(spend).getByRole('alert')).toHaveTextContent(`${METERING}: no answer in 5 s`);
  });

  it('keeps the last good figure after a later read fails, and says when it was good', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS, METERING]);
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    harness.answer = (topic) => topic === METERING
      ? Promise.reject(new Error(`Projection ${METERING} failed: HTTP 503 Service Unavailable`))
      : Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : [{ sessions: [] }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    const spend = screen.getByRole('heading', { name: 'Spend' }).closest('article')!;
    expect(within(spend).getByText('$0.0069')).toBeInTheDocument();
    expect(within(spend).getByRole('alert')).toHaveTextContent(/HTTP 503 Service Unavailable; last good 30s ago/);
  });
});

describe('Partial pages (FR-3, CR-2, CR-3, AK-3, F24)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    harness.reachable = new Set([CREDENTIALS]);
    harness.answer = () => Promise.resolve([]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('Workflow shows the newest run\'s recorded steps and names what the full path waits on (WF-3)', async () => {
    harness.reachable = new Set([DECISIONS]);
    harness.answer = () => Promise.resolve([
      decisionRow('older-run'),
      { ...decisionRow('newest-run'), written_at: '2026-10-02T10:09:00Z', quality_gate_passed: false, quality_gate_detail: 'provider timeout after 30s' },
    ]);
    render(<LocalDashboardPage pageName="workflow" />);
    await settle();
    const panel = screen.getByRole('heading', { name: 'Run path' }).closest('article')!;
    expect(within(panel).getByText('newest-run')).toBeInTheDocument();
    expect(within(panel).queryByText('older-run')).not.toBeInTheDocument();
    const steps = within(panel).getAllByRole('listitem').map((item) => item.querySelector('strong')?.textContent);
    expect(steps).toEqual(['Request', 'Routing', 'Quality gate', 'Terminal']);
    expect(within(panel).getByText(/failed: provider timeout after 30s/)).toBeInTheDocument();
    expect(within(panel).getByText('Full path not served yet: waits on run-trace.v1 (OMN-19987)')).toBeInTheDocument();
  });

  it('Workflow with no runs shows NO_RUNS_YET', async () => {
    harness.reachable = new Set([DECISIONS]);
    render(<LocalDashboardPage pageName="workflow" />);
    await settle();
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
  });

  it('Usage with no rows names the event it waits on, never 0 (US-4)', async () => {
    harness.reachable = new Set([USAGE]);
    render(<LocalDashboardPage pageName="usage" />);
    await settle();
    expect(screen.getByText('No usage rows yet: waits on llm-call-completed events (OMN-20006)')).toBeInTheDocument();
    expect(screen.queryByText(/^\$?0(?:\.0+)?$/)).not.toBeInTheDocument();
  });

  it('Usage shows this tenant\'s rows only, with tokens in and out apart (US-1, SV-3)', async () => {
    harness.reachable = new Set([USAGE]);
    harness.answer = () => Promise.resolve([
      { tenant_id: 'tenant-a', usage_day: '2026-10-02', model_id: 'Qwen3.8-27B', input_tokens: 1620, output_tokens: 520, cost_usd: 0, call_count: 10 },
      { tenant_id: 'tenant-b', usage_day: '2026-10-02', model_id: 'other-tenant-model', input_tokens: 1, output_tokens: 1, cost_usd: 1, call_count: 1 },
    ]);
    render(<LocalDashboardPage pageName="usage" />);
    await settle();
    const row = screen.getByRole('row', { name: /Qwen3.8-27B/ });
    for (const value of ['2026-10-02', '1620', '520', '10']) expect(within(row).getByText(value)).toBeInTheDocument();
    expect(screen.queryByText('other-tenant-model')).not.toBeInTheDocument();
  });

  it('API Keys shows the served tenant id, typed minted-at, and CLOUD_NOT_LINKED with no form (AK-1, AK-3)', async () => {
    harness.reachable = new Set([SAVINGS]);
    harness.answer = () => Promise.resolve([{ tenant_id: '820272f9-4aaf-5add-a2df-0af942852ab2', sessions: [] }]);
    render(<LocalDashboardPage pageName="api-keys" />);
    await settle();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('API Keys');
    const identity = screen.getByRole('heading', { name: 'Local identity' }).closest('article')!;
    expect(within(identity).getByText('820272f9-4aaf-5add-a2df-0af942852ab2')).toBeInTheDocument();
    expect(within(identity).getByText('Not served yet: waits on local-identity.v1 (OMN-19986)')).toBeInTheDocument();
    expect(screen.getByText(/CLOUD_NOT_LINKED/)).toBeInTheDocument();
    expect(document.querySelector('input, textarea, select, form')).toBeNull();
  });

  it('Credentials with no key ref shows the onex secret set command and no input', async () => {
    render(<LocalDashboardPage pageName="credentials" />);
    await settle();
    expect(screen.getByText('No provider key set')).toBeInTheDocument();
    expect(screen.getByText('onex secret set')).toBeInTheDocument();
    expect(document.querySelector('input, textarea, form')).toBeNull();
  });

  it('Credentials lists key refs and never a value field', async () => {
    harness.answer = () => Promise.resolve([{ provider: 'openrouter', name: 'OPENROUTER_API_KEY', created_at: '2026-10-01T09:00:00Z', revoked_at: null, api_key_value: 'sk-planted' }]);
    render(<LocalDashboardPage pageName="credentials" />);
    await settle();
    const row = screen.getByRole('row', { name: /OPENROUTER_API_KEY/ });
    expect(within(row).getByText('openrouter')).toBeInTheDocument();
    expect(within(row).getByText('Not revoked')).toBeInTheDocument();
    expect(screen.queryByText('sk-planted')).not.toBeInTheDocument();
  });
});

describe('No edit affordance on a local page (FR-3, F23)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    harness.reachable = new Set([DECISIONS, SAVINGS, METERING]);
    harness.answer = () => Promise.resolve([]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it.each(['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys'] as const)('%s has no edit or add-widget control', async (pageName) => {
    render(<LocalDashboardPage pageName={pageName} />);
    await settle();
    expect(screen.queryByRole('button', { name: /edit|add widget|layout/i })).not.toBeInTheDocument();
  });
});
