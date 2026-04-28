import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import QualityScorePanel from './QualityScoreTilted3D';

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
      <DataSourceTestProvider client={qc}>
        <QualityScorePanel config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('computes pass rate from bucket midpoints and the threshold', async () => {
    // Fixture matches the actual server shape: 5 buckets keyed by the
    // integer-string output of WIDTH_BUCKET (1..5), counts 2/3/5/10/10.
    // Widget midpoints (derived from BAR_COUNT=5) are 0.1/0.3/0.5/0.7/0.9.
    // Pass threshold default 0.8 → only the last bucket (midpoint 0.9,
    // count 10) qualifies. Pass rate = 10 / 30 ≈ 33%.
    mockFetchWithItems([{
      meanScore: 0.65,
      distribution: [
        { bucket: '1', count: 2 },
        { bucket: '2', count: 3 },
        { bucket: '3', count: 5 },
        { bucket: '4', count: 10 },
        { bucket: '5', count: 10 },
      ],
      totalMeasurements: 30,
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScorePanel config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('33%')).toBeInTheDocument();
    expect(screen.getByText(/0\.65/)).toBeInTheDocument();
    expect(screen.getByText(/30 measurements/)).toBeInTheDocument();
  });

  it('respects a custom passThreshold from config', async () => {
    // Same data but with threshold 0.6 → passing buckets have midpoint
    // ≥ 0.6, i.e. buckets 4 (count 10) + 5 (count 10) = 20 / 30 ≈ 67%.
    mockFetchWithItems([{
      meanScore: 0.65,
      distribution: [
        { bucket: '1', count: 2 },
        { bucket: '2', count: 3 },
        { bucket: '3', count: 5 },
        { bucket: '4', count: 10 },
        { bucket: '5', count: 10 },
      ],
      totalMeasurements: 30,
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScorePanel config={{ passThreshold: 0.6 }} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('67%')).toBeInTheDocument();
  });

  it('shows empty state when no measurements', async () => {
    mockFetchWithItems([{ meanScore: 0, distribution: [], totalMeasurements: 0 }]);
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScorePanel config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no quality data/i)).toBeInTheDocument();
  });
});
