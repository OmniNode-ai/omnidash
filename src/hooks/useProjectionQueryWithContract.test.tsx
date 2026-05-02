import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { useProjectionQueryWithContract, validateContractParams } from './useProjectionQuery';
import type { VisualizationContract } from '../../shared/types/visualization-contract';
import type { ReactNode } from 'react';

const testContract: VisualizationContract = {
  version: '1.0.0',
  topic: 'onex.snapshot.projection.test.v1',
  display_name: 'Test',
  default_visualization: 'bar_chart',
  available_visualizations: ['bar_chart'],
  controls: [],
  display_name_field: 'display_name',
  cost_field: 'cost_usd',
  latency_field: 'latency_ms',
  group_by: 'correlation_id',
  query_params: {
    run_selector: { field: 'correlation_id', param: 'run_id' },
  },
};

describe('validateContractParams', () => {
  it('throws on unknown param key', () => {
    expect(() =>
      validateContractParams({ unknown_param: 'value' }, testContract),
    ).toThrow('Undeclared query param: unknown_param');
  });

  it('accepts declared param key', () => {
    expect(() =>
      validateContractParams({ run_id: 'abc123' }, testContract),
    ).not.toThrow();
  });

  it('accepts undefined params', () => {
    expect(() => validateContractParams(undefined, testContract)).not.toThrow();
  });
});

describe('useProjectionQueryWithContract', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeWrapper = () =>
    ({ children }: { children: ReactNode }) => (
      <DataSourceTestProvider client={queryClient}>{children}</DataSourceTestProvider>
    );

  it('returns data with cursor, is_degraded, freshness from envelope', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ['0.json'] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ display_name: 'Qwen3', cost_usd: 0.001, latency_ms: 120, correlation_id: 'run-1' }),
      });

    const { result } = renderHook(
      () => useProjectionQueryWithContract({ topic: testContract.topic, contract: testContract }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.cursor).toBeNull();
    expect(result.current.is_degraded).toBe(false);
    expect(result.current.freshness).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('unwraps envelope shape { rows, cursor, is_degraded, freshness }', async () => {
    // HttpSnapshotSource with baseUrl would hit this path; here we simulate
    // via FileSnapshotSource returning an envelope-shaped JSON file.
    (fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ['0.json'] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rows: [{ display_name: 'Qwen3', cost_usd: 0.001, latency_ms: 120, correlation_id: 'run-1' }],
          cursor: 'page2',
          is_degraded: true,
          freshness: '2026-05-02T12:00:00Z',
        }),
      });

    const { result } = renderHook(
      () => useProjectionQueryWithContract({ topic: testContract.topic, contract: testContract }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.cursor).toBe('page2');
    expect(result.current.is_degraded).toBe(true);
    expect(result.current.freshness).toBe('2026-05-02T12:00:00Z');
  });

  it('throws synchronously on unknown param key', () => {
    expect(() => {
      renderHook(
        () =>
          useProjectionQueryWithContract({
            topic: testContract.topic,
            contract: testContract,
            params: { bad_param: 'value' },
          }),
        { wrapper: makeWrapper() },
      );
    }).toThrow('Undeclared query param: bad_param');
  });
});
