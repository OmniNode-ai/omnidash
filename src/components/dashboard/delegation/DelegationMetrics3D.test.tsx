import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationMetrics from './DelegationMetrics3D';

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
      qualityGatePassed: 128,
      qualityGateTotal: 150,
      totalSavingsUsd: 42.5,
      byTaskType: [{ taskType: 'code-review', count: 80 }, { taskType: 'refactor', count: 70 }],
      byModel: [{ model: 'Qwen3-Coder-30B', count: 80 }, { model: 'glm-4-plus', count: 70 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics config={{}} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText('150')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('128 / 150 passed')).toBeInTheDocument();
    expect(screen.getByText('Qwen3-Coder-30B (80)')).toBeInTheDocument();
  });

  it('shows empty state when no delegations', async () => {
    mockFetchWithItems([{
      totalDelegations: 0,
      qualityGatePassRate: 0,
      qualityGatePassed: 0,
      qualityGateTotal: 0,
      totalSavingsUsd: 0,
      byTaskType: [],
      byModel: [],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics config={{}} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText(/no delegation events/i)).toBeInTheDocument();
  });

  // §8.B (review acceptance) — every config field a widget exposes
  // must actually be consumed. These tests pass each field through
  // and assert an observable effect.

  it('hides Cost Savings when config.showSavings is false', async () => {
    mockFetchWithItems([{
      totalDelegations: 10,
      qualityGatePassRate: 0.9,
      qualityGatePassed: 9,
      qualityGateTotal: 10,
      totalSavingsUsd: 12.34,
      byTaskType: [{ taskType: 'a', count: 10 }],
      byModel: [{ model: 'Qwen3-Coder-30B', count: 10 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics config={{ showSavings: false }} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.queryByText(/cost savings/i)).not.toBeInTheDocument();
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument();
  });

  it('hides Quality Gate Pass Rate when config.showQualityGates is false', async () => {
    mockFetchWithItems([{
      totalDelegations: 10,
      qualityGatePassRate: 0.9,
      qualityGatePassed: 9,
      qualityGateTotal: 10,
      totalSavingsUsd: 5,
      byTaskType: [{ taskType: 'a', count: 10 }],
      byModel: [],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics config={{ showQualityGates: false }} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.queryByText(/quality gate pass rate/i)).not.toBeInTheDocument();
    expect(screen.queryByText('90%')).not.toBeInTheDocument();
  });

  it('config.qualityGateThreshold flips the pass-rate color from ok to warn when the rate falls below the threshold', async () => {
    // Pass rate 0.75. With threshold 0.8 the rate reads `warn`
    // (--text-warn); with threshold 0.7 it reads `ok` (--text-ok).
    // The Text component sets `style.color` to a CSS var derived from
    // the `color` prop, so we assert against that rather than parsing
    // a class name. See src/components/ui/typography/Text.test.tsx for
    // the contract.
    mockFetchWithItems([{
      totalDelegations: 100,
      qualityGatePassRate: 0.75,
      qualityGatePassed: 75,
      qualityGateTotal: 100,
      totalSavingsUsd: 0,
      byTaskType: [{ taskType: 'a', count: 100 }],
      byModel: [],
    }]);
    const { unmount } = render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics config={{ qualityGateThreshold: 0.8 }} />
      </DataSourceTestProvider>
    );
    const warn = (await screen.findByText('75%')) as HTMLElement;
    expect(warn.style.color).toBe('var(--text-warn)');
    unmount();

    mockFetchWithItems([{
      totalDelegations: 100,
      qualityGatePassRate: 0.75,
      qualityGatePassed: 75,
      qualityGateTotal: 100,
      totalSavingsUsd: 0,
      byTaskType: [{ taskType: 'a', count: 100 }],
      byModel: [],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics config={{ qualityGateThreshold: 0.7 }} />
      </DataSourceTestProvider>
    );
    const ok = (await screen.findByText('75%')) as HTMLElement;
    expect(ok.style.color).toBe('var(--text-ok)');
  });
});
