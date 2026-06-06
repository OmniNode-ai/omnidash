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

  it('renders the KPI row, model distribution, and task-type breakdown', async () => {
    // Distinct model vs task ratios so each rendered share string is unique.
    mockFetchWithItems([{
      totalDelegations: 150,
      qualityGatePassRate: 0.85,
      qualityGatePassed: 128,
      qualityGateTotal: 150,
      totalSavingsUsd: 42.5,
      avgLatencyMs: 1500,
      byTaskType: [{ taskType: 'code-review', count: 120 }, { taskType: 'refactor', count: 30 }],
      byModel: [{ model: 'Qwen3-Coder-30B', count: 105 }, { model: 'glm-4-plus', count: 45 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{}} />
      </DataSourceTestProvider>
    );
    // KPI tiles
    expect(await screen.findByText('150')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('128/150 local')).toBeInTheDocument();
    expect(screen.getByText('1.50s')).toBeInTheDocument();
    expect(screen.getByText('$42.50')).toBeInTheDocument();
    // Model distribution legend: short name + share. 105/150 = 70%, 45/150 = 30%.
    expect(screen.getByText('Qwen3-Coder-30B')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    // Task shares: 120/150 = 80%, 30/150 = 20%.
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    // No donut SVG / donut testids remain.
    expect(screen.queryByTestId('delegation-2d-donut')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delegation-2d-donut-svg')).not.toBeInTheDocument();
  });

  it('coerces string-typed counts from the Postgres projection before computing shares', async () => {
    // The Postgres projection serializes aggregate counts as strings; adding
    // them without coercion concatenates ("0" + "9" + "3" ...), which made
    // every share round to ~0%. Counts here are strings on purpose.
    mockFetchWithItems([{
      totalDelegations: 15,
      qualityGatePassRate: 0.53,
      qualityGatePassed: 8,
      qualityGateTotal: 15,
      totalSavingsUsd: 0,
      avgLatencyMs: 2100,
      byTaskType: [{ taskType: 'document', count: '9' }, { taskType: 'test', count: '6' }],
      byModel: [{ model: 'Qwen3-Coder-30B', count: '13' }, { model: 'claude-opus-4-6', count: '2' }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{}} />
      </DataSourceTestProvider>
    );
    // 13/15 = 87%, 2/15 = 13% — would be 9.8% / 1.5% if counts were concatenated.
    expect(await screen.findByText('87%')).toBeInTheDocument();
    expect(screen.getByText('13%')).toBeInTheDocument();
    // Task shares: 9/15 = 60%, 6/15 = 40%.
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
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
        <DelegationMetrics2D config={{}} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText(/no delegation events/i)).toBeInTheDocument();
  });

  it('hides the Savings tile when config.showSavings is false', async () => {
    mockFetchWithItems([{
      totalDelegations: 10,
      qualityGatePassRate: 0.9,
      qualityGatePassed: 9,
      qualityGateTotal: 10,
      totalSavingsUsd: 12.34,
      byTaskType: [{ taskType: 'a', count: 7 }],
      byModel: [{ model: 'Qwen3-Coder-30B', count: 7 }],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{ showSavings: false }} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.queryByText(/savings/i)).not.toBeInTheDocument();
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument();
  });

  it('hides the Quality Gate tile when config.showQualityGates is false', async () => {
    mockFetchWithItems([{
      totalDelegations: 10,
      qualityGatePassRate: 0.9,
      qualityGatePassed: 9,
      qualityGateTotal: 10,
      totalSavingsUsd: 5,
      byTaskType: [{ taskType: 'a', count: 7 }],
      byModel: [],
    }]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationMetrics2D config={{ showQualityGates: false }} />
      </DataSourceTestProvider>
    );
    expect(await screen.findByText('10')).toBeInTheDocument();
    expect(screen.queryByText(/quality gate/i)).not.toBeInTheDocument();
    expect(screen.queryByText('90%')).not.toBeInTheDocument();
  });

  it('config.qualityGateThreshold flips the pass-rate color from ok to warn when the rate falls below the threshold', async () => {
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
        <DelegationMetrics2D config={{ qualityGateThreshold: 0.8 }} />
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
        <DelegationMetrics2D config={{ qualityGateThreshold: 0.7 }} />
      </DataSourceTestProvider>
    );
    const ok = (await screen.findByText('75%')) as HTMLElement;
    expect(ok.style.color).toBe('var(--text-ok)');
  });
});
