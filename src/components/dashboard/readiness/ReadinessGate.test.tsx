import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReadinessGate from './ReadinessGate';

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

describe('ReadinessGate', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(<QueryClientProvider client={qc}><ReadinessGate config={{}} /></QueryClientProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders 7 dimension cards', async () => {
    mockFetchWithItems([{
      dimensions: [
        { name: 'CI', status: 'PASS', detail: 'All green' },
        { name: 'Tests', status: 'PASS', detail: '98%' },
        { name: 'Coverage', status: 'WARN', detail: '72%' },
        { name: 'Contracts', status: 'PASS', detail: 'No drift' },
        { name: 'Dependencies', status: 'PASS', detail: 'No CVEs' },
        { name: 'Security', status: 'PASS', detail: 'Clean' },
        { name: 'Performance', status: 'WARN', detail: '420ms' },
      ],
      overallStatus: 'WARN',
      lastCheckedAt: '2026-04-10T11:45:00Z',
    }]);
    render(<QueryClientProvider client={qc}><ReadinessGate config={{}} /></QueryClientProvider>);
    for (const name of ['CI', 'Tests', 'Coverage', 'Contracts', 'Dependencies', 'Security', 'Performance']) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
    const warnElements = screen.getAllByText('WARN');
    expect(warnElements.length).toBeGreaterThan(0);
  });

  it('shows FAIL overall when any dimension is FAIL', async () => {
    mockFetchWithItems([{
      dimensions: [
        { name: 'CI', status: 'FAIL', detail: 'Workflow failed' },
        ...['Tests', 'Coverage', 'Contracts', 'Dependencies', 'Security', 'Performance'].map((n) => ({ name: n, status: 'PASS', detail: '' })),
      ],
      overallStatus: 'FAIL',
      lastCheckedAt: '2026-04-10T11:45:00Z',
    }]);
    render(<QueryClientProvider client={qc}><ReadinessGate config={{}} /></QueryClientProvider>);
    const failElements = await screen.findAllByText('FAIL');
    expect(failElements.length).toBeGreaterThan(0);
  });
});
