import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationMetrics from './DelegationMetrics';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// jsdom has no WebGL context — stub the renderer so DoughnutChart's
// scene builder can execute without throwing. Same recipe used by
// CostByModelPie.test.tsx. The aggregation, slice-percentage, and
// empty-state branches still run for real, which is what these tests
// actually care about.
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


describe('DelegationMetrics', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders metrics when data is available', async () => {
    mockFetchWithItems([{
      totalDelegations: 150,
      qualityGatePassRate: 0.85,
      totalSavingsUsd: 42.5,
      byTaskType: [{ taskType: 'code-review', count: 80 }, { taskType: 'refactor', count: 70 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics config={{}} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText('150')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows empty state when no delegations', async () => {
    mockFetchWithItems([{
      totalDelegations: 0,
      qualityGatePassRate: 0,
      totalSavingsUsd: 0,
      byTaskType: [],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics config={{}} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText(/no delegation events/i)).toBeInTheDocument();
  });
});
