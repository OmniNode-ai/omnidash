import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchContextExperimentScores } from './event-dash-api';

// Force a live (http) data source so projectionUrl() resolves a backend origin
// instead of throwing in file mode.
vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string, query?: string) =>
    query ? `/projection/${encodeURIComponent(topic)}?${query}` : `/projection/${encodeURIComponent(topic)}`,
}));

describe('fetchContextExperimentScores', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the context experiment-scores projection topic', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rows: [], row_count: 0, data_freshness: 'fresh', latest_event_at: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchContextExperimentScores();
    expect(fetchMock).toHaveBeenCalledWith(
      '/projection/onex.snapshot.projection.context.experiment-scores.v1',
    );
  });

  it('normalizes a served envelope into typed rows', async () => {
    const dbRow = {
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
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [dbRow], row_count: 1, data_freshness: 'fresh', latest_event_at: '2026-06-11T00:00:00Z' }),
      }),
    );

    const result = await fetchContextExperimentScores();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].model_id).toBe('qwen3-coder-30b');
    expect(result.rows[0].tokens_used).toBe(150);
    expect(result.freshness).toBe('fresh');
    expect(result.isDegraded).toBe(false);
  });

  it('reports an honest degraded result on unknown_topic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'unknown_topic', available_topics: [] }),
      }),
    );
    const result = await fetchContextExperimentScores();
    expect(result.rows).toEqual([]);
    expect(result.isDegraded).toBe(true);
    expect(result.degradedReason).toContain('unknown_topic');
  });
});
