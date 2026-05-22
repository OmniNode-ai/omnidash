import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import RoutingDecisionWidget from './RoutingDecisionWidget';
import { buildRoutingDecisionProjection } from '@/storybook/fixtures/routing-decision';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('RoutingDecisionWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <RoutingDecisionWidget />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders fallback data when projection is empty', async () => {
    (fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ ok: false });
    render(
      <DataSourceTestProvider client={qc}>
        <RoutingDecisionWidget />
      </DataSourceTestProvider>,
    );
    // Fallback task presets render in the selector — may appear in multiple places
    const matches = await screen.findAllByText(/palindrome checker/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders routing rules from projection data', async () => {
    const projection = buildRoutingDecisionProjection({ provisioned: true });
    mockFetchWithItems([projection]);
    render(
      <DataSourceTestProvider client={qc}>
        <RoutingDecisionWidget />
      </DataSourceTestProvider>,
    );
    // "Code generation" appears in both the routing rules table and the task selector
    const matches = await screen.findAllByText(/code generation/i);
    expect(matches.length).toBeGreaterThan(0);
    const classificationMatches = screen.getAllByText(/classification/i);
    expect(classificationMatches.length).toBeGreaterThan(0);
  });

  it('shows upstream-blocked notice when projection is not provisioned', async () => {
    const projection = buildRoutingDecisionProjection({ provisioned: false });
    mockFetchWithItems([projection]);
    render(
      <DataSourceTestProvider client={qc}>
        <RoutingDecisionWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/upstream-blocked/i)).toBeInTheDocument();
  });

  it('renders model name in decision trace', async () => {
    const projection = buildRoutingDecisionProjection({ provisioned: true });
    mockFetchWithItems([projection]);
    render(
      <DataSourceTestProvider client={qc}>
        <RoutingDecisionWidget />
      </DataSourceTestProvider>,
    );
    // The first task preset routes to qwen3-coder-30b
    expect(await screen.findByText('Qwen3-Coder-30B-A3B')).toBeInTheDocument();
  });
});
