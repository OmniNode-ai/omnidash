// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelComponentContract } from '../shared/types/generated/onex-models';

const census = vi.hoisted(() => ({ next: [] as Array<() => Promise<unknown>> }));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async () => ({
      rows: [],
      rowCount: 0,
      dataFreshness: 'idle',
      latestEventAt: null,
      readAt: '2026-10-02T00:00:00.000Z',
    }),
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({
  resolveEffectiveDataSource: () => ({ mode: 'http' }),
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: () => (census.next.shift() ?? (() => new Promise(() => {})))(),
}));

import { LocalDashboardPage, MetricCard } from './LocalDashboardPage';

const SAVINGS_OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';

function component(id: string, requiredFields: string[]): ModelComponentContract {
  return {
    component_id: id,
    component_kind: 'metric_card',
    title: id,
    contract_version: { major: 1, minor: 0, patch: 0 },
    data_bindings: [{
      binding_id: `${id}-binding`,
      projection_topic: SAVINGS_OVERVIEW,
      ordering_authority_field: 'captured_at',
      ordering_direction: 'descending',
      required_fields: requiredFields,
    }],
  } as ModelComponentContract;
}

describe('MetricCard', () => {
  it('renders the field its widget names, not roi_percent', () => {
    render(<MetricCard
      component={component('overview-spend', ['total_cost_usd'])}
      config={{ metric_key: 'total_cost_usd', label: 'Spend', format: 'currency', precision: 4 }}
      row={{ total_cost_usd: 0.00686, roi_percent: 99 }}
    />);
    expect(screen.getByText('$0.0069')).toBeInTheDocument();
    expect(screen.queryByText(/99/)).not.toBeInTheDocument();
  });

  it('renders Baseline unresolved for savings without a baseline, never zero', () => {
    render(<MetricCard
      component={component('overview-savings', ['total_savings_usd', 'total_baseline_cost_usd'])}
      config={{ metric_key: 'total_savings_usd', label: 'Savings', format: 'currency', precision: 4 }}
      row={{ total_savings_usd: 0, total_baseline_cost_usd: null }}
    />);
    expect(screen.getByText('Baseline unresolved')).toBeInTheDocument();
    expect(screen.queryByText(/^\$?0(?:\.0+)?$/)).not.toBeInTheDocument();
  });

  it('renders the savings value once the baseline is priced', () => {
    render(<MetricCard
      component={component('overview-savings', ['total_savings_usd', 'total_baseline_cost_usd'])}
      config={{ metric_key: 'total_savings_usd', label: 'Savings', format: 'currency', precision: 4 }}
      row={{ total_savings_usd: 1.22354, total_baseline_cost_usd: 1.2304 }}
    />);
    expect(screen.getByText('$1.2235')).toBeInTheDocument();
  });

  it('renders Not measured for an absent field, never zero', () => {
    render(<MetricCard
      component={component('overview-tokens', ['tokens_total'])}
      config={{ metric_key: 'tokens_total', label: 'Tokens', format: 'number', precision: 0 }}
      row={{}}
    />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it('groups a whole-number figure', () => {
    render(<MetricCard
      component={component('overview-tokens', ['tokens_total'])}
      config={{ metric_key: 'tokens_total', label: 'Tokens', format: 'number', precision: 0 }}
      row={{ tokens_total: 56800 }}
    />);
    expect(screen.getByText('56,800')).toBeInTheDocument();
  });
});

describe('MetricCard captions and pending sources (Amendment 4)', () => {
  it('names the baseline model and pricing manifest version under the savings figure (OV-3, SV-2)', () => {
    render(<MetricCard
      component={component('overview-savings', ['total_savings_usd', 'total_baseline_cost_usd'])}
      config={{ metric_key: 'total_savings_usd', label: 'Savings', format: 'currency', precision: 4 }}
      row={{ total_savings_usd: 1.22354, total_baseline_cost_usd: 1.2304 }}
      caption={{ baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: 1 }}
    />);
    expect(screen.getByText('$1.2235')).toBeInTheDocument();
    expect(screen.getByText('Baseline claude-sonnet-5-5 · pricing manifest v1')).toBeInTheDocument();
  });

  it('says the baseline is unresolved in the caption when the served row has none', () => {
    render(<MetricCard
      component={component('overview-savings', ['total_savings_usd', 'total_baseline_cost_usd'])}
      config={{ metric_key: 'total_savings_usd', label: 'Savings', format: 'currency', precision: 4 }}
      row={{ total_savings_usd: 1.22354, total_baseline_cost_usd: 1.2304 }}
      caption={{ baseline_model: null, pricing_manifest_version: 1 }}
    />);
    expect(screen.getByText('Baseline unresolved · pricing manifest v1')).toBeInTheDocument();
  });

  it('labels the savings figure as a modelled counterfactual, not a measured bill (Jonah aac9032d item 5)', () => {
    render(<MetricCard
      component={component('overview-savings', ['total_savings_usd', 'total_baseline_cost_usd'])}
      config={{ metric_key: 'total_savings_usd', label: 'Savings', format: 'currency', precision: 4 }}
      row={{ total_savings_usd: 1.22354, total_baseline_cost_usd: 1.2304 }}
      caption={{ baseline_model: 'claude-opus-4-6', pricing_manifest_version: 1 }}
    />);
    expect(screen.getByText('Modelled: the runs\' tokens priced at the baseline model\'s list price. The baseline never ran.')).toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('does not put the modelled label on a card with no baseline caption', () => {
    render(<MetricCard
      component={component('overview-measured', ['measured_run_count'])}
      config={{ metric_key: 'measured_run_count', label: 'Measured runs', format: 'number', precision: 0 }}
      row={{ measured_run_count: 41 }}
      caption={{ zero_token_run_count: 0 }}
    />);
    expect(screen.queryByText(/^Modelled:/)).not.toBeInTheDocument();
  });

  it('shows the served zero-token diagnostic beside the measured runs', () => {
    render(<MetricCard
      component={component('overview-measured', ['measured_run_count'])}
      config={{ metric_key: 'measured_run_count', label: 'Measured runs', format: 'number', precision: 0 }}
      row={{ measured_run_count: 41 }}
      caption={{ zero_token_run_count: 0 }}
    />);
    expect(screen.getByText('41')).toBeInTheDocument();
    expect(screen.getByText(/Zero-token runs: 0/)).toBeInTheDocument();
  });

  // OMN-19980 Amendment 2 binds Tokens in and out to metering-summary.v1; Avg saving / call is the card still unbound.
  it('renders a card with no served exposure as not served yet, naming what it waits for (SV-3)', () => {
    render(<MetricCard
      component={{ ...component('overview-avg-saving-per-call', []), data_bindings: [], supported_empty_state_reasons: ['upstream-blocked'] } as ModelComponentContract}
      config={{ metric_key: 'savings_per_measured_run_usd', label: 'Avg saving / call', format: 'currency', precision: 4 }}
      row={{ tokens_total: 56800 }}
    />);
    expect(screen.getByText('Not served yet: waits on metering-summary.v1')).toBeInTheDocument();
    expect(screen.queryByText(/56,800/)).not.toBeInTheDocument();
  });
});

describe('LocalDashboardPage', () => {
  beforeEach(() => { census.next = []; });

  it('shows the new page header while the next page loads, not the previous page', async () => {
    census.next.push(async () => ({
      rows: [
        { topic: 'onex.snapshot.projection.delegation.savings.v1', reachability: 'reachable' },
        { topic: 'onex.snapshot.projection.delegation.decisions.v1', reachability: 'reachable' },
      ],
    }));
    const view = render(<LocalDashboardPage pageName="runs" />);
    await act(async () => {});
    // Runs loaded its own document (not the name fallback), so a stale header is possible next.
    expect(screen.getByText('Every delegation run from the runtime\'s served decisions, with its cost.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Runs');

    // The next census never answers, so Overview stays in its loading state.
    view.rerender(<LocalDashboardPage pageName="overview" />);
    await act(async () => {});
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Overview');
  });
});
