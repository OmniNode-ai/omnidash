import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg before importing the reader
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return { Pool: vi.fn().mockImplementation(() => mockPool) };
});

import { Pool } from 'pg';
import { PostgresProjectionReader } from '../postgres-projection-reader.js';

type MockFn = ReturnType<typeof vi.fn>;
interface MockPool { connect: MockFn }

function getMockPool(): MockPool {
  return (Pool as unknown as MockFn).mock.results[0]?.value as MockPool;
}

describe('PostgresProjectionReader', () => {
  let reader: PostgresProjectionReader;

  beforeEach(() => {
    vi.clearAllMocks();
    reader = new PostgresProjectionReader({ connectionString: 'postgresql://test:test@localhost:5432/test' });
  });

  it('returns envelope with source=postgres and empty rows on unknown topic', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.unknown.v1', 'tenant-a');

    expect(result.source).toBe('postgres');
    expect(result.topic).toBe('onex.snapshot.projection.unknown.v1');
    expect(result.projection_version).toBe('078');
    expect(result.freshness).toBeNull();
    expect(result.rows).toEqual([]);
    expect(typeof result.generated_at).toBe('string');
  });

  it('returns delegation decisions rows', async () => {
    const fakeRow = {
      id: 1, correlation_id: 'corr-1', session_id: 'sess-1', task_type: 'code',
      delegated_to: 'local', model_name: 'qwen3', quality_gate_passed: true,
      quality_gate_detail: null, latency_ms: 200, created_at: new Date(),
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [fakeRow] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.delegation.decisions.v1', 'tenant-a');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ correlation_id: 'corr-1', model_name: 'qwen3' });
    expect(client.release).toHaveBeenCalled();
  });

  it('returns empty rows and logs error on connection failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getMockPool().connect.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await reader.readProjection('onex.snapshot.projection.delegation.decisions.v1', 'tenant-a');

    expect(result.rows).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('returns delegation summary with aggregated shape and projection-derived savings', async () => {
    const summaryRow = {
      total_events: '10', quality_passed_count: '8', quality_failed_count: '2',
      avg_latency_ms: '150', latest_event_at: '1234567890',
    };
    const client = {
      // Query order: summary aggregate, savings_estimates sum, byTaskType, byModel.
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [summaryRow] })
        .mockResolvedValueOnce({ rows: [{ total_savings_usd: '0.4242' }] })
        .mockResolvedValueOnce({ rows: [{ taskType: 'code', count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ model: 'local', count: '10' }] }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.delegation.summary.v1', 'tenant-a');

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect(row.totalDelegations).toBe(10);
    expect(row.qualityGatePassed).toBe(8);
    expect(row.qualityGatePassRate).toBeCloseTo(0.8);
    // total_savings_usd is summed from savings_estimates, NOT a hardcoded 0 (OMN-13355).
    expect(row.totalSavingsUsd).toBeCloseTo(0.4242);
    expect(row.total_savings_usd).toBeCloseTo(0.4242);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SUM(savings_usd)'), ['tenant-a']);
    expect(Array.isArray(row.byTaskType)).toBe(true);
    expect(Array.isArray(row.byModel)).toBe(true);
  });

  it('falls back to 0 savings when savings_estimates is not provisioned', async () => {
    const summaryRow = {
      total_events: '5', quality_passed_count: '5', quality_failed_count: '0',
      avg_latency_ms: '100', latest_event_at: '1234567890',
    };
    const missingTableErr = Object.assign(new Error('relation "savings_estimates" does not exist'), {
      code: '42P01',
    });
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [summaryRow] })
        .mockRejectedValueOnce(missingTableErr)
        .mockResolvedValueOnce({ rows: [{ taskType: 'code', count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ model: 'local', count: '5' }] }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.delegation.summary.v1', 'tenant-a');

    const row = result.rows[0] as Record<string, unknown>;
    expect(row.totalDelegations).toBe(5);
    expect(row.totalSavingsUsd).toBe(0);
    expect(row.total_savings_usd).toBe(0);
  });

  it('returns delegation savings projection with runtime token metrics', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            session_id: 'corr-live',
            task_type: 'test',
            model_name: 'qwen3-coder',
            local_cost_usd: '0',
            cloud_cost_usd: '0.009327',
            savings_usd: '0.009327',
            baseline_model: 'claude-opus-4.1',
            pricing_manifest_version: 'runtime-delegation-events',
            savings_method: 'measured',
            usage_source: 'measured',
            prompt_tokens: '144',
            completion_tokens: '593',
            tokens_to_compliance: '737',
            latency_ms: '3237',
            created_at: '2026-05-20T12:00:00.000Z',
          }],
        }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.delegation.savings.v1', 'tenant-a');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      cumulative_savings_usd: 0.009327,
      session_count: 1,
      provisioned: true,
    });
    const sessions = result.rows[0]!.sessions as Record<string, unknown>[];
    // Postgres returns numeric-looking strings; the reader coerces them to numbers.
    expect(sessions[0]).toMatchObject({
      session_id: 'corr-live',
      prompt_tokens: 144,
      completion_tokens: 593,
      tokens_to_compliance: 737,
    });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM savings_estimates'), ['tenant-a']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('to_jsonb(delegation_events)'), ['tenant-a']);
  });

  it('exposes the pinned premium counterfactual on delegation savings sessions (OMN-13355)', async () => {
    const counterfactual = {
      model: 'claude-opus-4-6',
      price_in_per_1k: '0.015',
      price_out_per_1k: '0.075',
      as_of: '2026-02-01',
      tokens_in: 144,
      tokens_out: 593,
      counterfactual_cost_usd: '0.046635',
      pricing_source: 'pricing_manifest',
      measured: false,
    };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            session_id: 'corr-cf',
            task_type: 'test',
            model_name: 'qwen3-coder',
            local_cost_usd: '0',
            cloud_cost_usd: '0.046635',
            savings_usd: '0.046635',
            baseline_model: 'claude-opus-4.1',
            pricing_manifest_version: 'runtime-delegation-events',
            savings_method: 'measured',
            usage_source: 'measured',
            prompt_tokens: '144',
            completion_tokens: '593',
            tokens_to_compliance: '737',
            latency_ms: '3237',
            created_at: '2026-05-20T12:00:00.000Z',
            premium_counterfactual: counterfactual,
          }],
        }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.delegation.savings.v1', 'tenant-a');

    const sessions = result.rows[0]!.sessions as Record<string, unknown>[];
    expect(sessions[0]!.premium_counterfactual).toMatchObject({
      model: 'claude-opus-4-6',
      as_of: '2026-02-01',
      counterfactual_cost_usd: '0.046635',
    });
    // The auditable column is read from the projection row.
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("e->'premium_counterfactual'"),
      ['tenant-a'],
    );
  });

  it('deduplicates materialized and runtime delegation savings rows by session', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            session_id: 'sess-merged',
            task_type: 'qwen3-coder',
            model_name: 'qwen3-coder',
            local_cost_usd: '0.001',
            cloud_cost_usd: '0.010',
            savings_usd: '0.009',
            baseline_model: 'claude-opus-4.1',
            pricing_manifest_version: 'pricing-v1',
            savings_method: 'measured',
            usage_source: 'estimated',
            prompt_tokens: '0',
            completion_tokens: '0',
            tokens_to_compliance: null,
            latency_ms: null,
            created_at: '2026-05-20T12:00:00.000Z',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            session_id: 'sess-merged',
            task_type: 'test',
            model_name: 'qwen3-coder',
            local_cost_usd: '0',
            cloud_cost_usd: '0.010',
            savings_usd: '0.010',
            baseline_model: 'claude-opus-4.1',
            pricing_manifest_version: 'runtime-delegation-events',
            savings_method: 'measured',
            usage_source: 'measured',
            prompt_tokens: '144',
            completion_tokens: '593',
            tokens_to_compliance: '737',
            latency_ms: '3237',
            created_at: '2026-05-20T12:01:00.000Z',
          }],
        }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.delegation.savings.v1', 'tenant-a');

    expect(result.rows[0]).toMatchObject({
      cumulative_savings_usd: 0.009,
      session_count: 1,
    });
    const sessions = result.rows[0]!.sessions as Record<string, unknown>[];
    expect(sessions).toHaveLength(1);
    // Postgres returns numeric-looking strings; the reader coerces them to numbers.
    expect(sessions[0]).toMatchObject({
      session_id: 'sess-merged',
      savings_usd: 0.009,
      prompt_tokens: 144,
      completion_tokens: 593,
      tokens_to_compliance: 737,
      latency_ms: 3237,
      created_at: '2026-05-20T12:01:00.000Z',
    });
  });

  it('returns cost savings overview projection from runtime delegation metrics', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            session_id: 'corr-live',
            task_type: 'test',
            model_name: 'qwen3-coder',
            local_cost_usd: '0',
            cloud_cost_usd: '0.009327',
            savings_usd: '0.009327',
            baseline_model: 'claude-opus-4.1',
            pricing_manifest_version: 'runtime-delegation-events',
            savings_method: 'measured',
            usage_source: 'measured',
            prompt_tokens: '144',
            completion_tokens: '593',
            tokens_to_compliance: '737',
            latency_ms: '3237',
            created_at: '2026-05-20T12:00:00.000Z',
          }],
        }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.cost.savings-overview.v1', 'tenant-a');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      window: '24h',
      total_cost_usd: 0,
      total_baseline_cost_usd: 0.009327,
      total_savings_usd: 0.009327,
      savings_rate: 1,
      tokens_total: 737,
      local_token_pct: 1,
      provisioned: true,
    });
    const overviewRows = result.rows[0]!.rows as Record<string, unknown>[];
    expect(overviewRows[0]).toMatchObject({
      display_name: 'qwen3-coder',
      execution_mode: 'delegated',
      task_count: 1,
      tokens_total: 737,
    });
    const recentRuns = result.rows[0]!.recent_runs as Record<string, unknown>[];
    expect(recentRuns[0]).toMatchObject({
      session_id: 'corr-live',
      task_type: 'test',
      total_tokens: 737,
      token_provenance: 'measured',
    });
    expect(result.rows[0]).toMatchObject({
      measured_run_count: 1,
      zero_token_run_count: 0,
    });
  });

  it('omits zero-token historical rows from recent delegation runs', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              session_id: 'corr-unmetered',
              task_type: 'test',
              model_name: 'qwen3-coder',
              local_cost_usd: '0',
              cloud_cost_usd: '0.004122',
              savings_usd: '0.004122',
              baseline_model: 'claude-opus-4.1',
              pricing_manifest_version: 'runtime-delegation-events',
              savings_method: 'measured',
              usage_source: 'unknown',
              prompt_tokens: '0',
              completion_tokens: '0',
              tokens_to_compliance: null,
              latency_ms: '1414',
              created_at: '2026-05-20T12:01:00.000Z',
            },
            {
              session_id: 'corr-metered',
              task_type: 'test',
              model_name: 'qwen3-coder',
              local_cost_usd: '0',
              cloud_cost_usd: '0.004122',
              savings_usd: '0.004122',
              baseline_model: 'claude-opus-4.1',
              pricing_manifest_version: 'runtime-delegation-events',
              savings_method: 'measured',
              usage_source: 'measured',
              prompt_tokens: '74',
              completion_tokens: '260',
              tokens_to_compliance: null,
              latency_ms: '1347',
              created_at: '2026-05-20T12:00:00.000Z',
            },
          ],
        }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.cost.savings-overview.v1', 'tenant-a');

    expect(result.rows[0]).toMatchObject({
      total_baseline_cost_usd: 0.004122,
      total_savings_usd: 0.004122,
      tokens_total: 334,
      measured_run_count: 1,
      zero_token_run_count: 1,
    });
    const overviewRows = result.rows[0]!.rows as Record<string, unknown>[];
    expect(overviewRows).toHaveLength(1);
    expect(overviewRows[0]).toMatchObject({
      display_name: 'qwen3-coder',
      task_count: 1,
      tokens_total: 334,
    });
    const recentRuns = result.rows[0]!.recent_runs as Record<string, unknown>[];
    expect(recentRuns).toHaveLength(1);
    expect(recentRuns[0]).toMatchObject({
      session_id: 'corr-metered',
      total_tokens: 334,
      token_provenance: 'measured',
    });
  });

  it('returns delegation token usage as the widget projection shape', async () => {
    const client = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [
          {
            model_id: 'local-qwen3',
            model_name: 'qwen3-coder',
            delegation_count: '4',
            prompt_tokens: '296',
            completion_tokens: '1040',
            total_tokens: '1336',
            estimated_cost_usd: '0',
          },
          {
            model_id: 'legacy-distill',
            model_name: 'distill',
            delegation_count: '53',
            prompt_tokens: '0',
            completion_tokens: '0',
            total_tokens: '0',
            estimated_cost_usd: '0',
          },
        ],
      }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.delegation.token-usage.v1', 'tenant-a');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      total_prompt_tokens: 296,
      total_completion_tokens: 1040,
      total_tokens: 1336,
      total_estimated_cost_usd: 0,
      provenance_summary: { measured: 1, estimated: 0, unknown: 0 },
      provisioned: true,
    });
    const byModel = result.rows[0]!.by_model as Record<string, unknown>[];
    expect(byModel).toHaveLength(1);
    expect(byModel[0]).toMatchObject({
      model_id: 'local-qwen3',
      model_name: 'qwen3-coder',
      prompt_tokens: 296,
      completion_tokens: 1040,
      total_tokens: 1336,
      estimated_cost_usd: 0,
      usage_source: 'measured',
      token_provenance: 'measured',
    });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM delegation_events'), ['tenant-a']);
  });

  it('returns MCP tools rows from node_service_registry metadata', async () => {
    const fakeRow = {
      name: 'node_sentiment_classifier',
      description: 'Classify customer review sentiment.',
      registeredAt: '2026-05-20T08:00:00.000Z',
      status: 'active',
      modelId: 'gemini-2.0-flash',
      correlationId: 'corr-mcp-1',
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [fakeRow] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.mcp-tools.v1', 'tenant-a');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject(fakeRow);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM node_service_registry'));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("metadata ? 'mcp_tool_name'"));
  });

  it('returns live event rows from bus and delegation runtime sources', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'corr-bus',
            type: 'ROUTING',
            timestamp: '2026-05-20T12:00:00.000Z',
            source: 'omnimarket',
            topic: 'onex.cmd.route.v1',
            summary: 'Routing qwen3',
            correlation_id: 'corr-bus',
            payload: '{"model":"qwen3"}',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'delegation-corr-runtime',
            type: 'DELEGATION_COMPLETED',
            timestamp: '2026-05-20T12:01:00.000Z',
            source: 'delegation_runtime',
            topic: 'onex.evt.delegation.completed.v1',
            summary: 'test delegated to qwen3-coder · 158 tokens · 505ms',
            correlation_id: 'corr-runtime',
            payload: '{"correlation_id":"corr-runtime"}',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.live-events.v1', 'tenant-a');

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      id: 'delegation-corr-runtime',
      type: 'DELEGATION_COMPLETED',
      source: 'delegation_runtime',
      correlation_id: 'corr-runtime',
    });
    expect(result.rows[1]).toMatchObject({
      id: 'corr-bus',
      type: 'ROUTING',
      source: 'omnimarket',
      correlation_id: 'corr-bus',
    });
  });

  it('returns canonical node-generation completed rows from generation_events', async () => {
    const fakeRow = {
      id: 'gen-1',
      correlation_id: 'corr-gen-1',
      task_description: 'Build an email validator node',
      provider: 'openai',
      model_id: 'gpt-5-mini',
      contract_passed: true,
      timestamp: '2026-05-20T08:10:00.000Z',
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [fakeRow] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.evt.omnimarket.node-generation-completed.v1', 'tenant-a');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject(fakeRow);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM generation_events'), ['tenant-a']);
  });

  it('releases client even on query error', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('query error')),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await reader.readProjection('onex.snapshot.projection.delegation.decisions.v1', 'tenant-a');

    expect(client.release).toHaveBeenCalled();
  });

  // ── Item C: Tenant isolation ───────────────────────────────────────────────
  describe('tenant isolation', () => {
    it('passes tenant_id as a query param on delegation decisions — never unfiltered', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.readProjection('onex.snapshot.projection.delegation.decisions.v1', 'tenant-xyz');

      const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(params).toEqual(['tenant-xyz']);
    });

    it('passes tenant_id on savings estimates — never unfiltered', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.readProjection('onex.snapshot.projection.savings.v1', 'tenant-xyz');

      const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(params).toEqual(['tenant-xyz']);
    });

    it('passes tenant_id on generation events — never unfiltered', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.readProjection('onex.evt.omnimarket.node-generation-completed.v1', 'tenant-xyz');

      const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(params).toEqual(['tenant-xyz']);
    });

    it('passes tenant_id on swarm runs — never unfiltered', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.readProjection('onex.snapshot.projection.swarm.runs.v1', 'tenant-xyz');

      const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(params).toEqual(['tenant-xyz']);
    });

    it('passes tenant_id on live-events delegation_event_log sub-query', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.readProjection('onex.snapshot.projection.live-events.v1', 'tenant-xyz');

      const calls = client.query.mock.calls as [string, unknown[]][];
      const eventLogCall = calls.find(([sql]) => sql.includes('delegation_event_log'));
      expect(eventLogCall).toBeDefined();
      expect(eventLogCall![0]).toContain('WHERE tenant_id = $1');
      expect(eventLogCall![1]).toEqual(['tenant-xyz']);
    });

    it('passes tenant_id on live-events delegation_events sub-query', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.readProjection('onex.snapshot.projection.live-events.v1', 'tenant-xyz');

      const calls = client.query.mock.calls as [string, unknown[]][];
      const delegationCall = calls.find(([sql]) => sql.includes('FROM delegation_events'));
      expect(delegationCall).toBeDefined();
      expect(delegationCall![0]).toContain('WHERE tenant_id = $1');
      expect(delegationCall![1]).toEqual(['tenant-xyz']);
    });

    it('passes tenant_id on live-events generation_events sub-query', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.readProjection('onex.snapshot.projection.live-events.v1', 'tenant-xyz');

      const calls = client.query.mock.calls as [string, unknown[]][];
      const genCall = calls.find(([sql]) => sql.includes('FROM generation_events'));
      expect(genCall).toBeDefined();
      expect(genCall![0]).toContain('WHERE tenant_id = $1');
      expect(genCall![1]).toEqual(['tenant-xyz']);
    });

    it('passes tenant_id on delegation token-usage — never unfiltered', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.readProjection('onex.snapshot.projection.delegation.token-usage.v1', 'tenant-xyz');

      const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(params).toEqual(['tenant-xyz']);
    });

    it('queryLogEntries filters by tenant_id when provided', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.queryLogEntries({}, 'tenant-xyz');

      const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('tenant_id = $1');
      expect(params[0]).toBe('tenant-xyz');
    });

    it('queryTraces filters by tenant_id when provided', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      getMockPool().connect.mockResolvedValue(client);

      await reader.queryTraces({}, 'tenant-xyz');

      const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('tenant_id = $1');
      expect(params[0]).toBe('tenant-xyz');
    });
  });
});
