import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import CostSavingsOverviewWidget from './CostSavingsOverviewWidget';
import { buildCostSavingsOverview } from '@/storybook/fixtures/cost-savings-overview';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const POPULATED_OVERVIEW = buildCostSavingsOverview({
  window: '7d',
  localRatio: 0.75,
  provisioned: false,
});

const POPULATED_WITH_WARNINGS = buildCostSavingsOverview({
  window: '7d',
  includeWarnings: true,
  localRatio: 0.6,
});

describe('CostSavingsOverviewWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      new Promise(() => {}),
    );
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no projection rows', async () => {
    (fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ok: false,
    });
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(
      await screen.findByText(/no cost savings data available/i),
    ).toBeInTheDocument();
  });

  it('renders KPI tiles when data is present', async () => {
    mockFetchWithItems([POPULATED_OVERVIEW]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Cloud Spend')).toBeInTheDocument();
    expect(screen.getByText('Cloud Avoided')).toBeInTheDocument();
    expect(screen.getByText('Savings Rate')).toBeInTheDocument();
    expect(screen.getByText('Delegated Tokens')).toBeInTheDocument();
  });

  it('renders live delegation runtime savings in the product widget', async () => {
    mockFetchWithItems([{
      window: '24h',
      total_cost_usd: 0,
      total_baseline_cost_usd: 0.01533,
      total_savings_usd: 0.01533,
      savings_rate: 1,
      tokens_total: 1202,
      tokens_to_compliance: 1202,
      local_token_pct: 1,
      captured_at: '2026-05-20T12:03:30Z',
      rows: [{
        model_id: 'qwen3-coder-30b-a3b-instruct-awq-4bit',
        display_name: 'Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit',
        execution_mode: 'delegated',
        task_count: 2,
        tokens_total: 1202,
        cost_usd: 0,
        baseline_cost_usd: 0.01533,
        savings_usd: 0.01533,
        savings_pct: 1,
        runtime_address: null,
        evidence_ref: 'OMN-11299/live-demo',
      }],
      recent_runs: [{
        session_id: '5e12c850-318c-4cd2-99ae-c799c61e094f',
        task_type: 'document',
        model_name: 'Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit',
        prompt_tokens: 74,
        completion_tokens: 260,
        total_tokens: 334,
        savings_usd: 0.004122,
        latency_ms: 1347,
        created_at: '2026-05-20T20:31:38.686Z',
        token_provenance: 'measured',
      }],
      measured_run_count: 1,
      zero_token_run_count: 0,
      warnings: [],
      provisioned: true,
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );

    expect(await screen.findByText('Delegated Tokens')).toBeInTheDocument();
    expect(screen.getByText('1,202 to compliance')).toBeInTheDocument();
    expect(screen.getAllByText('Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit').length).toBeGreaterThan(0);
    expect(screen.getByText('+$0.0153')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(screen.getByText('Recent delegation runs')).toBeInTheDocument();
    expect(screen.getByText('5e12c850')).toBeInTheDocument();
    expect(screen.getByTitle('74 input, 260 output')).toHaveTextContent('334');
  });

  it('renders per-model table with expected column headers', async () => {
    mockFetchWithItems([POPULATED_OVERVIEW]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Cloud Spend');
    for (const header of ['Model', 'Mode', 'Tasks', 'Tokens', 'Cost', 'Baseline', 'Saved', 'Save%']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });

  it('renders model names from fixture rows', async () => {
    mockFetchWithItems([POPULATED_OVERVIEW]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Cloud Spend');
    expect(screen.getByText('Qwen3-Coder-30B')).toBeInTheDocument();
    expect(screen.getByText('Claude-Sonnet-4-5')).toBeInTheDocument();
  });

  it('renders execution mode labels', async () => {
    mockFetchWithItems([POPULATED_OVERVIEW]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Cloud Spend');
    expect(screen.getAllByText('Local').length).toBeGreaterThan(0);
    expect(screen.getByText('Cloud')).toBeInTheDocument();
  });

  it('renders warnings strip when warnings are present and showWarnings is true', async () => {
    mockFetchWithItems([POPULATED_WITH_WARNINGS]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{ showWarnings: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Cloud Spend');
    expect(
      screen.getByText(/Baseline cost is estimated from cloud list pricing/i),
    ).toBeInTheDocument();
  });

  it('hides warnings strip when showWarnings is false', async () => {
    mockFetchWithItems([POPULATED_WITH_WARNINGS]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{ showWarnings: false }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Cloud Spend');
    expect(
      screen.queryByText(/Baseline cost is estimated from cloud list pricing/i),
    ).not.toBeInTheDocument();
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([POPULATED_OVERVIEW]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Cloud Spend');
    expect(
      screen.getByText(/upstream-blocked/i),
    ).toBeInTheDocument();
  });

  it('does not show upstream-blocked notice when provisioned is true', async () => {
    const provisioned = buildCostSavingsOverview({ provisioned: true });
    mockFetchWithItems([provisioned]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Cloud Spend');
    expect(
      screen.queryByText(/upstream-blocked/i),
    ).not.toBeInTheDocument();
  });

  it('renders token routing split bar section', async () => {
    mockFetchWithItems([POPULATED_OVERVIEW]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostSavingsOverviewWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Cloud Spend');
    expect(screen.getByText('Delegated token split')).toBeInTheDocument();
  });
});
