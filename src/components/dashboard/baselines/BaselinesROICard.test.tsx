import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BaselinesROICard from './BaselinesROICard';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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

describe('BaselinesROICard', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(<QueryClientProvider client={qc}><BaselinesROICard config={{}} /></QueryClientProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders delta metrics when data is available', async () => {
    mockFetchWithItems([{
      snapshotId: 'abc', capturedAt: '2026-04-10T06:00:00Z',
      tokenDelta: -12500, timeDeltaMs: -450, retryDelta: -3,
      recommendations: { promote: 4, shadow: 2, suppress: 1, fork: 0 },
      confidence: 0.87,
    }]);
    render(<QueryClientProvider client={qc}><BaselinesROICard config={{}} /></QueryClientProvider>);
    expect(await screen.findByText('-12,500')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows empty state when no snapshot available', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false });
    render(<QueryClientProvider client={qc}><BaselinesROICard config={{}} /></QueryClientProvider>);
    expect(await screen.findByText(/no baseline snapshot/i)).toBeInTheDocument();
  });
});
