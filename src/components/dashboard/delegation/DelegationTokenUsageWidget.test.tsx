import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationTokenUsageWidget from './DelegationTokenUsageWidget';
import { buildDelegationTokenUsage } from '@/storybook/fixtures/delegation-routing';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DelegationTokenUsageWidget', () => {
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
        <DelegationTokenUsageWidget config={{}} />
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
        <DelegationTokenUsageWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no token usage data/i)).toBeInTheDocument();
  });

  it('renders KPI tiles when data is present', async () => {
    mockFetchWithItems([buildDelegationTokenUsage()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationTokenUsageWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Total tokens')).toBeInTheDocument();
    expect(screen.getAllByText('Prompt').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completion').length).toBeGreaterThan(0);
    expect(screen.getByText('Est. cost')).toBeInTheDocument();
  });

  it('renders model names from fixture', async () => {
    mockFetchWithItems([buildDelegationTokenUsage()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationTokenUsageWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Total tokens');
    expect(screen.getByText('Qwen3-Coder-30B')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
  });

  it('renders provenance badges when showProvenance is true', async () => {
    mockFetchWithItems([buildDelegationTokenUsage()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationTokenUsageWidget config={{ showProvenance: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Total tokens');
    expect(screen.getAllByText('measured').length).toBeGreaterThan(0);
  });

  it('hides cost column when showCost is false', async () => {
    mockFetchWithItems([buildDelegationTokenUsage()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationTokenUsageWidget config={{ showCost: false }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Total tokens');
    expect(screen.queryByText('Est. cost')).not.toBeInTheDocument();
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([buildDelegationTokenUsage({ provisioned: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationTokenUsageWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Total tokens');
    expect(screen.getByText(/upstream-blocked/i)).toBeInTheDocument();
  });
});
