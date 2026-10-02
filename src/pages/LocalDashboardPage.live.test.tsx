// @vitest-environment jsdom
// OMN-19981 Amendment 6: live re-reads, per-widget states, the partial pages and no edit affordance.
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const CREDENTIALS = 'onex.snapshot.projection.tenant-credentials.v1';

const harness = vi.hoisted(() => ({
  reads: [] as string[],
  reachable: new Set<string>(),
  answer: (_topic: string): Promise<unknown[]> => Promise.resolve([]),
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      harness.reads.push(topic);
      const rows = await harness.answer(topic);
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
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
    harness.answer = (topic) => Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : topic === SAVINGS ? [{ sessions: [] }] : [{ total_cost_usd: 0.00686, total_savings_usd: 1.2, total_baseline_cost_usd: 1.3, measured_run_count: 46, zero_token_run_count: 0 }]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('an unserved exposure blanks only its own widgets, naming the exposure', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS]);
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    const spend = screen.getByRole('heading', { name: 'Spend' }).closest('article')!;
    expect(within(spend).getByText(`Not served: ${OVERVIEW}`)).toBeInTheDocument();
    const lastRun = screen.getByRole('heading', { name: 'Last run' }).closest('article')!;
    expect(within(lastRun).getByText('run-1')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /page/i })).not.toBeInTheDocument();
  });

  it('a read error shows the exposure and the HTTP status, not a bare message', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS, OVERVIEW]);
    harness.answer = (topic) => topic === OVERVIEW
      ? Promise.reject(new Error(`Projection ${OVERVIEW} failed: HTTP 503 Service Unavailable`))
      : Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : [{ sessions: [] }]);
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    const spend = screen.getByRole('heading', { name: 'Spend' }).closest('article')!;
    expect(within(spend).getByRole('alert')).toHaveTextContent(`${OVERVIEW}: HTTP 503`);
  });

  it('a read that never answers becomes a typed timeout after 5 s', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS, OVERVIEW]);
    harness.answer = (topic) => topic === OVERVIEW ? new Promise(() => {}) : Promise.resolve(topic === DECISIONS ? [decisionRow('run-1')] : [{ sessions: [] }]);
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    const spend = screen.getByRole('heading', { name: 'Spend' }).closest('article')!;
    expect(within(spend).getByRole('alert')).toHaveTextContent(`${OVERVIEW}: no answer in 5 s`);
  });

  it('keeps the last good figure after a later read fails, and says when it was good', async () => {
    harness.reachable = new Set([DECISIONS, SAVINGS, OVERVIEW]);
    render(<LocalDashboardPage pageName="overview" />);
    await settle();
    harness.answer = (topic) => topic === OVERVIEW
      ? Promise.reject(new Error(`Projection ${OVERVIEW} failed: HTTP 503 Service Unavailable`))
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

  it.each([
    ['workflow', 'Workflow', 'run-trace.v1 (OMN-19987)'],
    ['usage', 'Usage', 'usage-by-model-day.v1 (OMN-20006)'],
    ['api-keys', 'API Keys', 'local-identity.v1 (OMN-19986)'],
  ] as const)('%s names what it waits on instead of rendering blank', async (pageName, title, waitsOn) => {
    render(<LocalDashboardPage pageName={pageName} />);
    await settle();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(screen.getByText(`Not served yet: waits on ${waitsOn}`)).toBeInTheDocument();
  });

  it('API Keys shows CLOUD_NOT_LINKED for cloud keys, with no form', async () => {
    render(<LocalDashboardPage pageName="api-keys" />);
    await settle();
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
    harness.reachable = new Set([DECISIONS, SAVINGS, OVERVIEW]);
    harness.answer = () => Promise.resolve([]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it.each(['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys'] as const)('%s has no edit or add-widget control', async (pageName) => {
    render(<LocalDashboardPage pageName={pageName} />);
    await settle();
    expect(screen.queryByRole('button', { name: /edit|add widget|layout/i })).not.toBeInTheDocument();
  });
});
