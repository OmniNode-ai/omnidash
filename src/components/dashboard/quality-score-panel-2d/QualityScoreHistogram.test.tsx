// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import QualityScoreHistogram from './QualityScoreHistogram';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });


describe('QualityScoreHistogram (T18)', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScoreHistogram config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when totalMeasurements is zero', async () => {
    mockFetchWithItems([
      { meanScore: 0, totalMeasurements: 0, distribution: [] },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScoreHistogram config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no quality scores/i)).toBeInTheDocument();
  });

  it('renders 5 bars, threshold line, and mean marker against populated data', async () => {
    mockFetchWithItems([
      {
        meanScore: 0.72,
        totalMeasurements: 50,
        distribution: [
          { bucket: '1', count: 1 },
          { bucket: '2', count: 4 },
          { bucket: '3', count: 10 },
          { bucket: '4', count: 20 },
          { bucket: '5', count: 15 },
        ],
      },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScoreHistogram config={{ passThreshold: 0.8 }} />
      </DataSourceTestProvider>,
    );
    // Five bar meters.
    expect((await screen.findAllByRole('meter')).length).toBe(5);
    // Threshold + mean overlays.
    expect(screen.getByTestId('threshold-line')).toBeInTheDocument();
    expect(screen.getByTestId('mean-marker')).toBeInTheDocument();
    // Pass rate header — only the 0.8-1.0 bucket has score≥0.8 → 15/50 = 30%.
    expect(screen.getByText('30%')).toBeInTheDocument();
  });
});
