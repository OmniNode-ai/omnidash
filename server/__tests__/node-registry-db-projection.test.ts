/**
 * Tests for NodeRegistryDbProjection (OMN-7127)
 *
 * Verifies:
 * - Correct payload shape with seeded data
 * - Empty table returns emptyPayload
 * - Missing table returns emptyPayload (graceful degradation)
 * - Stats are computed correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeRegistryDbProjection } from '../projections/node-registry-db-projection';
import { DbBackedProjectionView } from '../projections/db-backed-projection-view';

// Mock storage so tryGetIntelligenceDb returns our mock
const mockDb = {
  execute: vi.fn(),
};

vi.mock('../storage', () => ({
  tryGetIntelligenceDb: vi.fn(() => mockDb),
}));

describe('NodeRegistryDbProjection (OMN-7127)', () => {
  let projection: NodeRegistryDbProjection;

  beforeEach(() => {
    DbBackedProjectionView.resetInstances();
    projection = new NodeRegistryDbProjection();
    vi.clearAllMocks();
  });

  afterEach(() => {
    projection.reset();
  });

  it('has viewId node-registry-db', () => {
    expect(projection.viewId).toBe('node-registry-db');
  });

  it('returns correct payload shape with seeded data', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          service_name: 'node-effect-1',
          service_url: 'http://localhost:8085',
          service_type: 'EFFECT',
          health_status: 'active',
          last_health_check: '2026-03-31T10:00:00Z',
          metadata: { environment: 'local', description: 'Effect node' },
          is_active: true,
          updated_at: '2026-03-31T10:00:00Z',
        },
        {
          service_name: 'node-compute-1',
          service_url: 'http://localhost:8086',
          service_type: 'COMPUTE',
          health_status: 'active',
          last_health_check: '2026-03-31T09:55:00Z',
          metadata: null,
          is_active: true,
          updated_at: '2026-03-31T09:55:00Z',
        },
      ],
    });

    const payload = await projection.forceRefresh();

    expect(payload.nodes).toHaveLength(2);
    expect(payload.stats.totalNodes).toBe(2);
    expect(payload.stats.activeNodes).toBe(2);
    expect(payload.stats.byState).toEqual({ active: 2 });
    expect(payload.recentStateChanges).toEqual([]);

    // Verify first node shape
    const node1 = payload.nodes[0];
    expect(node1.nodeId).toBe('node-effect-1');
    expect(node1.nodeType).toBe('EFFECT');
    expect(node1.state).toBe('active');
    expect(node1.lastSeen).toBe('2026-03-31T10:00:00Z');
    expect(node1.metadata?.description).toBe('Effect node');
  });

  it('returns emptyPayload for empty table', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });

    const payload = await projection.forceRefresh();

    expect(payload.nodes).toEqual([]);
    expect(payload.stats.totalNodes).toBe(0);
    expect(payload.stats.activeNodes).toBe(0);
    expect(payload.stats.byState).toEqual({});
  });

  it('returns emptyPayload when table does not exist', async () => {
    const err = new Error('relation "node_service_registry" does not exist');
    (err as unknown as { code: string }).code = '42P01';
    mockDb.execute.mockRejectedValueOnce(err);

    const payload = await projection.forceRefresh();

    expect(payload.nodes).toEqual([]);
    expect(payload.stats.totalNodes).toBe(0);
  });

  it('normalizes node types correctly', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          service_name: 'orch-node',
          service_url: '',
          service_type: 'ORCHESTRATOR',
          health_status: 'active',
          last_health_check: null,
          metadata: null,
          is_active: true,
          updated_at: null,
        },
        {
          service_name: 'unknown-type-node',
          service_url: '',
          service_type: 'weird_type',
          health_status: 'active',
          last_health_check: null,
          metadata: null,
          is_active: true,
          updated_at: null,
        },
      ],
    });

    const payload = await projection.forceRefresh();

    expect(payload.nodes[0].nodeType).toBe('ORCHESTRATOR');
    expect(payload.nodes[1].nodeType).toBe('COMPUTE'); // falls back to COMPUTE
  });

  it('getSnapshot returns emptyPayload before first refresh', () => {
    const snapshot = projection.getSnapshot();

    expect(snapshot.viewId).toBe('node-registry-db');
    expect(snapshot.payload.nodes).toEqual([]);
    expect(snapshot.payload.stats.totalNodes).toBe(0);
  });
});
