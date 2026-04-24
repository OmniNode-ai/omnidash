import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CostByModelPie from './CostByModelPie';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Stub three.js WebGLRenderer — jsdom has no WebGL context. The scene
// builder still executes (so we exercise the aggregation / legend
// paths); render() and setSize() become no-ops.
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class FakeWebGLRenderer {
    domElement = (() => {
      const el = document.createElement('canvas');
      el.style.display = 'block';
      return el;
    })();
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    render() {}
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

describe('CostByModelPie', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(
      <QueryClientProvider client={qc}>
        <CostByModelPie config={{}} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('aggregates costs per model and shows each in the legend with its share', async () => {
    // deepseek: $3, claude: $1, qwen: $1 → total $5. Shares: 60 / 20 / 20.
    mockFetchWithItems([
      { bucket_time: '2026-04-20T01:00:00Z', model_name: 'deepseek-r1-32b', total_cost_usd: '2.00' },
      { bucket_time: '2026-04-20T02:00:00Z', model_name: 'deepseek-r1-32b', total_cost_usd: '1.00' },
      { bucket_time: '2026-04-20T03:00:00Z', model_name: 'claude-sonnet-4-6', total_cost_usd: '1.00' },
      { bucket_time: '2026-04-20T04:00:00Z', model_name: 'qwen3-coder-30b', total_cost_usd: '1.00' },
    ]);
    render(
      <QueryClientProvider client={qc}>
        <CostByModelPie config={{}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('deepseek-r1-32b')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    expect(screen.getByText('qwen3-coder-30b')).toBeInTheDocument();
    // Shares
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    // Both claude and qwen are 20% — getAllByText because two rows share
    expect(screen.getAllByText('20.0%').length).toBe(2);
    // Total
    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });

  it('shows empty state when no cost data at all', async () => {
    mockFetchWithItems([]);
    render(
      <QueryClientProvider client={qc}>
        <CostByModelPie config={{}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/no cost data available/i)).toBeInTheDocument();
  });
});
