// @vitest-environment jsdom
// OMN-19980 AC2b and AC2c, on the rendered pages: a run shows its cost and never a per-run saving, and a savings card
// with nothing measured or nothing served says so in words, naming metering-summary.v1, never a number or $0.
//
// Failure modes, each with a test below:
//   B1  Overview Recent runs or Last run shows a run's saving next to its cost;
//   B2  Runs shows a per-run baseline price (counterfactual or cloud cost) or saving next to its local cost;
//   B3  a row's null saving still switches the whole page to Baseline unresolved (the loader read savings_usd);
//   C1  the Overview Savings total with no all-time metering row reads Baseline unresolved or $0, not Not measured;
//   C2  a savings card bound to metering-summary.v1 that the census does not serve shows a figure, or no reason;
//   C3  served with zero rows: a figure or $0 instead of Not measured;
//   C4  the read answers 503: Not measured (a failed read is not a measurement) or a figure;
//   C5  a metering row with a null saving and an unresolved baseline: the whole page goes Baseline unresolved,
//       instead of that one card.
// Step B (the Overview Savings total rebound to metering-summary.v1's all-time row):
//   T1  the card shows another exposure's total (cost.savings-overview.v1), a day row, or a caption from
//       delegation.savings.v1 instead of the all row's own baseline and pricing manifest;
//   T2  metering-summary.v1 not in the census: a figure or a blank, instead of naming the exposure;
//   T3  the all row's baseline is unresolved: a figure or $0, or the whole page switches state;
//   T4  a resolved all row with a null saving (nothing measured yet) shows $0;
//   T5  after a baseline change two all rows exist: the card shows the older baseline's figure, or the two mixed;
//   T6  two all rows refreshed at the same moment cannot be told apart: the card picks one silently;
//   T7  the read answers 503: Not measured or a figure.
// Step B, Amendment 2 (Spend, Measured runs and Tokens in/out read the same all row as Savings; AC2-B1, AC2-B2):
//   M1  a card shows cost.savings-overview.v1's figure (or a day row's) instead of the all row's spend_usd,
//       runs_measured, tokens_in and tokens_out, or its run counts come from another row;
//   M2  metering-summary.v1 not in the census: a figure, a 0 or a blank, instead of naming the exposure;
//   M3  an unresolved baseline blanks Spend, Measured runs or Tokens (none of them is priced at the baseline);
//   M4  a null spend or measured count, or token totals with no run that recorded tokens, show $0 or 0;
//   M5  after a baseline change: a card shows the older row's figure, or the cards read different rows;
//   M6  two all rows refreshed at the same moment: a card picks one silently;
//   M7  only day rows: a card shows a day's figure, or 0, instead of saying there is no all-time row.
// C2-C5 exercise the Savings card, the Overview savings card dev binds to metering-summary.v1. (On the stack with
// OMN-20009 they exercised its Avg saving / call card; that card is not on dev.)
import { act, render, screen, within } from '@testing-library/react';
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
const LOCAL_COST = '0.0011';
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
    [OVERVIEW]: [{ total_cost_usd: 0.01, total_savings_usd: 1.29, total_baseline_cost_usd: 1.3, measured_run_count: 4, zero_token_run_count: 0 }],
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
});

