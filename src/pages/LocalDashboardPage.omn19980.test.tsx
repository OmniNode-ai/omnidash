// @vitest-environment jsdom
// OMN-19980 AC2b and AC2c, on the rendered pages: a run shows its cost and never a per-run saving, and a savings card
// with nothing measured or nothing served says so in words, naming metering-summary.v1, never a number or $0.
//
// Failure modes, each with a test below:
//   B1  Overview Recent runs or Last run shows a run's saving next to its cost;
//   B2  Runs shows a per-run baseline price (counterfactual or cloud cost) or saving next to its local cost;
//   B3  a row's null saving still switches the whole page to Baseline unresolved (the loader read savings_usd);
//   C1  the Overview Savings total with no served row reads Baseline unresolved, a baseline it never priced;
//   C2  a savings card bound to metering-summary.v1 that the census does not serve shows a figure, or no reason;
//   C3  served with zero rows: a figure or $0 instead of Not measured;
//   C4  the read answers 503: Not measured (a failed read is not a measurement) or a figure;
//   C5  a metering row with a null saving and an unresolved baseline: the whole page goes Baseline unresolved,
//       instead of that one card.
// The unbound card (Avg saving / call waits on metering-summary.v1) is OMN-20009's P2 and the AC2c population check
// in local/omn19980.savings-source.test.ts.
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalPageDocument } from '@/layout/local-page-loader';

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';

const harness = vi.hoisted(() => ({
  reachable: new Set<string>(),
  rows: {} as Record<string, unknown[] | Error>,
  /** Step B's shape for the Avg saving / call card (OMN-20009 C2, served branch): bound to metering-summary.v1. */
  bindMetering: false,
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
vi.mock('@/layout/local-page-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/layout/local-page-loader')>();
  return {
    ...actual,
    loadLocalPageConfig: (name: Parameters<typeof actual.loadLocalPageConfig>[0]): LocalPageDocument => {
      const page = actual.loadLocalPageConfig(name);
      if (name !== 'overview' || !harness.bindMetering) return page;
      return {
        ...page,
        components: page.components.map((component) => component.component_id !== 'overview-avg-saving-per-call' ? component : {
          ...component,
          data_bindings: [{
            binding_id: 'overview-avg-saving-per-call-metering', projection_topic: METERING,
            ordering_authority_field: 'as_of', ordering_direction: 'descending',
            required_fields: ['window_kind', 'baseline_model', 'baseline_state', 'runs_measured', 'savings_per_measured_run_usd'],
          }],
          supported_empty_state_reasons: ['missing-field', 'no-data'],
        }),
      } as LocalPageDocument;
    },
  };
});

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
  harness.bindMetering = false;
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
    expect(headers(runs)).toEqual(expect.arrayContaining(['Local cost', 'Baseline model', 'Usage source']));
    expect(headers(runs)).not.toContain('Baseline cost');
    expect(headers(runs)).not.toContain('Savings');
    const row = within(runs).getByRole('row', { name: /corr-19980/ });
    expect(within(row).getByText(LOCAL_COST)).toBeInTheDocument();
    expect(within(row).getByText('claude-opus-4-6')).toBeInTheDocument();
    for (const figure of PER_RUN_SAVINGS_FIGURES) expect(within(row).queryByText(figure), figure).toBeNull();
  });

  it('B3: a row\'s null saving no longer decides the page state; the served baseline_state still does', () => {
    const page = loadLocalPageConfig('overview');
    const snapshot = (row: Record<string, unknown>) => [{
      topic: OVERVIEW, rows: [row], rowCount: 1, dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-10-05T12:00:00Z',
    }];
    expect(resolveLocalPageEmptyState(page, snapshot({ total_cost_usd: 0.01, savings_usd: null }))).toBeNull();
    expect(resolveLocalPageEmptyState(page, snapshot({ total_cost_usd: 0.01, baseline_state: 'BASELINE_UNRESOLVED' }))).toBe('BASELINE_UNRESOLVED');
  });
});

describe('OMN-19980 AC2c: a savings card with nothing measured or served says so, never a number', () => {
  const noFigure = (scope: HTMLElement) => expect(within(scope).queryByText(/\$\s*-?\d/)).toBeNull();

  it('C1: the Overview Savings total with no served row is Not measured, never Baseline unresolved', async () => {
    served({ [OVERVIEW]: [] });
    await open('overview');
    const savings = panel('Savings');
    expect(within(savings).getByText('Not measured')).toBeInTheDocument();
    expect(within(savings).queryByText('Baseline unresolved')).toBeNull();
    noFigure(savings);
  });

  it('C2: bound to metering-summary.v1 that the census does not serve, the card names it and shows no figure', async () => {
    harness.bindMetering = true;
    served();
    await open('overview');
    const card = panel('Avg saving / call');
    expect(within(card).getByText(`Not served: ${METERING}`)).toBeInTheDocument();
    noFigure(card);
  });

  it('C3: served with no rows, the card is Not measured, never $0', async () => {
    harness.bindMetering = true;
    served({ [METERING]: [] });
    await open('overview');
    const card = panel('Avg saving / call');
    expect(within(card).getByText('Not measured: no all-time row')).toBeInTheDocument();
    noFigure(card);
  });

  it('C4: a 503 names metering-summary.v1 and is not read as a measurement', async () => {
    harness.bindMetering = true;
    served({ [METERING]: new Error(`Projection ${METERING} failed: HTTP 503 Service Unavailable`) });
    await open('overview');
    const card = panel('Avg saving / call');
    expect(within(card).getByRole('alert')).toHaveTextContent(`${METERING}: HTTP 503 Service Unavailable`);
    expect(within(card).queryByText(/^Not measured/)).toBeNull();
    noFigure(card);
  });

  it('C5: a null saving with an unresolved baseline is that card\'s state, not the page\'s', async () => {
    harness.bindMetering = true;
    served({ [METERING]: [{ window_kind: 'all', baseline_model: 'claude-opus-4-6', baseline_state: 'unresolved', runs_measured: 3, savings_usd: null, savings_per_measured_run_usd: null }] });
    await open('overview');
    const card = panel('Avg saving / call');
    expect(within(card).getByText('Baseline unresolved')).toBeInTheDocument();
    noFigure(card);
    expect(within(panel('Spend')).getByText('$0.0100')).toBeInTheDocument();
    expect(within(panel('Recent runs')).getByText(LOCAL_COST)).toBeInTheDocument();
  });
});
