// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import CostByModelBars from './CostByModelBars';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });


describe('CostByModelBars (T17)', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <CostByModelBars config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when there is no cost data', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostByModelBars config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no cost data available/i)).toBeInTheDocument();
  });

  it('aggregates costs per model and renders one bar per model', async () => {
    // deepseek $3, claude $1, qwen $1 → total $5. Largest first.
    mockFetchWithItems([
      { bucket_time: '2026-04-20T01:00:00Z', model_name: 'deepseek-r1-32b', total_cost_usd: '2.00' },
      { bucket_time: '2026-04-20T02:00:00Z', model_name: 'deepseek-r1-32b', total_cost_usd: '1.00' },
      { bucket_time: '2026-04-20T03:00:00Z', model_name: 'claude-sonnet-4-6', total_cost_usd: '1.00' },
      { bucket_time: '2026-04-20T04:00:00Z', model_name: 'qwen3-coder-30b', total_cost_usd: '1.00' },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostByModelBars config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('deepseek-r1-32b')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    expect(screen.getByText('qwen3-coder-30b')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    // Bars expose role="meter" with aria-valuenow as the integer percentage.
    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(3);
    expect(meters[0].getAttribute('aria-valuenow')).toBe('60'); // deepseek 60%
  });
});