describe('OMN-19980 AC2c: a savings card with nothing measured or served says so, never a number', () => {
  const noFigure = (scope: HTMLElement) => expect(within(scope).queryByText(/\$\s*-?\d/)).toBeNull();

  it('C1: the Overview Savings total with no all-time metering row is Not measured, never Baseline unresolved', async () => {
    served({ [METERING]: [] });
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByText('Not measured: no all-time row')).toBeInTheDocument();
    expect(within(savings).queryByText('Baseline unresolved')).toBeNull();
    noFigure(savings);
  });

  it('C2: bound to metering-summary.v1 that the census does not serve, the card names it and shows no figure', async () => {
    served();
    await open('overview');
    const card = panel('Savings');
    expect(within(card).getByText(`Not served: ${METERING}`)).toBeInTheDocument();
    noFigure(card);
  });

  it('C3: served with no rows, the card is Not measured, never $0', async () => {
    served({ [METERING]: [] });
    await open('overview');
    const card = panel('Savings');
    expect(within(card).getByText('Not measured: no all-time row')).toBeInTheDocument();
    noFigure(card);
  });

  it('C4: a 503 names metering-summary.v1 and is not read as a measurement', async () => {
    served({ [METERING]: new Error(`Projection ${METERING} failed: HTTP 503 Service Unavailable`) });
    await open('overview');
    const card = panel('Savings');
    expect(within(card).getByRole('alert')).toHaveTextContent(`${METERING}: HTTP 503 Service Unavailable`);
    expect(within(card).queryByText(/^Not measured/)).toBeNull();
    noFigure(card);
  });

  it('C5: a null saving with an unresolved baseline is that card\'s state, not the page\'s', async () => {
    served({ [METERING]: [{ window_kind: 'all', baseline_model: 'claude-opus-4-6', baseline_state: 'unresolved', runs_measured: 3, savings_usd: null,
      // Amendment 2: Spend reads this same row, and is not priced at the baseline.
      as_of: '2026-10-05T12:00:00+00:00', spend_usd: '0.010000' }] });
    await open('overview');
    const card = panel('Savings');
    expect(within(card).getByText('Baseline unresolved')).toBeInTheDocument();
    noFigure(card);
    expect(within(panel('Spend')).getByText('$0.0100')).toBeInTheDocument();
    expect(within(panel('Recent runs')).getByText(LOCAL_COST)).toBeInTheDocument();
  });
});

/** A metering-summary.v1 row as #3368 serves it: money as decimal text, null when unmeasured. */
function meteringRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    tenant_id: 'tenant-a', window_kind: 'all', window_start: '', window_end: '2026-10-05T12:00:00+00:00',
    as_of: '2026-10-05T12:00:00+00:00', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '3',
    baseline_state: 'resolved', runs_total: 9, runs_measured: 7, runs_unknown_tokens: 1, runs_unknown_spend: 1,
    tokens_in: 1620, tokens_out: 520, spend_usd: '0.007100', counterfactual_usd: '1.232300', savings_usd: '1.225200',
    ...overrides,
  };
}

