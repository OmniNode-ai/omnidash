// @vitest-environment node
// OMN-13824 / OMN-1636: unit proof that PostgresProjectionReader scopes reads
// with the app.tenant_id GUC when a tenant context is active, and provably
// resets it before the connection returns to the pool. The DB-level RLS
// behavior is proven separately by tenant-rls.integration.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pg', () => {
  const mockClient = { query: vi.fn(), release: vi.fn() };
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return { Pool: vi.fn().mockImplementation(() => mockPool) };
});

import { Pool } from 'pg';
import { PostgresProjectionReader } from '../postgres-projection-reader.js';
import { runWithTenantContext } from '../auth/tenant-context.js';

type MockFn = ReturnType<typeof vi.fn>;
interface MockPool { connect: MockFn }

function getMockPool(): MockPool {
  return (Pool as unknown as MockFn).mock.results[0]?.value as MockPool;
}

describe('PostgresProjectionReader tenant scoping', () => {
  let reader: PostgresProjectionReader;

  beforeEach(() => {
    vi.clearAllMocks();
    reader = new PostgresProjectionReader({
      connectionString: 'postgresql://test:test@example.test:5432/test',
    });
  });

  it('does not touch the GUC when no tenant context is active', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await reader.readProjection('onex.snapshot.projection.savings.v1');

    const statements = client.query.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => s.includes('set_config'))).toBe(false);
    expect(statements.some((s) => s.includes('RESET'))).toBe(false);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('sets app.tenant_id before reading and RESETs it before pooling the connection', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await runWithTenantContext({ tenantId: 'tenant-a', subject: null }, () =>
      reader.readProjection('onex.snapshot.projection.savings.v1'),
    );

    const calls = client.query.mock.calls;
    expect(String(calls[0][0])).toContain("set_config('app.tenant_id', $1, false)");
    expect(calls[0][1]).toEqual(['tenant-a']);
    expect(String(calls[calls.length - 1][0])).toBe('RESET app.tenant_id');
    // Data query happened between GUC set and reset.
    expect(calls.length).toBeGreaterThan(2);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('scopes queryLogEntries the same way', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    getMockPool().connect.mockResolvedValue(client);

    await runWithTenantContext({ tenantId: 'tenant-b', subject: null }, () =>
      reader.queryLogEntries({ limit: 5 }),
    );

    expect(String(client.query.mock.calls[0][0])).toContain('set_config');
    expect(client.query.mock.calls[0][1]).toEqual(['tenant-b']);
  });

  it('destroys the connection instead of pooling it when the RESET fails', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.startsWith('RESET')) {
        return Promise.reject(new Error('connection lost'));
      }
      return Promise.resolve({ rows: [] });
    });
    getMockPool().connect.mockResolvedValue(client);

    await runWithTenantContext({ tenantId: 'tenant-a', subject: null }, () =>
      reader.readProjection('onex.snapshot.projection.savings.v1'),
    );

    // release(err) evicts the connection from the pool — a tenant-tainted
    // session must never be reused by another tenant's request.
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it('destroys the connection when the GUC cannot be set', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('boom')),
      release: vi.fn(),
    };
    getMockPool().connect.mockResolvedValue(client);

    // readProjection swallows read errors into an empty envelope by design.
    const result = await runWithTenantContext({ tenantId: 'tenant-a', subject: null }, () =>
      reader.readProjection('onex.snapshot.projection.savings.v1'),
    );

    expect(result.rows).toEqual([]);
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });
});
