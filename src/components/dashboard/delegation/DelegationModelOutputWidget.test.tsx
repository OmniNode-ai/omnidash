import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import DelegationModelOutputWidget from './DelegationModelOutputWidget';
import { buildInferenceResponseProjection } from '@/storybook/fixtures/delegation-routing';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('DelegationModelOutputWidget', () => {
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
        <DelegationModelOutputWidget config={{}} />
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
        <DelegationModelOutputWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no inference output/i)).toBeInTheDocument();
  });

  it('renders generated_text from fixture', async () => {
    mockFetchWithItems([buildInferenceResponseProjection()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelOutputWidget config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/The delegation routing/i)).toBeInTheDocument();
  });

  it('renders model identity from fixture', async () => {
    mockFetchWithItems([buildInferenceResponseProjection()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelOutputWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/The delegation routing/i);
    expect(screen.getByText(/qwen3-coder-30b/i)).toBeInTheDocument();
  });

  it('renders topic label', async () => {
    mockFetchWithItems([buildInferenceResponseProjection()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelOutputWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/The delegation routing/i);
    expect(screen.getByText(/onex\.evt\.omnibase-infra\.inference-response\.v1/i)).toBeInTheDocument();
  });

  it('shows upstream-blocked notice when provisioned is false', async () => {
    mockFetchWithItems([buildInferenceResponseProjection({ provisioned: false })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelOutputWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/The delegation routing/i);
    expect(screen.getByText(/upstream-blocked/i)).toBeInTheDocument();
  });

  it('does not show upstream notice when provisioned is true', async () => {
    mockFetchWithItems([buildInferenceResponseProjection({ provisioned: true })]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelOutputWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/The delegation routing/i);
    expect(screen.queryByText(/upstream-blocked/i)).not.toBeInTheDocument();
  });

  it('renders token count when present', async () => {
    mockFetchWithItems([buildInferenceResponseProjection()]);
    render(
      <DataSourceTestProvider client={qc}>
        <DelegationModelOutputWidget config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByText(/The delegation routing/i);
    // fixture provides completion_tokens
    expect(screen.getByText(/tokens/i)).toBeInTheDocument();
  });
});