describe('OMN-19980 Step B: the Overview Savings total is metering-summary.v1\'s all-time row', () => {
  const noFigure = (scope: HTMLElement) => expect(within(scope).queryByText(/\$\s*-?\d/)).toBeNull();

  it('T1: shows the all row\'s savings_usd with that row\'s baseline and manifest, not another exposure\'s total', async () => {
    served({ [METERING]: [
      meteringRow({ window_kind: 'day', window_start: '2026-10-05', savings_usd: '0.500000' }),
      meteringRow({}),
    ] });
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByText('$1.2252')).toBeInTheDocument();
    expect(within(savings).getByText('Baseline claude-sonnet-5-5 · pricing manifest v3')).toBeInTheDocument();
    expect(within(savings).getByText(/The baseline never ran\./)).toBeInTheDocument();
    // cost.savings-overview.v1 serves 1.29 and delegation.savings.v1 names claude-opus-4-6: neither reaches the card.
    expect(within(savings).queryByText('$1.2900')).toBeNull();
    expect(within(savings).queryByText(/claude-opus-4-6/)).toBeNull();
    expect(within(savings).queryByText('$0.5000')).toBeNull();
    // Amendment 2: Spend and Measured runs read the same all row now, not cost.savings-overview.v1 (0.01 and 4).
    expect(within(panel('Spend')).getByText('$0.0071')).toBeInTheDocument();
    expect(within(panel('Measured runs')).getByText('7')).toBeInTheDocument();
  });

  it('T2: metering-summary.v1 not in the census: the card names it and shows no figure', async () => {
    served();
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByText(`Not served: ${METERING}`)).toBeInTheDocument();
    noFigure(savings);
  });

  it('T3: an unresolved baseline is Baseline unresolved on this card only, never a figure', async () => {
    served({ [METERING]: [meteringRow({ baseline_state: 'unresolved', pricing_manifest_version: null, counterfactual_usd: null, savings_usd: null })] });
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByText('Baseline unresolved')).toBeInTheDocument();
    noFigure(savings);
    expect(within(panel('Spend')).getByText('$0.0071')).toBeInTheDocument();
    expect(within(panel('Recent runs')).getByText(LOCAL_COST)).toBeInTheDocument();
  });

  it('T4: a resolved all row with a null saving is Not measured, never $0', async () => {
    served({ [METERING]: [meteringRow({ runs_measured: 0, counterfactual_usd: null, savings_usd: null })] });
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByText('Not measured')).toBeInTheDocument();
    noFigure(savings);
  });

  it('T5: after a baseline change, the all row refreshed last (the baseline the runtime resolves now) is shown', async () => {
    served({ [METERING]: [
      meteringRow({ baseline_model: 'claude-opus-4-6', as_of: '2026-10-04T08:00:00+00:00', savings_usd: '9.990000' }),
      meteringRow({ baseline_model: 'claude-sonnet-5-5', as_of: '2026-10-05T12:00:00+00:00', savings_usd: '1.225200' }),
    ] });
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByText('$1.2252')).toBeInTheDocument();
    expect(within(savings).getByText('Baseline claude-sonnet-5-5 · pricing manifest v3')).toBeInTheDocument();
    expect(within(savings).queryByText('$9.9900')).toBeNull();
  });

  it('T6: two all rows refreshed at the same moment are refused by name, never one picked silently', async () => {
    served({ [METERING]: [
      meteringRow({ baseline_model: 'claude-opus-4-6', savings_usd: '9.990000' }),
      meteringRow({ baseline_model: 'claude-sonnet-5-5' }),
    ] });
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByText('Not measured: 2 baseline models')).toBeInTheDocument();
    noFigure(savings);
  });

  it('T7: a 503 names metering-summary.v1 and is not read as a measurement', async () => {
    served({ [METERING]: new Error(`Projection ${METERING} failed: HTTP 503 Service Unavailable`) });
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByRole('alert')).toHaveTextContent(`${METERING}: HTTP 503 Service Unavailable`);
    expect(within(savings).queryByText(/^Not measured/)).toBeNull();
    noFigure(savings);
  });
});

