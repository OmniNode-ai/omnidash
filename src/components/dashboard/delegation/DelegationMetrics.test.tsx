import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DelegationMetrics from './DelegationMetrics';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('echarts-for-react', () => ({
  default: ({ option }: any) => <div data-testid="echarts-mock">chart</div>,
}));

describe('DelegationMetrics', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => vi.restoreAllMocks());

  it('renders metrics when data is available', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalDelegations: 150,
        qualityGatePassRate: 0.85,
        totalSavingsUsd: 42.5,
        byTaskType: [{ taskType: 'code-review', count: 80 }, { taskType: 'refactor', count: 70 }],
      }),
    });
    render(
      <QueryClientProvider client={qc}>
        <DelegationMetrics config={{}} />
      </QueryClientProvider>
    );
    expect(await screen.findByText('150')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows empty state when no delegations', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ totalDelegations: 0, qualityGatePassRate: 0, totalSavingsUsd: 0, byTaskType: [] }),
    });
    render(
      <QueryClientProvider client={qc}>
        <DelegationMetrics config={{}} />
      </QueryClientProvider>
    );
    expect(await screen.findByText(/no delegation events/i)).toBeInTheDocument();
  });
});
