import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationModelRoutingWidget from './DelegationModelRoutingWidget';
import { buildDelegationModelRouting } from '@/storybook/fixtures/delegation-routing';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DelegationModelRoutingWidget', () => {
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
        <DelegationModelRoutingWidget config={{}} />
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
        <DelegationModelRoutingWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no routing data/i)).toBeInTheDocument();
  });

  it('renders model names from fixture', async () => {
    mockFetchWithItems([buildDelegationModelRouting()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelRoutingWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Qwen3-Coder-30B')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
  });

  it('renders total delegation count', async () => {
    mockFetchWithItems([buildDelegationModelRouting()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelRoutingWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Qwen3-Coder-30B');
    expect(screen.getByText(/312 total delegations/i)).toBeInTheDocument();
  });

  it('renders column headers', async () => {
    mockFetchWithItems([buildDelegationModelRouting()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelRoutingWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Qwen3-Coder-30B');
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    // New columns
    expect(screen.getByText('Task Types')).toBeInTheDocument();
    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText('QG Pass')).toBeInTheDocument();
  });

  it('renders task type chips from fixture', async () => {
    mockFetchWithItems([buildDelegationModelRouting()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelRoutingWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Qwen3-Coder-30B');
    // Fixture provides task_types including 'code-review'
    expect(screen.getAllByText('code-review').length).toBeGreaterThan(0);
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([buildDelegationModelRouting({ provisioned: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelRoutingWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText('Qwen3-Coder-30B');
    expect(screen.getByText(/upstream-blocked/i)).toBeInTheDocument();
  });
});
