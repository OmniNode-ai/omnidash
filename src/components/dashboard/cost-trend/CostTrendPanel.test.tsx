import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CostTrendPanel from './CostTrendPanel';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Stub the three.js-backed chart so tests run in jsdom (no WebGL context).
// The stub exposes the data it would have rendered via data attributes
// so we can verify the outer component plumbed things through.
vi.mock('./StackedChart', () => ({
  StackedChart: ({ stacked, chartType }: {
    stacked: { buckets: string[]; visibleModels: string[] };
    chartType?: string;
  }) => (
    <div
      data-testid="stacked-chart"
      data-bucket-count={stacked.buckets.length}
      data-visible-models={stacked.visibleModels.length}
      data-chart-type={chartType ?? 'area'}
    />
  ),
}));

// Helper: mock FileSnapshotSource fetch pattern — index.json then each file
function mockFetchWithItems(items: unknown[]) {
  const fileNames = items.map((_, i) => `${i}.json`);
  const fileMap = new Map(fileNames.map((name, i) => [name, items[i]]));
  (fetch as any)
    .mockResolvedValueOnce({ ok: true, json: async () => fileNames })
    .mockImplementation((url: string) => {
      const filename = url.split('/').pop() ?? '';
      const item = fileMap.get(filename) ?? null;
      return Promise.resolve({ ok: true, json: async () => item });
    });
}

describe('CostTrendPanel', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <QueryClientProvider client={qc}>
        <CostTrendPanel config={{ granularity: 'day' }} />
      </QueryClientProvider>
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders chart when data is available', async () => {
    mockFetchWithItems([
      { bucket_time: '2026-04-01', model_name: 'claude-3', total_cost_usd: '12.50', total_tokens: 50000 },
      { bucket_time: '2026-04-02', model_name: 'claude-3', total_cost_usd: '15.00', total_tokens: 60000 },
    ]);
    render(
      <QueryClientProvider client={qc}>
        <CostTrendPanel config={{ granularity: 'day' }} />
      </QueryClientProvider>
    );
    // Wait for chart to render
    const chart = await screen.findByTestId('stacked-chart');
    expect(chart).toBeInTheDocument();
    expect(chart.getAttribute('data-bucket-count')).toBe('2');
    expect(chart.getAttribute('data-visible-models')).toBe('1');
    expect(chart.getAttribute('data-chart-type')).toBe('area');
  });

  it('plumbs chartType=bar from config into the chart component', async () => {
    mockFetchWithItems([
      { bucket_time: '2026-04-01', model_name: 'claude-3', total_cost_usd: '12.50', total_tokens: 50000 },
    ]);
    render(
      <QueryClientProvider client={qc}>
        <CostTrendPanel config={{ granularity: 'day', chartType: 'bar' }} />
      </QueryClientProvider>
    );
    const chart = await screen.findByTestId('stacked-chart');
    expect(chart.getAttribute('data-chart-type')).toBe('bar');
  });

  it('shows empty state when no data', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false });
    render(
      <QueryClientProvider client={qc}>
        <CostTrendPanel config={{ granularity: 'day' }} />
      </QueryClientProvider>
    );
    expect(await screen.findByText(/no cost data/i)).toBeInTheDocument();
  });
});
