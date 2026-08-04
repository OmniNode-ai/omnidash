import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContextHeatmap } from './useContextHeatmap';

// Force a live (http) data source so projectionUrl() resolves a backend
// origin instead of throwing in file mode — same pattern as
// event-dash-api.test.ts.
vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string, query?: string) =>
    query ? `/projection/${encodeURIComponent(topic)}?${query}` : `/projection/${encodeURIComponent(topic)}`,
}));

const mockAutoRefreshInterval = vi.fn<() => number | null | undefined>(() => 15_000);

vi.mock('@/store/store', () => ({
  useFrameStore: (selector: (s: { globalFilters: { autoRefreshInterval: number | null | undefined } }) => unknown) =>
    selector({ globalFilters: { autoRefreshInterval: mockAutoRefreshInterval() } }),
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function TestWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function dbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r1',
    run_id: 'run-1',
    correlation_id: 'c-1',
    task_id: 'task-A',
    run_order: 1,
    context_factor_subset: 'golden_exemplar',
    context_pack_hash: 'abc',
    attempt_count: 1,
    first_pass_success: true,
    final_success: true,
    failure_stage: 'none',
    prompt_tokens: 100,
    completion_tokens: 50,
    tokens_used: 150,
    estimated_cost: 0,
    model_id: 'qwen3-coder-30b',
    provider: 'local',
    endpoint_ref: 'local-coder',
    proof_class: 'runtime-observed-only',
    created_at: '2026-06-11T00:00:00Z',
    updated_at: '2026-06-11T00:00:00Z',
    ...overrides,
  };
}

describe('useContextHeatmap', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAutoRefreshInterval.mockReturnValue(15_000);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the live projection vocabulary (golden_exemplar/off) into renderable segments — regression guard for OMN-14895 D1', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rows: [dbRow({ context_factor_subset: 'golden_exemplar' }), dbRow({ context_factor_subset: 'off', id: 'r2' })],
        row_count: 2,
        data_freshness: 'fresh',
        latest_event_at: null,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContextHeatmap(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasAnyData).toBe(true);
    const segmentIds = result.current.segments.map((s) => s.id).sort();
    expect(segmentIds).toEqual(['golden_exemplar', 'off']);
    expect(result.current.cells.length).toBeGreaterThan(0);
  });

  it('reports zero renderable segments and no fabricated data when the live query returns zero rows (OMN-14895)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rows: [], row_count: 0, data_freshness: 'fresh', latest_event_at: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useContextHeatmap(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasAnyData).toBe(false);
    expect(result.current.segments).toHaveLength(0);
    expect(result.current.cells).toHaveLength(0);
    expect(result.current.scores).toHaveLength(0);
  });

  it('honors globalFilters.autoRefreshInterval === null as auto-refresh off (OMN-14895 D4)', async () => {
    mockAutoRefreshInterval.mockReturnValue(null);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [], row_count: 0, data_freshness: 'fresh', latest_event_at: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useContextHeatmap(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const query = client.getQueryCache().find({ queryKey: ['ev', 'experiments', 'context-scores', 'grid'] });
    const options = query?.options as { refetchInterval?: unknown } | undefined;
    expect(options?.refetchInterval).toBe(false);
  });
});
