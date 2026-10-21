// @vitest-environment jsdom
// D1 confirmed by Lakshman2026-10-20: legacy all-row Overview headlines; Today is unavailable.
// Retain exact values, source conflicts, missing/malformed/zero, timestamp ordering/ties,
// per-card isolation and transport failure controls. Metering formatter/provenance suites retain their original source.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';

const harness = vi.hoisted(() => ({
  reachable: new Set<string>(),
  rows: {} as Record<string, unknown[] | Error>,
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const answer = harness.rows[topic] ?? [];
      if (answer instanceof Error) throw answer;
      return { rows: answer, rowCount: answer.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({ rows: [...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' })) }),
}));
import { LocalDashboardPage } from './LocalDashboardPage';
import { loadLocalPageConfig, resolveLocalPageEmptyState } from '@/layout/local-page-loader';

// Distinct figures, so a per-run saving or baseline price that reached the screen is found by its value.
const LOCAL_COST = '$0.0011';
const SESSION = {
  session_id: 'corr-19980', created_at: '2026-10-05T12:00:00Z', model_name: 'Qwen3.8-27B', local_cost_usd: 0.0011,
  cloud_cost_usd: 0.000901, counterfactual_baseline_usd: 0.000902, savings_usd: 0.000844,
  baseline_model: 'claude-opus-4-6', usage_source: 'measured', savings_method: 'measured',
};
const PER_RUN_SAVINGS_FIGURES = ['0.000901', '0.000902', '0.000844'];

function served(overrides: Record<string, unknown[] | Error> = {}) {
  harness.rows = {
    [DECISIONS]: [{
      correlation_id: 'corr-19980', written_at: '2026-10-05T12:00:00Z', created_at: '2026-10-05T12:00:00Z',
      model_name: 'Qwen3.8-27B', quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 813,
      tokens_input: 162, tokens_output: 52, task_type: 'summarization', cost_tier_name: 'local', actual_score: '1.000',
    }],
    [SAVINGS]: [{ tenant_id: 'tenant-a', baseline_model: 'claude-opus-4-6', pricing_manifest_version: '1', sessions: [SESSION] }],
    [OVERVIEW]: [overviewRow({ total_cost_usd: 0.01, total_savings_usd: 1.29, measured_run_count: 4 })],
    [ROUTING]: [{ tenant_id: 'tenant-a', by_tier: { local_call_share: 0.5, local_call_count: 2, total_call_count: 4, not_tier_routed_count: 0 } }],
    ...overrides,
  };
  harness.reachable = new Set(Object.keys(harness.rows));
}

async function open(pageName: 'overview' | 'runs') {
  render(<LocalDashboardPage pageName={pageName} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

const panel = (title: string) => screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;
const headers = (scope: HTMLElement) => within(scope).getAllByRole('columnheader').map((cell) => cell.textContent?.trim());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-05T12:05:00Z'));
  served();
});
afterEach(() => { vi.useRealTimers(); });

describe('OMN-19980 AC2b: a run shows its cost, never a per-run saving', () => {
  it('B1: Overview Recent runs and Last run show the run\'s cost and no saving', async () => {
    await open('overview');
    const recent = panel('Recent runs');
    fireEvent.click(within(recent).getByText('Show recent run fields', { selector: 'summary' }));
    expect(headers(recent)).toContain('Cost');
    expect(headers(recent)).not.toContain('Savings');
    expect(within(recent).getByText(LOCAL_COST)).toBeInTheDocument();
    const last = panel('Last run');
    expect(within(last).getByText(LOCAL_COST)).toBeInTheDocument();
    for (const scope of [recent, last]) {
      for (const figure of PER_RUN_SAVINGS_FIGURES) expect(within(scope).queryByText(figure), figure).toBeNull();
    }
  });

  it('B2: Runs shows local cost and the baseline labels, never a baseline price or a saving', async () => {
    await open('runs');
    const runs = panel('Recent runs');
    expect(headers(runs)).toEqual(expect.arrayContaining(['Local cost', 'Baseline model', 'Basis']));
    expect(headers(runs)).not.toContain('Baseline cost');
    expect(headers(runs)).not.toContain('Savings');
    const row = within(runs).getByRole('row', { name: /corr-19980/ });
    expect(within(row).getByText(LOCAL_COST)).toBeInTheDocument();
    expect(within(row).getByText('claude-opus-4-6')).toBeInTheDocument();
    for (const figure of PER_RUN_SAVINGS_FIGURES) expect(within(row).queryByText(figure), figure).toBeNull();
  });

  it('B3: a row\'s null saving no longer decides the page state; the served baseline_state still does', () => {
    const page = loadLocalPageConfig('overview');
    // Amendment 2: no Overview card reads cost.savings-overview.v1 any more, so the page state is read off a topic
    // Overview still renders rows from (decisions); metering-summary.v1's rows never decide it (OMN-20009 C3).
    const snapshot = (row: Record<string, unknown>) => [{
      topic: DECISIONS, rows: [row], rowCount: 1, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-10-05T12:00:00Z',
    }];
    expect(resolveLocalPageEmptyState(page, snapshot({ total_cost_usd: 0.01, savings_usd: null }))).toBeNull();
    expect(resolveLocalPageEmptyState(page, snapshot({ total_cost_usd: 0.01, baseline_state: 'BASELINE_UNRESOLVED' }))).toBe('BASELINE_UNRESOLVED');
  });

  // A metering-summary.v1 card says why its own figure is missing, so its rows never decide the page (the rule
  // OMN-20009 C3 states on its branch; Step B binds four Overview cards to metering-summary.v1).
  const read = (topic: string, rows: Record<string, unknown>[]) => ({
    topic, rows, rowCount: rows.length, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-10-05T12:00:00Z',
  });

  it('B4: metering rows with no decisions still leave Overview NO_RUNS_YET', () => {
    const page = loadLocalPageConfig('overview');
    expect(resolveLocalPageEmptyState(page, [read(DECISIONS, []), read(METERING, [meteringRow({})])])).toBe('NO_RUNS_YET');
  });

  it('B5: a metering row with a null saving and an unresolved baseline never flips the whole page', () => {
    const page = loadLocalPageConfig('overview');
    const decision = { correlation_id: 'corr-19980', created_at: '2026-10-05T12:00:00Z' };
    for (const baselineState of ['unresolved', 'BASELINE_UNRESOLVED']) {
      const metering = meteringRow({ savings_usd: null, baseline_state: baselineState });
      expect(resolveLocalPageEmptyState(page, [read(DECISIONS, [decision]), read(METERING, [metering])]), baselineState).toBeNull();
    }
  });
});

function meteringRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    tenant_id: 'tenant-a', window_kind: 'all', window_start: '', window_end: '2026-10-05T12:00:00+00:00',
    as_of: '2026-10-05T12:00:00+00:00', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '3',
    baseline_state: 'resolved', runs_total: 9, runs_measured: 7, runs_unknown_tokens: 1, runs_unknown_spend: 1,
    tokens_in: 1620, tokens_out: 520, spend_usd: '0.007100', counterfactual_usd: '1.232300', savings_usd: '1.225200',
    ...overrides,
  };
}

// D1, Lakshman 2026-10-20: Overview reads the legacy all row. Metering
// baseline/ratio behavior is retained by the direct MeteringTotalCard suites.
function overviewRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return { window: 'all', captured_at: '2026-10-05T12:00:00Z', total_cost_usd: '0.007100',
    total_savings_usd: '1.225200', run_count: 9, measured_run_count: 7, unknown_run_count: 2, tokens_total: 2140, ...overrides };
}
const noFigure = (scope: HTMLElement) => expect(within(scope).queryByText(/\$\s*-?\d/)).toBeNull();
const figure = (title: string) => panel(title).querySelector('.local-dashboard-metric')?.textContent ?? '';
const HEADLINES = ['Actual spend', 'Savings', 'Agent calls', 'Tokens processed'];

describe('OMN-19980 AC2c: Overview absence and transport errors remain typed under the approved source', () => {
  it('C1: no all-time legacy row is unavailable, never Baseline unresolved', async () => {
    served({ [OVERVIEW]: [overviewRow({ window: 'day' })] });
    await open('overview');
    expect(figure('Savings')).toBe('Not measured: overview totals unavailable');
    expect(panel('Savings').textContent).not.toContain('Baseline unresolved');
    noFigure(panel('Savings'));
  });
  it('C2: an unserved legacy source is named and shows no figure', async () => {
    harness.reachable.delete(OVERVIEW);
    await open('overview');
    expect(within(panel('Savings')).getByText('Not available yet: savings summary.')).toBeInTheDocument();
    noFigure(panel('Savings'));
  });
  it('C3: served with no rows is unavailable, never $0', async () => {
    served({ [OVERVIEW]: [] }); await open('overview');
    expect(figure('Savings')).toBe('Not measured: overview totals unavailable'); noFigure(panel('Savings'));
  });
  it('C4: a 503 names the actual legacy exposure and is not a measurement', async () => {
    served({ [OVERVIEW]: new Error(`Projection ${OVERVIEW} failed: HTTP 503`) }); await open('overview');
    expect(within(panel('Savings')).getByRole('alert')).toHaveTextContent('The data could not be read (HTTP 503');
    noFigure(panel('Savings'));
  });
  it('C5: a missing saving affects only its card; unrelated baseline state cannot blank the page', async () => {
    served({ [OVERVIEW]: [overviewRow({ total_savings_usd: null, baseline_state: 'unresolved' })] }); await open('overview');
    expect(figure('Savings')).toBe('Not measured'); expect(figure('Actual spend')).toBe('$0.0071');
    expect(within(panel('Last run')).getByText(LOCAL_COST)).toBeInTheDocument();
  });
});

describe('OMN-19980 Step B: Overview uses exactly its approved legacy all row', () => {
  it('T1: exact all-row savings/spend/counts, never conflicting metering or delegation figures', async () => {
    served({ [OVERVIEW]: [overviewRow({ window: 'day', total_savings_usd: '0.500000' }), overviewRow({})],
      [METERING]: [meteringRow({ savings_usd: '9.990000' })] }); await open('overview');
    expect(figure('Savings')).toBe('$1.2252'); expect(figure('Actual spend')).toBe('$0.0071'); expect(figure('Agent calls')).toBe('9');
    expect(panel('Savings').textContent).toContain('Modelled · vs cloud baseline');
    expect(panel('Savings').textContent).not.toMatch(/9\.9900|0\.5000|claude-opus-4-6/);
  });
  // Review failure: a negative served saving is money below zero, not $-5.
  it('T1 negative money keeps its currency sign before the symbol', async () => {
    served({ [OVERVIEW]: [overviewRow({ total_savings_usd: -5 })] }); await open('overview');
    expect(figure('Savings')).toBe('-$5.0000');
  });
  it('T2: legacy source absent from census is named, without falling back to metering', async () => {
    served({ [METERING]: [meteringRow({})] }); harness.reachable.delete(OVERVIEW); await open('overview');
    expect(panel('Savings').textContent).toContain('Not available yet: savings summary.'); noFigure(panel('Savings'));
  });
  it('T3: a missing legacy saving is unavailable, without borrowing a resolved metering saving', async () => {
    served({ [OVERVIEW]: [overviewRow({ total_savings_usd: null })], [METERING]: [meteringRow({})] }); await open('overview');
    expect(figure('Savings')).toBe('Not measured'); expect(figure('Actual spend')).toBe('$0.0071'); noFigure(panel('Savings'));
  });
  it('T4: a malformed saving remains unavailable, never $0 or NaN', async () => {
    served({ [OVERVIEW]: [overviewRow({ total_savings_usd: 'n/a' })] }); await open('overview');
    expect(figure('Savings')).toBe('Not measured'); noFigure(panel('Savings'));
  });
  it('T5: captured_at selects the latest all row, regardless of served order', async () => {
    served({ [OVERVIEW]: [overviewRow({ captured_at: '2026-10-04T08:00:00Z', total_savings_usd: '9.990000' }), overviewRow({})] }); await open('overview');
    expect(figure('Savings')).toBe('$1.2252'); expect(panel('Savings').textContent).not.toContain('$9.9900');
  });
  it('T6: equal newest timestamps are ambiguous, never silently picked', async () => {
    served({ [OVERVIEW]: [overviewRow({ total_savings_usd: '9.990000' }), overviewRow({})] }); await open('overview');
    expect(figure('Savings')).toBe('Not measured: ambiguous overview totals'); noFigure(panel('Savings'));
  });
  it('T7: HTTP failure remains an error, not an empty measurement', async () => {
    served({ [OVERVIEW]: new Error(`Projection ${OVERVIEW} failed: HTTP 503 Service Unavailable`) }); await open('overview');
    expect(within(panel('Savings')).getByRole('alert')).toHaveTextContent('The data could not be read (HTTP 503 Service Unavailable)');
    expect(figure('Savings')).toBe(''); noFigure(panel('Savings'));
  });
});

describe('OMN-19980 headline coherence on the approved source', () => {
  it('M1: all cards use the same served columns and disclose the served unknown count', async () => {
    served({ [OVERVIEW]: [overviewRow({})], [METERING]: [meteringRow({ spend_usd: '0.5555', runs_measured: 31 })] }); await open('overview');
    expect(HEADLINES.map(figure)).toEqual(['$0.0071', '$1.2252', '9', '2,140']);
    // OMN-21166 AC37: every call is the figure; the served classes are its breakdown.
    expect(panel('Agent calls').textContent).toContain('7 measured · 2 unknown');
    expect(panel('Tokens processed').textContent).not.toMatch(/in ·|out/);
  });
  it('M2: an unserved source leaves every headline without a number', async () => {
    harness.reachable.delete(OVERVIEW); await open('overview');
    for (const title of HEADLINES) { expect(panel(title).textContent).toContain('Not available yet: savings summary.'); expect(figure(title)).toBe(''); }
  });
  it('M3: missing savings cannot erase independent spend, measured calls or tokens', async () => {
    served({ [OVERVIEW]: [overviewRow({ total_savings_usd: null, baseline_state: 'unresolved' })] }); await open('overview');
    expect(HEADLINES.map(figure)).toEqual(['$0.0071', 'Not measured', '9', '2,140']);
  });
  it('M4: missing fields are unavailable but served numeric zero remains zero', async () => {
    served({ [OVERVIEW]: [overviewRow({ total_cost_usd: null, total_savings_usd: null, run_count: null, measured_run_count: null, tokens_total: null })] }); await open('overview');
    expect(HEADLINES.map(figure)).toEqual(['Not measured', 'Not measured', 'Not measured', 'Not measured']);
    cleanup(); served({ [OVERVIEW]: [overviewRow({ total_cost_usd: 0, total_savings_usd: 0, run_count: 0, measured_run_count: 0, unknown_run_count: 0, tokens_total: 0 })] }); await open('overview');
    expect(HEADLINES.map(figure)).toEqual(['$0.00', '$0.00', '0', '0']);
  });
  it('M5: all headlines select the same latest row, never mixing old figures', async () => {
    served({ [OVERVIEW]: [overviewRow({ captured_at: '2026-10-04T08:00:00Z', total_cost_usd: '.5555', total_savings_usd: '9.990000', run_count: 33, measured_run_count: 31, tokens_total: 9999 }), overviewRow({})] }); await open('overview');
    expect(HEADLINES.map(figure)).toEqual(['$0.0071', '$1.2252', '9', '2,140']);
  });
  it('M6: newest timestamp ties are refused on every headline', async () => {
    served({ [OVERVIEW]: [overviewRow({ total_cost_usd: '0.5555' }), overviewRow({})] }); await open('overview');
    expect(HEADLINES.map(figure)).toEqual(HEADLINES.map(() => 'Not measured: ambiguous overview totals'));
  });
  it('M7: only day rows never masquerade as all-time totals', async () => {
    served({ [OVERVIEW]: [overviewRow({ window: 'day' })] }); await open('overview');
    expect(HEADLINES.map(figure)).toEqual(HEADLINES.map(() => 'Not measured: overview totals unavailable'));
  });
});
