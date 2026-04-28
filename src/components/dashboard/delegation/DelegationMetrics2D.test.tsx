import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationMetrics2D from './DelegationMetrics2D';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('DelegationMetrics2D', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders metrics and donut when data is available', async () => {
    mockFetchWithItems([{
      totalDelegations: 150,
      qualityGatePassRate: 0.85,
      totalSavingsUsd: 42.5,
      byTaskType: [{ taskType: 'code-review', count: 80 }, { taskType: 'refactor', count: 70 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{}} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText('150')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByTestId('delegation-2d-donut')).toBeInTheDocument();
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
        <DelegationMetrics2D config={{}} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText(/no delegation events/i)).toBeInTheDocument();
  });

  it('hides Cost Savings when config.showSavings is false', async () => {
    mockFetchWithItems([{
      totalDelegations: 10,
      qualityGatePassRate: 0.9,
      totalSavingsUsd: 12.34,
      byTaskType: [{ taskType: 'a', count: 10 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{ showSavings: false }} />
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
      totalSavingsUsd: 5,
      byTaskType: [{ taskType: 'a', count: 10 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{ showQualityGates: false }} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.queryByText(/quality gate pass rate/i)).not.toBeInTheDocument();
    expect(screen.queryByText('90%')).not.toBeInTheDocument();
  });

  it('config.qualityGateThreshold flips the pass-rate color from ok to warn when the rate falls below the threshold', async () => {
    mockFetchWithItems([{
      totalDelegations: 100,
      qualityGatePassRate: 0.75,
      totalSavingsUsd: 0,
      byTaskType: [{ taskType: 'a', count: 100 }],
    }]);
    const { unmount } = render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{ qualityGateThreshold: 0.8 }} />
      </DataSourceTestProvider>
    );
    const warn = (await screen.findByText('75%')) as HTMLElement;
    expect(warn.style.color).toBe('var(--text-warn)');
    unmount();

    mockFetchWithItems([{
      totalDelegations: 100,
      qualityGatePassRate: 0.75,
      totalSavingsUsd: 0,
      byTaskType: [{ taskType: 'a', count: 100 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{ qualityGateThreshold: 0.7 }} />
      </DataSourceTestProvider>
    );
    const ok = (await screen.findByText('75%')) as HTMLElement;
    expect(ok.style.color).toBe('var(--text-ok)');
  });
});
