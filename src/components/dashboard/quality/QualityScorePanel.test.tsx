import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QualityScorePanel from './QualityScorePanel';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Stub three.js. jsdom has no WebGL context, and the component
// constructs a WebGLRenderer on mount. We replace it with a null
// instance whose methods are no-ops so the React effects run cleanly.
// Most of what we want to assert is outside the canvas anyway (stat
// pane contents + empty state), so this keeps the tests focused.
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

// jsdom doesn't implement ResizeObserver; the three.js widget observes
// its mount div to drive canvas sizing, so we shim a no-op here.
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('QualityScorePanel', () => {
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
        <QualityScorePanel config={{}} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('computes pass rate from bucket midpoints and the threshold', async () => {
    // Fixture: 30 measurements total. Buckets at midpoints 0.1/0.3/0.5/0.7/0.9
    // with counts 2/3/5/10/10. Pass threshold default 0.8 → passing buckets
    // are those with midpoint ≥ 0.8 = only bucket 4 (midpoint 0.9, count 10).
    // Pass rate = 10 / 30 ≈ 33%.
    mockFetchWithItems([{
      meanScore: 0.65,
      distribution: [
        { bucket: '0.0-0.2', count: 2 },
        { bucket: '0.2-0.4', count: 3 },
        { bucket: '0.4-0.6', count: 5 },
        { bucket: '0.6-0.8', count: 10 },
        { bucket: '0.8-1.0', count: 10 },
      ],
      totalMeasurements: 30,
    }]);
    render(
      <QueryClientProvider client={qc}>
        <QualityScorePanel config={{}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('33%')).toBeInTheDocument();
    expect(screen.getByText(/0\.65/)).toBeInTheDocument();
    expect(screen.getByText(/30 measurements/)).toBeInTheDocument();
  });

  it('respects a custom passThreshold from config', async () => {
    // Same data but with threshold 0.6 → passing buckets have midpoint
    // ≥ 0.6, i.e. buckets 3 (count 10) + 4 (count 10) = 20 / 30 ≈ 67%.
    mockFetchWithItems([{
      meanScore: 0.65,
      distribution: [
        { bucket: '0.0-0.2', count: 2 },
        { bucket: '0.2-0.4', count: 3 },
        { bucket: '0.4-0.6', count: 5 },
        { bucket: '0.6-0.8', count: 10 },
        { bucket: '0.8-1.0', count: 10 },
      ],
      totalMeasurements: 30,
    }]);
    render(
      <QueryClientProvider client={qc}>
        <QualityScorePanel config={{ passThreshold: 0.6 }} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('67%')).toBeInTheDocument();
  });

  it('shows empty state when no measurements', async () => {
    mockFetchWithItems([{ meanScore: 0, distribution: [], totalMeasurements: 0 }]);
    render(
      <QueryClientProvider client={qc}>
        <QualityScorePanel config={{}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/no quality data/i)).toBeInTheDocument();
  });
});
