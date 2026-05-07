import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationQualityGateWidget from './DelegationQualityGateWidget';
import { buildDelegationQualityGate } from '@/storybook/fixtures/delegation-routing';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DelegationQualityGateWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(
      new Promise(() => {}),
    );
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no data', async () => {
    (fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ok: false,
    });
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no quality gate data/i)).toBeInTheDocument();
  });

  it('renders KPI tiles when data is present', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Pass rate')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Escalations')).toBeInTheDocument();
  });

  it('renders check type rows (deterministic + heuristic)', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.getByText('Deterministic')).toBeInTheDocument();
    expect(screen.getByText('Heuristic')).toBeInTheDocument();
  });

  it('renders failure categories when showFailureCategories is true', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{ showFailureCategories: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.getByText('Failure categories')).toBeInTheDocument();
    expect(screen.getByText('output_too_short')).toBeInTheDocument();
  });

  it('hides failure categories when showFailureCategories is false', async () => {
    mockFetchWithItems([buildDelegationQualityGate()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{ showFailureCategories: false }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.queryByText('Failure categories')).not.toBeInTheDocument();
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([buildDelegationQualityGate({ provisioned: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationQualityGateWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Pass rate');
    expect(screen.getByText(/upstream-blocked/i)).toBeInTheDocument();
  });
});
