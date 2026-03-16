/**
 * Tests for bridge event Zod schemas.
 *
 * Validates that the Zod schemas in shared/schemas/bridge-events.ts
 * correctly accept valid payloads and reject invalid ones. Also tests
 * the defensive validateBridgeEmit helper.
 *
 * OMN-5163
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BridgeNodeIntrospectionSchema,
  BridgeNodeHeartbeatSchema,
  BridgeNodeStateChangeSchema,
  BridgeNodeBecameActiveSchema,
  BridgeNodeRegistryUpdateSchema,
  validateBridgeEmit,
} from '../../shared/schemas/bridge-events';

describe('BridgeNodeIntrospectionSchema', () => {
  it('accepts valid introspection payload', () => {
    const result = BridgeNodeIntrospectionSchema.safeParse({
      node_id: 'node-1',
      node_type: 'COMPUTE',
      version: '1.0.0',
      current_state: 'active',
      capabilities: [],
      metadata: {},
      endpoints: {},
      reason: null,
      event_bus: {},
      emitted_at: '2026-03-16T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal introspection payload (just node_id)', () => {
    const result = BridgeNodeIntrospectionSchema.safeParse({
      node_id: 'node-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects payload missing node_id', () => {
    const result = BridgeNodeIntrospectionSchema.safeParse({
      node_type: 'COMPUTE',
    });
    expect(result.success).toBe(false);
  });
});

describe('BridgeNodeHeartbeatSchema', () => {
  it('accepts valid heartbeat payload', () => {
    const result = BridgeNodeHeartbeatSchema.safeParse({
      id: 'abc-123',
      nodeId: 'node-1',
      uptimeSeconds: 300,
      activeOperationsCount: 5,
      memoryUsageMb: 128.5,
      cpuUsagePercent: 45.2,
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal heartbeat payload', () => {
    const result = BridgeNodeHeartbeatSchema.safeParse({
      nodeId: 'node-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects payload missing nodeId', () => {
    const result = BridgeNodeHeartbeatSchema.safeParse({
      uptimeSeconds: 300,
    });
    expect(result.success).toBe(false);
  });
});

describe('BridgeNodeStateChangeSchema', () => {
  it('accepts valid state change payload', () => {
    const result = BridgeNodeStateChangeSchema.safeParse({
      node_id: 'node-1',
      new_state: 'active',
      previous_state: 'pending_registration',
      emitted_at: '2026-03-16T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing new_state', () => {
    const result = BridgeNodeStateChangeSchema.safeParse({
      node_id: 'node-1',
    });
    expect(result.success).toBe(false);
  });
});

describe('BridgeNodeBecameActiveSchema', () => {
  it('accepts valid became-active payload', () => {
    const result = BridgeNodeBecameActiveSchema.safeParse({
      node_id: 'node-1',
      capabilities: { compute: true },
      emitted_at: '2026-03-16T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal payload', () => {
    const result = BridgeNodeBecameActiveSchema.safeParse({
      node_id: 'node-1',
    });
    expect(result.success).toBe(true);
  });
});

describe('BridgeNodeRegistryUpdateSchema', () => {
  it('accepts array of node records', () => {
    const result = BridgeNodeRegistryUpdateSchema.safeParse([
      { node_id: 'node-1', state: 'active' },
      { node_id: 'node-2', state: 'pending' },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts empty array', () => {
    const result = BridgeNodeRegistryUpdateSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it('rejects non-array', () => {
    const result = BridgeNodeRegistryUpdateSchema.safeParse({ nodes: [] });
    expect(result.success).toBe(false);
  });
});

describe('validateBridgeEmit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns validated data on success', () => {
    const data = { node_id: 'node-1' };
    const result = validateBridgeEmit(BridgeNodeIntrospectionSchema, data, 'test');
    expect(result).toEqual({ node_id: 'node-1' });
  });

  it('returns raw data and warns on validation failure', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalidData = { not_a_valid_field: true };
    const result = validateBridgeEmit(BridgeNodeIntrospectionSchema, invalidData, 'test');
    // Should return the raw data (defensive mode)
    expect(result).toBe(invalidData);
    // Should have warned
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArg = warnSpy.mock.calls[0][0] as string;
    expect(warnArg).toContain('bridge_emit_schema_violation');
    expect(warnArg).toContain('test');
  });
});
