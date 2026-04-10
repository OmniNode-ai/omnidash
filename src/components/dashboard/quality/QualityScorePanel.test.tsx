import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QualityScorePanel from './QualityScorePanel';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('echarts-for-react', () => ({
  default: ({ option }: any) => <div data-testid="echarts-mock">chart-{option.series?.[0]?.data?.length ?? 0}</div>,
}));

describe('QualityScorePanel', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(<QueryClientProvider client={qc}><QualityScorePanel config={{}} /></QueryClientProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders bar chart with 5 distribution buckets', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        meanScore: 0.74,
        distribution: [
          { bucket: '0.0-0.2', count: 5 }, { bucket: '0.2-0.4', count: 12 },
          { bucket: '0.4-0.6', count: 34 }, { bucket: '0.6-0.8', count: 67 },
          { bucket: '0.8-1.0', count: 41 },
        ],
        totalMeasurements: 159,
      }),
    });
    render(<QueryClientProvider client={qc}><QualityScorePanel config={{}} /></QueryClientProvider>);
    expect(await screen.findByText('chart-5')).toBeInTheDocument();
    expect(screen.getByText(/0\.74/)).toBeInTheDocument();
  });

  it('shows empty state when no measurements', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ meanScore: 0, distribution: [], totalMeasurements: 0 }),
    });
    render(<QueryClientProvider client={qc}><QualityScorePanel config={{}} /></QueryClientProvider>);
    expect(await screen.findByText(/no quality data/i)).toBeInTheDocument();
  });
});
