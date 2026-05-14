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

    const result = await reader.readProjection('onex.snapshot.projection.unknown.v1');

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

    const result = await reader.readProjection('onex.snapshot.projection.delegation.decisions.v1');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ correlation_id: 'corr-1', model_name: 'qwen3' });
    expect(client.release).toHaveBeenCalled();
  });

  it('returns empty rows and logs error on connection failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getMockPool().connect.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await reader.readProjection('onex.snapshot.projection.delegation.decisions.v1');

    expect(result.rows).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('returns delegation summary with aggregated shape', async () => {
    const summaryRow = {
      total_events: '10', quality_passed_count: '8', quality_failed_count: '2',
      avg_latency_ms: '150', latest_event_at: '1234567890', total_savings_usd: '0',
    };
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [summaryRow] })
        .mockResolvedValueOnce({ rows: [{ taskType: 'code', count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ model: 'local', count: '10' }] }),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.readProjection('onex.snapshot.projection.delegation.summary.v1');

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as Record<string, unknown>;
    expect(row.totalDelegations).toBe(10);
    expect(row.qualityGatePassed).toBe(8);
    expect(row.qualityGatePassRate).toBeCloseTo(0.8);
    expect(Array.isArray(row.byTaskType)).toBe(true);
    expect(Array.isArray(row.byModel)).toBe(true);
  });

  it('releases client even on query error', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('query error')),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await reader.readProjection('onex.snapshot.projection.delegation.decisions.v1');

    expect(client.release).toHaveBeenCalled();
  });
});
