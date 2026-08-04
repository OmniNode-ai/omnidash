import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationCostBreakdownWidget from './DelegationCostBreakdownWidget';
import type { CostAggregateRow } from './DelegationCostBreakdownWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function row(overrides: Partial<CostAggregateRow> = {}): CostAggregateRow {
  return {
    aggregation_key: 'model:claude-sonnet-4-6',
    window: '24h',
    total_cost_usd: '1.500000',
    total_tokens: 12_000,
    call_count: 4,
    updated_at: '2026-08-04T16:00:00Z',
    ...overrides,
  };
}

describe('DelegationCostBreakdownWidget', () => {
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
        <DelegationCostBreakdownWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows honest empty state when no rows for the selected window', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationCostBreakdownWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no cost data for this window/i)).toBeInTheDocument();
  });

  it('never shows a savings figure', async () => {
    mockFetchWithItems([row()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationCostBreakdownWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Total cost');
    expect(screen.queryByText(/saving/i)).not.toBeInTheDocument();
  });

  it('renders KPI totals and a breakdown row for the default (24h) window', async () => {
    mockFetchWithItems([row({ aggregation_key: 'model:qwen3-coder-30b', total_cost_usd: '2.500000', total_tokens: 8_000, call_count: 3 })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationCostBreakdownWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Total cost')).toBeInTheDocument();
    expect(screen.getByText('Total tokens')).toBeInTheDocument();
    // "Calls" renders twice: the KPI tile label and the table column header.
    expect(screen.getAllByText('Calls').length).toBeGreaterThan(0);
    expect(screen.getByText('qwen3-coder-30b')).toBeInTheDocument();
  });

  it('filters rows by the selected aggregation window', async () => {
    mockFetchWithItems([
      row({ aggregation_key: 'model:a', window: '24h' }),
      row({ aggregation_key: 'model:b', window: '7d' }),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationCostBreakdownWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('a');
    expect(screen.queryByText('b')).not.toBeInTheDocument();
  });

  it('strips known model: prefix from the aggregation_key for display', async () => {
    mockFetchWithItems([row({ aggregation_key: 'model:deepseek-r1-32b' })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationCostBreakdownWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('deepseek-r1-32b')).toBeInTheDocument();
  });
});
