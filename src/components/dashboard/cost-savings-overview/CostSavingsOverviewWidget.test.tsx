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
    expect(screen.getByText('Local Tokens')).toBeInTheDocument();
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
    expect(screen.getByText('Token routing split')).toBeInTheDocument();
  });
});
