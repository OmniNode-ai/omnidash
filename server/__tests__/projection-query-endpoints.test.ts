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

describe('PostgresProjectionReader.queryLogEntries', () => {
  let reader: PostgresProjectionReader;

  beforeEach(() => {
    vi.clearAllMocks();
    reader = new PostgresProjectionReader({ connectionString: 'postgresql://test:test@localhost:5432/test' });
  });

  it('returns log entries with correct shape', async () => {
    const fakeRow = {
      entry_id: 'entry-1',
      timestamp: '2026-05-25T10:00:00.000Z',
      node_name: 'node_log_persistence_effect',
      function_name: 'handle',
      level: 'INFO',
      message: 'Log entry persisted',
      correlation_id: 'corr-abc',
      duration_ms: 42,
      metadata: { key: 'value' },
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [fakeRow] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.queryLogEntries({ correlation_id: 'corr-abc', limit: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entry_id: 'entry-1',
      node_name: 'node_log_persistence_effect',
      level: 'INFO',
      correlation_id: 'corr-abc',
      duration_ms: 42,
    });
    expect(typeof result[0].metadata).toBe('object');
    expect(client.release).toHaveBeenCalled();
  });

  it('builds WHERE clause from correlation_id filter', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryLogEntries({ correlation_id: 'corr-xyz' });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('correlation_id = $1'),
      expect.arrayContaining(['corr-xyz']),
    );
  });

  it('builds WHERE clause from node_name + level filters', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryLogEntries({ node_name: 'my_node', level: 'ERROR' });

    const [sql, params] = client.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('node_name = $1');
    expect(sql).toContain('level = $2');
    expect(params).toContain('my_node');
    expect(params).toContain('ERROR');
  });

  it('applies since filter as timestamp condition', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryLogEntries({ since: '2026-05-01T00:00:00Z' });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('timestamp >= $1'),
      expect.arrayContaining(['2026-05-01T00:00:00Z']),
    );
  });

  it('caps limit at 1000', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryLogEntries({ limit: 9999 });

    const [, params] = client.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBe(1000);
  });

  it('defaults limit to 100 when not specified', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryLogEntries({});

    const [, params] = client.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBe(100);
  });

  it('returns null for correlation_id when DB value is null', async () => {
    const fakeRow = {
      entry_id: 'entry-2',
      timestamp: '2026-05-25T11:00:00.000Z',
      node_name: 'some_node',
      function_name: 'run',
      level: 'DEBUG',
      message: 'no correlation',
      correlation_id: null,
      duration_ms: null,
      metadata: {},
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [fakeRow] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.queryLogEntries({});

    expect(result[0].correlation_id).toBeNull();
    expect(result[0].duration_ms).toBeNull();
  });

  it('releases client even on query error', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('db error')),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    await expect(reader.queryLogEntries({})).rejects.toThrow('db error');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('PostgresProjectionReader.queryTraces', () => {
  let reader: PostgresProjectionReader;

  beforeEach(() => {
    vi.clearAllMocks();
    reader = new PostgresProjectionReader({ connectionString: 'postgresql://test:test@localhost:5432/test' });
  });

  it('returns trace groups with correct shape', async () => {
    const recentTs = new Date(Date.now() - 10_000).toISOString();
    const fakeRow = {
      correlation_id: 'trace-1',
      nodes_involved: ['node_a', 'node_b'],
      event_count: '5',
      first_event_at: '2026-05-25T10:00:00.000Z',
      last_event_at: recentTs,
      duration_ms: '1234',
      has_error: false,
      latest_message: 'Done',
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [fakeRow] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.queryTraces({});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      correlation_id: 'trace-1',
      event_count: 5,
      has_error: false,
      latest_message: 'Done',
    });
    expect(Array.isArray(result[0].nodes_involved)).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('marks trace as is_running when last_event_at is within 60s', async () => {
    const recentTs = new Date(Date.now() - 30_000).toISOString();
    const fakeRow = {
      correlation_id: 'running-trace',
      nodes_involved: ['node_x'],
      event_count: '2',
      first_event_at: recentTs,
      last_event_at: recentTs,
      duration_ms: '0',
      has_error: false,
      latest_message: 'in progress',
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [fakeRow] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.queryTraces({});

    expect(result[0].is_running).toBe(true);
  });

  it('marks trace as not is_running when last_event_at is older than 60s', async () => {
    const oldTs = new Date(Date.now() - 120_000).toISOString();
    const fakeRow = {
      correlation_id: 'old-trace',
      nodes_involved: ['node_x'],
      event_count: '3',
      first_event_at: oldTs,
      last_event_at: oldTs,
      duration_ms: '5000',
      has_error: false,
      latest_message: 'finished',
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [fakeRow] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.queryTraces({});

    expect(result[0].is_running).toBe(false);
  });

  it('filters out non-running traces when running_only=true', async () => {
    const oldTs = new Date(Date.now() - 120_000).toISOString();
    const recentTs = new Date(Date.now() - 5_000).toISOString();
    const rows = [
      { correlation_id: 'old', nodes_involved: ['n'], event_count: '1', first_event_at: oldTs, last_event_at: oldTs, duration_ms: '0', has_error: false, latest_message: '' },
      { correlation_id: 'new', nodes_involved: ['n'], event_count: '2', first_event_at: recentTs, last_event_at: recentTs, duration_ms: '0', has_error: false, latest_message: '' },
    ];
    const client = { query: vi.fn().mockResolvedValue({ rows }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    const result = await reader.queryTraces({ running_only: true });

    expect(result).toHaveLength(1);
    expect(result[0].correlation_id).toBe('new');
  });

  it('applies since filter in SQL query', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryTraces({ since: '2026-05-01T00:00:00Z' });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('timestamp >= $1'),
      expect.arrayContaining(['2026-05-01T00:00:00Z']),
    );
  });

  it('caps limit at 500', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryTraces({ limit: 9999 });

    const [, params] = client.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBe(500);
  });

  it('defaults limit to 50', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryTraces({});

    const [, params] = client.query.mock.calls[0] as [string, unknown[]];
    expect(params[params.length - 1]).toBe(50);
  });

  it('always includes correlation_id IS NOT NULL condition', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.queryTraces({});

    const [sql] = client.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('correlation_id IS NOT NULL');
  });

  it('releases client even on query error', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('db gone')),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    await expect(reader.queryTraces({})).rejects.toThrow('db gone');
    expect(client.release).toHaveBeenCalled();
  });
});
