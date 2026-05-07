import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationSavingsWidget from './DelegationSavingsWidget';
import { buildDelegationSavings } from '@/storybook/fixtures/delegation-routing';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DelegationSavingsWidget', () => {
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
        <DelegationSavingsWidget config={{}} />
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
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no delegation savings data/i)).toBeInTheDocument();
  });

  it('renders KPI tiles when data is present', async () => {
    mockFetchWithItems([buildDelegationSavings()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/est\. savings vs/i)).toBeInTheDocument();
    expect(screen.getByText('Local cost')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('renders pricing manifest version', async () => {
    mockFetchWithItems([buildDelegationSavings({ pricingManifestVersion: 'v2026-05-01' })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.getByText('v2026-05-01')).toBeInTheDocument();
  });

  it('renders session rows when showSessions is true', async () => {
    mockFetchWithItems([buildDelegationSavings({ sessionCount: 3 })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{ showSessions: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.getByText('Task Type')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    // New columns should be visible
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
  });

  it('shows task_type as row label when present', async () => {
    mockFetchWithItems([buildDelegationSavings({ sessionCount: 3 })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{ showSessions: true }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    // Fixture provides task_type 'code-review' for first session
    expect(screen.getByText('code-review')).toBeInTheDocument();
  });

  it('hides session rows when showSessions is false', async () => {
    mockFetchWithItems([buildDelegationSavings({ sessionCount: 3 })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{ showSessions: false }} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.queryByText('Task Type')).not.toBeInTheDocument();
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([buildDelegationSavings({ provisioned: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.getByText(/upstream-blocked/i)).toBeInTheDocument();
  });

  it('does not show upstream-blocked notice when provisioned is true', async () => {
    mockFetchWithItems([buildDelegationSavings({ provisioned: true })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationSavingsWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/est\. savings vs/i);
    expect(screen.queryByText(/upstream-blocked/i)).not.toBeInTheDocument();
  });
});