describe('OMN-19980 Step B (Amendment 2): Spend, Measured runs and Tokens read the same all row as Savings', () => {
  const HEADLINES = ['Spend', 'Measured runs', 'Tokens in and out'] as const;
  /** The card's figure and caption lines, exactly (the panel's read-state line is not the card's figure). */
  const figure = (title: string) => [...panel(title).querySelectorAll('.local-dashboard-metric')].map((node) => node.textContent);
  const captions = (title: string) => [...panel(title).querySelectorAll('.local-dashboard-caption')].map((node) => node.textContent);

  it('M1: each card shows the all row\'s own column, never cost.savings-overview.v1\'s figure or a day row\'s', async () => {
    served({ [METERING]: [
      meteringRow({ window_kind: 'day', window_start: '2026-10-05', spend_usd: '0.002200', runs_total: 3, runs_measured: 2, tokens_in: 111, tokens_out: 22 }),
      meteringRow({}),
    ] });
    await open('overview');
    const spend = panel('Spend');
    expect(within(spend).getByText('$0.0071')).toBeInTheDocument();
    expect(within(spend).queryByText('$0.0100')).toBeNull();
    expect(within(spend).queryByText('$0.0022')).toBeNull();
    const measured = panel('Measured runs');
    expect(within(measured).getByText('7')).toBeInTheDocument();
    expect(within(measured).getByText('Of 9 runs · Unknown-token runs excluded: 1 · Unknown-spend runs excluded: 1')).toBeInTheDocument();
    expect(within(measured).queryByText('4')).toBeNull();
    expect(within(measured).queryByText(/Estimated runs excluded/)).toBeNull();
    const tokens = panel('Tokens in and out');
    expect(within(tokens).getByText('1,620 in · 520 out')).toBeInTheDocument();
    expect(within(tokens).queryByText(/Not served yet/)).toBeNull();
    expect(within(tokens).queryByText(/111/)).toBeNull();
  });

  it('M2: metering-summary.v1 not in the census: each card names it and shows no number', async () => {
    served();
    await open('overview');
    for (const title of HEADLINES) {
      expect(within(panel(title)).getByText(`Not served: ${METERING}`), title).toBeInTheDocument();
      expect(figure(title), title).toEqual([]);
      expect(captions(title), title).toEqual([]);
    }
  });

  it('M3: an unresolved baseline is the Savings card\'s state only; Spend, runs and tokens still show', async () => {
    served({ [METERING]: [meteringRow({ baseline_state: 'unresolved', pricing_manifest_version: null, counterfactual_usd: null, savings_usd: null })] });
    await open('overview');
    expect(within(panel('Savings')).getByText('Baseline unresolved')).toBeInTheDocument();
    expect(within(panel('Spend')).getByText('$0.0071')).toBeInTheDocument();
    expect(within(panel('Measured runs')).getByText('7')).toBeInTheDocument();
    expect(within(panel('Tokens in and out')).getByText('1,620 in · 520 out')).toBeInTheDocument();
    for (const title of HEADLINES) expect(within(panel(title)).queryByText('Baseline unresolved'), title).toBeNull();
  });

  it('M4: a null spend or measured count, and tokens with no run that recorded any, are Not measured, never 0', async () => {
    served({ [METERING]: [meteringRow({
      runs_total: 4, runs_measured: null, runs_unknown_tokens: 4, runs_unknown_spend: 0,
      tokens_in: 0, tokens_out: 0, spend_usd: null, counterfactual_usd: null, savings_usd: null,
    })] });
    await open('overview');
    for (const title of HEADLINES) expect(figure(title), title).toEqual(['Not measured']);
    // The run counts that are served still say why nothing was measured; they are counts, not the figure.
    expect(captions('Measured runs')).toEqual(['Of 4 runs · Unknown-token runs excluded: 4 · Unknown-spend runs excluded: 0']);
  });

  it('M5: after a baseline change every card reads the all row refreshed last, the same row as Savings', async () => {
    served({ [METERING]: [
      meteringRow({ baseline_model: 'claude-opus-4-6', as_of: '2026-10-04T08:00:00+00:00', savings_usd: '9.990000',
        spend_usd: '0.555500', runs_total: 33, runs_measured: 31, tokens_in: 9999, tokens_out: 8888 }),
      meteringRow({ baseline_model: 'claude-sonnet-5-5', as_of: '2026-10-05T12:00:00+00:00' }),
    ] });
    await open('overview');
    expect(within(panel('Savings')).getByText('$1.2252')).toBeInTheDocument();
    expect(within(panel('Spend')).getByText('$0.0071')).toBeInTheDocument();
    expect(within(panel('Measured runs')).getByText('7')).toBeInTheDocument();
    expect(within(panel('Tokens in and out')).getByText('1,620 in · 520 out')).toBeInTheDocument();
    expect([...HEADLINES].map(figure)).toEqual([['$0.0071'], ['7'], ['1,620 in · 520 out']]);
    expect(captions('Measured runs')).toEqual(['Of 9 runs · Unknown-token runs excluded: 1 · Unknown-spend runs excluded: 1']);
  });

  it('M6: two all rows refreshed at the same moment are refused by name on every card, never one picked', async () => {
    served({ [METERING]: [
      meteringRow({ baseline_model: 'claude-opus-4-6', spend_usd: '0.555500', runs_measured: 31, tokens_in: 9999 }),
      meteringRow({ baseline_model: 'claude-sonnet-5-5' }),
    ] });
    await open('overview');
    for (const title of HEADLINES) {
      expect(figure(title), title).toEqual(['Not measured: 2 baseline models']);
      expect(captions(title), title).toEqual([]);
    }
  });

  it('M7: only day rows: each card says there is no all-time row, never a day\'s figure or 0', async () => {
    served({ [METERING]: [meteringRow({ window_kind: 'day', window_start: '2026-10-05' })] });
    await open('overview');
    for (const title of HEADLINES) {
      expect(figure(title), title).toEqual(['Not measured: no all-time row']);
      expect(captions(title), title).toEqual([]);
    }
  });
});
