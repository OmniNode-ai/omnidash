import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchContextExperimentScores,
  fetchDelegationDecisions,
  fetchNodeGenerations,
} from './event-dash-api';

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

/**
 * OMN-12999: the SEA / Event-Bus node-generation fetcher must request a bounded
 * latest-N window so the projection API does not serialize the full unbounded
 * heavy payload (contract_yaml / handler_source for every row), which stalled
 * the tiles at '—' for ~10-28 s against the live backend.
 */
describe('fetchNodeGenerations (OMN-12999 bounded read)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests a bounded latest-N window (limit + desc order)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rows: [], row_count: 0, data_freshness: 'fresh', latest_event_at: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchNodeGenerations();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('/projection/');
    expect(url).toContain('node-generation-completed.v1');
    expect(url).toContain('limit=50');
    expect(url).toContain('order=desc');
  });

  it('does not bound delegation decisions (unrelated fetcher stays param-less)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rows: [], row_count: 0, data_freshness: 'fresh', latest_event_at: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchDelegationDecisions();
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).not.toContain('limit=');
    expect(url).not.toContain('order=');
  });
});

/**
 * OMN-13016: the projection API emits data_freshness 'fresh' | 'stale' |
 * 'degraded' (OMN-10461 tiering: fresh <5m / stale 5-60m / degraded >60m).
 * Dropping 'stale' from the wire union collapsed populated-but-stale
 * envelopes to 'unknown', so FreshnessChip rendered "no data" for panels
 * that DO have data (observed live 2026-06-11 on delegation token-usage).
 */
describe('ProjectionFreshness stale handling (OMN-13016)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves stale freshness for populated projection envelopes', async () => {
    const row = { id: 'd1', correlation_id: 'c-1' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rows: [row],
          row_count: 1,
          data_freshness: 'stale',
          latest_event_at: '2026-06-11T16:42:45.902415+00:00',
        }),
      }),
    );

    const result = await fetchDelegationDecisions();
    expect(result.freshness).toBe('stale');
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([row]);
    expect(result.latestEventAt).toBe('2026-06-11T16:42:45.902415+00:00');
    // Stale is still non-fresh: panels keep their degraded affordance.
    expect(result.isDegraded).toBe(true);
  });

  it('still maps unrecognized freshness strings to unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [], row_count: 0, data_freshness: 'bogus', latest_event_at: null }),
      }),
    );

    const result = await fetchDelegationDecisions();
    expect(result.freshness).toBe('unknown');
    expect(result.isDegraded).toBe(true);
  });
});
