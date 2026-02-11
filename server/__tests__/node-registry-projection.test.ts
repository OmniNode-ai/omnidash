/**
 * NodeRegistryProjection Tests (OMN-2097)
 *
 * Covers:
 * - Event handling: introspection, heartbeat, state change, seed
 * - Monotonic merge: stale events rejected, fresher events applied
 * - Incremental stats: totalNodes, activeNodes, byState counters
 * - Bounded buffers: appliedEvents trimming, recentStateChanges cap
 * - Binary search: getEventsSince returns correct slices
 * - Snapshot: getSnapshot returns defensive copies
 * - Reset: clears all state
 * - Edge cases: unknown node heartbeat, unknown node state change, missing nodeId
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeRegistryProjection } from '../projections/node-registry-projection';
import { ProjectionService } from '../projection-service';
import type { ProjectionEvent } from '@shared/projection-types';

// ============================================================================
// Test Helpers
// ============================================================================

let seqCounter = 0;

function makeEvent(overrides: Partial<ProjectionEvent> & { type: string }): ProjectionEvent {
  const seq = ++seqCounter;
  return {
    id: `evt-${seq}`,
    eventTimeMs: Date.now(),
    ingestSeq: seq,
    topic: 'test-topic',
    source: 'test',
    severity: 'info',
    payload: {},
    ...overrides,
  };
}

function introspectionEvent(
  nodeId: string,
  overrides: Partial<ProjectionEvent> = {}
): ProjectionEvent {
  return makeEvent({
    type: 'node-introspection',
    payload: {
      nodeId,
      nodeType: 'COMPUTE',
      currentState: 'active',
      nodeVersion: '2.0.0',
    },
    ...overrides,
  });
}

function heartbeatEvent(nodeId: string, overrides: Partial<ProjectionEvent> = {}): ProjectionEvent {
  return makeEvent({
    type: 'node-heartbeat',
    payload: {
      nodeId,
      uptimeSeconds: 3600,
      memoryUsageMb: 256,
      cpuUsagePercent: 45,
    },
    ...overrides,
  });
}

function stateChangeEvent(
  nodeId: string,
  newState: string,
  overrides: Partial<ProjectionEvent> = {}
): ProjectionEvent {
  return makeEvent({
    type: 'node-state-change',
    payload: {
      nodeId,
      previousState: 'pending_registration',
      newState,
    },
    ...overrides,
  });
}

function seedEvent(
  nodes: Array<Record<string, unknown>>,
  overrides: Partial<ProjectionEvent> = {}
): ProjectionEvent {
  return makeEvent({
    type: 'node-registry-seed',
    payload: { nodes },
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('NodeRegistryProjection', () => {
  let projection: NodeRegistryProjection;

  beforeEach(() => {
    projection = new NodeRegistryProjection();
    seqCounter = 0;
  });

  // --------------------------------------------------------------------------
  // Introspection handling
  // --------------------------------------------------------------------------

  describe('handleIntrospection', () => {
    it('should create a new node from introspection event', () => {
      const applied = projection.applyEvent(introspectionEvent('node-1'));
      expect(applied).toBe(true);

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes).toHaveLength(1);
      expect(snapshot.payload.nodes[0].nodeId).toBe('node-1');
      expect(snapshot.payload.nodes[0].nodeType).toBe('COMPUTE');
      expect(snapshot.payload.nodes[0].state).toBe('active');
      expect(snapshot.payload.nodes[0].version).toBe('2.0.0');
    });

    it('should update existing node with new introspection data', () => {
      projection.applyEvent(introspectionEvent('node-1', { eventTimeMs: 1000, ingestSeq: 1 }));
      projection.applyEvent(
        introspectionEvent('node-1', {
          eventTimeMs: 2000,
          ingestSeq: 2,
          payload: {
            nodeId: 'node-1',
            nodeType: 'EFFECT',
            currentState: 'pending_registration',
            nodeVersion: '3.0.0',
          },
        })
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes).toHaveLength(1);
      expect(snapshot.payload.nodes[0].nodeType).toBe('EFFECT');
      expect(snapshot.payload.nodes[0].state).toBe('pending_registration');
      expect(snapshot.payload.nodes[0].version).toBe('3.0.0');
    });

    it('should reject event without nodeId', () => {
      const applied = projection.applyEvent(
        makeEvent({ type: 'node-introspection', payload: { nodeType: 'COMPUTE' } })
      );
      expect(applied).toBe(false);
    });

    it('should handle snake_case field names', () => {
      const applied = projection.applyEvent(
        makeEvent({
          type: 'node-introspection',
          payload: {
            node_id: 'snake-node',
            node_type: 'REDUCER',
            current_state: 'accepted',
            node_version: '1.5.0',
          },
        })
      );
      expect(applied).toBe(true);

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes[0].nodeId).toBe('snake-node');
      expect(snapshot.payload.nodes[0].nodeType).toBe('REDUCER');
      expect(snapshot.payload.nodes[0].state).toBe('accepted');
    });
  });

  // --------------------------------------------------------------------------
  // Heartbeat handling
  // --------------------------------------------------------------------------

  describe('handleHeartbeat', () => {
    it('should update health metrics on existing node', () => {
      projection.applyEvent(introspectionEvent('node-1', { eventTimeMs: 1000, ingestSeq: 1 }));
      projection.applyEvent(heartbeatEvent('node-1', { eventTimeMs: 2000, ingestSeq: 2 }));

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes[0].uptimeSeconds).toBe(3600);
      expect(snapshot.payload.nodes[0].memoryUsageMb).toBe(256);
      expect(snapshot.payload.nodes[0].cpuUsagePercent).toBe(45);
    });

    it('should create minimal entry for unknown node', () => {
      const applied = projection.applyEvent(heartbeatEvent('unknown-node'));
      expect(applied).toBe(true);

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes).toHaveLength(1);
      expect(snapshot.payload.nodes[0].nodeId).toBe('unknown-node');
      expect(snapshot.payload.nodes[0].state).toBe('active');
      expect(snapshot.payload.nodes[0].nodeType).toBe('COMPUTE');
    });

    it('should reject heartbeat without nodeId', () => {
      const applied = projection.applyEvent(
        makeEvent({ type: 'node-heartbeat', payload: { uptimeSeconds: 100 } })
      );
      expect(applied).toBe(false);
    });

    it('should handle snake_case health metrics', () => {
      projection.applyEvent(
        makeEvent({
          type: 'node-heartbeat',
          payload: {
            node_id: 'snake-hb',
            uptime_seconds: 999,
            memory_usage_mb: 128,
            cpu_usage_percent: 22,
          },
        })
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes[0].uptimeSeconds).toBe(999);
      expect(snapshot.payload.nodes[0].memoryUsageMb).toBe(128);
      expect(snapshot.payload.nodes[0].cpuUsagePercent).toBe(22);
    });
  });

  // --------------------------------------------------------------------------
  // State change handling
  // --------------------------------------------------------------------------

  describe('handleStateChange', () => {
    it('should update node state for existing node', () => {
      projection.applyEvent(introspectionEvent('node-1', { eventTimeMs: 1000, ingestSeq: 1 }));
      projection.applyEvent(
        stateChangeEvent('node-1', 'rejected', { eventTimeMs: 2000, ingestSeq: 2 })
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes[0].state).toBe('rejected');
    });

    it('should create minimal entry for unknown node on state change', () => {
      const applied = projection.applyEvent(stateChangeEvent('new-node', 'accepted'));
      expect(applied).toBe(true);

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes[0].nodeId).toBe('new-node');
      expect(snapshot.payload.nodes[0].state).toBe('accepted');
    });

    it('should track state change in recentStateChanges', () => {
      projection.applyEvent(stateChangeEvent('node-1', 'active'));

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.recentStateChanges).toHaveLength(1);
      expect(snapshot.payload.recentStateChanges[0].type).toBe('node-state-change');
    });

    it('should reject state change without newState', () => {
      const applied = projection.applyEvent(
        makeEvent({
          type: 'node-state-change',
          payload: { nodeId: 'node-1', previousState: 'pending_registration' },
        })
      );
      expect(applied).toBe(false);
    });

    it('should reject state change without nodeId', () => {
      const applied = projection.applyEvent(
        makeEvent({
          type: 'node-state-change',
          payload: { newState: 'active' },
        })
      );
      expect(applied).toBe(false);
    });

    it('should cap recentStateChanges at 100', () => {
      for (let i = 0; i < 120; i++) {
        projection.applyEvent(
          stateChangeEvent(`node-${i}`, 'active', {
            eventTimeMs: 1000 + i,
            ingestSeq: i + 1,
          })
        );
      }

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.recentStateChanges.length).toBeLessThanOrEqual(100);
    });

    it('should have most recent state change first in recentStateChanges', () => {
      projection.applyEvent(
        stateChangeEvent('node-a', 'active', { eventTimeMs: 1000, ingestSeq: 1 })
      );
      projection.applyEvent(
        stateChangeEvent('node-b', 'rejected', { eventTimeMs: 2000, ingestSeq: 2 })
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.recentStateChanges[0].payload.nodeId).toBe('node-b');
      expect(snapshot.payload.recentStateChanges[1].payload.nodeId).toBe('node-a');
    });
  });

  // --------------------------------------------------------------------------
  // Seed handling
  // --------------------------------------------------------------------------

  describe('handleSeed', () => {
    it('should bulk populate nodes from seed event', () => {
      projection.applyEvent(
        seedEvent([
          { nodeId: 'n1', nodeType: 'COMPUTE', state: 'active', version: '1.0.0' },
          { nodeId: 'n2', nodeType: 'EFFECT', state: 'pending_registration', version: '2.0.0' },
        ])
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes).toHaveLength(2);
      expect(snapshot.payload.stats.totalNodes).toBe(2);
    });

    it('should not overwrite fresher data with seed', () => {
      // First, apply an introspection with a real timestamp
      projection.applyEvent(
        introspectionEvent('node-1', {
          eventTimeMs: 5000,
          ingestSeq: 1,
          payload: {
            nodeId: 'node-1',
            nodeType: 'EFFECT',
            currentState: 'active',
            nodeVersion: '3.0.0',
          },
        })
      );

      // Then seed arrives (with sentinel timestamp 0 internally)
      projection.applyEvent(
        seedEvent(
          [
            {
              nodeId: 'node-1',
              nodeType: 'COMPUTE',
              state: 'pending_registration',
              version: '1.0.0',
            },
          ],
          { eventTimeMs: 0, ingestSeq: 2 }
        )
      );

      // Node should retain the fresher introspection data
      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes[0].nodeType).toBe('EFFECT');
      expect(snapshot.payload.nodes[0].state).toBe('active');
    });

    it('should reject seed with empty nodes array', () => {
      const applied = projection.applyEvent(seedEvent([]));
      expect(applied).toBe(false);
    });

    it('should reject seed without nodes array', () => {
      const applied = projection.applyEvent(makeEvent({ type: 'node-registry-seed', payload: {} }));
      expect(applied).toBe(false);
    });

    it('should skip seed entries without nodeId', () => {
      projection.applyEvent(
        seedEvent([
          { nodeId: 'valid', state: 'active' },
          { state: 'active' }, // missing nodeId — should be skipped
        ])
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes).toHaveLength(1);
      expect(snapshot.payload.nodes[0].nodeId).toBe('valid');
    });

    it('should deduplicate seed entries with the same nodeId (last-write-wins)', () => {
      projection.applyEvent(
        seedEvent([
          { nodeId: 'dup', nodeType: 'COMPUTE', state: 'pending_registration', version: '1.0.0' },
          { nodeId: 'dup', nodeType: 'EFFECT', state: 'active', version: '2.0.0' },
          { nodeId: 'unique', nodeType: 'COMPUTE', state: 'active', version: '1.0.0' },
        ])
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes).toHaveLength(2);
      expect(snapshot.payload.stats.totalNodes).toBe(2);

      const dupNode = snapshot.payload.nodes.find((n) => n.nodeId === 'dup');
      expect(dupNode).toBeDefined();
      // Last occurrence wins — nodeType should be EFFECT, not COMPUTE
      expect(dupNode!.nodeType).toBe('EFFECT');
      expect(dupNode!.state).toBe('active');
      expect(dupNode!.version).toBe('2.0.0');
    });

    it('should handle snake_case fields in seed data', () => {
      projection.applyEvent(
        seedEvent([
          {
            node_id: 'snake-seed',
            node_type: 'ORCHESTRATOR',
            state: 'active',
            uptime_seconds: 100,
            memory_usage_mb: 64,
            cpu_usage_percent: 10,
          },
        ])
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes[0].nodeId).toBe('snake-seed');
      expect(snapshot.payload.nodes[0].nodeType).toBe('ORCHESTRATOR');
    });
  });

  // --------------------------------------------------------------------------
  // Monotonic merge (stale event rejection)
  // --------------------------------------------------------------------------

  describe('monotonic merge', () => {
    it('should reject stale introspection events', () => {
      projection.applyEvent(introspectionEvent('node-1', { eventTimeMs: 2000, ingestSeq: 2 }));
      const applied = projection.applyEvent(
        introspectionEvent('node-1', {
          eventTimeMs: 1000,
          ingestSeq: 1,
          payload: { nodeId: 'node-1', nodeType: 'EFFECT', currentState: 'rejected' },
        })
      );

      expect(applied).toBe(false);

      // State should be unchanged
      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes[0].nodeType).toBe('COMPUTE');
      expect(snapshot.payload.nodes[0].state).toBe('active');
    });

    it('should reject stale heartbeat events', () => {
      projection.applyEvent(heartbeatEvent('node-1', { eventTimeMs: 2000, ingestSeq: 2 }));
      const applied = projection.applyEvent(
        heartbeatEvent('node-1', { eventTimeMs: 1000, ingestSeq: 1 })
      );
      expect(applied).toBe(false);
    });

    it('should reject stale state change events', () => {
      projection.applyEvent(
        stateChangeEvent('node-1', 'active', { eventTimeMs: 2000, ingestSeq: 2 })
      );
      const applied = projection.applyEvent(
        stateChangeEvent('node-1', 'rejected', { eventTimeMs: 1000, ingestSeq: 1 })
      );
      expect(applied).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Incremental stats
  // --------------------------------------------------------------------------

  describe('incremental stats', () => {
    it('should track totalNodes correctly', () => {
      projection.applyEvent(introspectionEvent('n1', { eventTimeMs: 1000, ingestSeq: 1 }));
      projection.applyEvent(introspectionEvent('n2', { eventTimeMs: 2000, ingestSeq: 2 }));

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.stats.totalNodes).toBe(2);
    });

    it('should track activeNodes correctly', () => {
      projection.applyEvent(
        introspectionEvent('n1', {
          eventTimeMs: 1000,
          ingestSeq: 1,
          payload: { nodeId: 'n1', currentState: 'active' },
        })
      );
      projection.applyEvent(
        introspectionEvent('n2', {
          eventTimeMs: 2000,
          ingestSeq: 2,
          payload: { nodeId: 'n2', currentState: 'pending_registration' },
        })
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.stats.activeNodes).toBe(1);
    });

    it('should track byState distribution', () => {
      projection.applyEvent(
        introspectionEvent('n1', {
          eventTimeMs: 1000,
          ingestSeq: 1,
          payload: { nodeId: 'n1', currentState: 'active' },
        })
      );
      projection.applyEvent(
        introspectionEvent('n2', {
          eventTimeMs: 2000,
          ingestSeq: 2,
          payload: { nodeId: 'n2', currentState: 'active' },
        })
      );
      projection.applyEvent(
        introspectionEvent('n3', {
          eventTimeMs: 3000,
          ingestSeq: 3,
          payload: { nodeId: 'n3', currentState: 'rejected' },
        })
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.stats.byState['active']).toBe(2);
      expect(snapshot.payload.stats.byState['rejected']).toBe(1);
    });

    it('should update stats on state transitions', () => {
      projection.applyEvent(
        introspectionEvent('n1', {
          eventTimeMs: 1000,
          ingestSeq: 1,
          payload: { nodeId: 'n1', currentState: 'active' },
        })
      );
      expect(projection.getSnapshot().payload.stats.activeNodes).toBe(1);

      projection.applyEvent(
        stateChangeEvent('n1', 'rejected', { eventTimeMs: 2000, ingestSeq: 2 })
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.stats.activeNodes).toBe(0);
      expect(snapshot.payload.stats.byState['rejected']).toBe(1);
      expect(snapshot.payload.stats.byState['active']).toBeUndefined();
    });

    it('should rebuild stats after seed', () => {
      projection.applyEvent(
        seedEvent([
          { nodeId: 'n1', state: 'active' },
          { nodeId: 'n2', state: 'active' },
          { nodeId: 'n3', state: 'pending_registration' },
        ])
      );

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.stats.totalNodes).toBe(3);
      expect(snapshot.payload.stats.activeNodes).toBe(2);
      expect(snapshot.payload.stats.byState['active']).toBe(2);
      expect(snapshot.payload.stats.byState['pending_registration']).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // getEventsSince (binary search)
  // --------------------------------------------------------------------------

  describe('getEventsSince', () => {
    it('should return events after the given cursor', () => {
      projection.applyEvent(introspectionEvent('n1', { eventTimeMs: 1000, ingestSeq: 1 }));
      projection.applyEvent(introspectionEvent('n2', { eventTimeMs: 2000, ingestSeq: 2 }));
      projection.applyEvent(introspectionEvent('n3', { eventTimeMs: 3000, ingestSeq: 3 }));

      const result = projection.getEventsSince(1);
      expect(result.events).toHaveLength(2);
      expect(result.events[0].ingestSeq).toBe(2);
      expect(result.events[1].ingestSeq).toBe(3);
    });

    it('should return empty when cursor is at head', () => {
      projection.applyEvent(introspectionEvent('n1', { eventTimeMs: 1000, ingestSeq: 1 }));
      const result = projection.getEventsSince(1);
      expect(result.events).toHaveLength(0);
    });

    it('should respect limit parameter', () => {
      for (let i = 1; i <= 10; i++) {
        projection.applyEvent(introspectionEvent(`n${i}`, { eventTimeMs: i * 1000, ingestSeq: i }));
      }

      const result = projection.getEventsSince(0, 3);
      expect(result.events).toHaveLength(3);
      expect(result.events[0].ingestSeq).toBe(1);
      expect(result.events[2].ingestSeq).toBe(3);
    });

    it('should return all events when cursor is 0', () => {
      projection.applyEvent(introspectionEvent('n1', { eventTimeMs: 1000, ingestSeq: 1 }));
      projection.applyEvent(introspectionEvent('n2', { eventTimeMs: 2000, ingestSeq: 2 }));

      const result = projection.getEventsSince(0);
      expect(result.events).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // getSnapshot
  // --------------------------------------------------------------------------

  describe('getSnapshot', () => {
    it('should return defensive copy of nodes', () => {
      projection.applyEvent(introspectionEvent('n1'));
      const snap1 = projection.getSnapshot();
      const snap2 = projection.getSnapshot();

      // Mutating snap1 should not affect snap2
      snap1.payload.nodes[0].nodeId = 'mutated';
      expect(snap2.payload.nodes[0].nodeId).toBe('n1');
    });

    it('should return defensive copy of stats', () => {
      projection.applyEvent(introspectionEvent('n1'));
      const snap = projection.getSnapshot();
      snap.payload.stats.totalNodes = 999;

      expect(projection.getSnapshot().payload.stats.totalNodes).toBe(1);
    });

    it('should respect limit option', () => {
      for (let i = 1; i <= 5; i++) {
        projection.applyEvent(introspectionEvent(`n${i}`, { eventTimeMs: i * 1000, ingestSeq: i }));
      }

      const snap = projection.getSnapshot({ limit: 2 });
      expect(snap.payload.nodes).toHaveLength(2);
    });

    it('should include viewId and cursor in response', () => {
      projection.applyEvent(introspectionEvent('n1', { ingestSeq: 42, eventTimeMs: 1000 }));
      const snap = projection.getSnapshot();
      expect(snap.viewId).toBe('node-registry');
      expect(snap.cursor).toBe(42);
    });
  });

  // --------------------------------------------------------------------------
  // Bounded appliedEvents buffer (batch trim)
  // --------------------------------------------------------------------------

  describe('appliedEvents buffer', () => {
    it('should retain events up to MAX + margin before trimming', () => {
      // Apply 550 events (under 500 + 100 margin = 600 threshold)
      for (let i = 1; i <= 550; i++) {
        projection.applyEvent(
          introspectionEvent(`n-${i % 50}`, { eventTimeMs: i * 10, ingestSeq: i })
        );
      }

      // All 550 should be retained (under trim threshold of 600)
      const result = projection.getEventsSince(0);
      expect(result.events.length).toBe(550);
    });

    it('should trim to MAX_APPLIED_EVENTS when exceeding margin', () => {
      // Apply 601 events (exceeds 500 + 100 = 600 threshold)
      for (let i = 1; i <= 601; i++) {
        projection.applyEvent(
          introspectionEvent(`n-${i % 50}`, { eventTimeMs: i * 10, ingestSeq: i })
        );
      }

      // Should have been trimmed to 500
      const result = projection.getEventsSince(0);
      expect(result.events.length).toBe(500);
      // Most recent event should be seq 601
      expect(result.events[result.events.length - 1].ingestSeq).toBe(601);
    });
  });

  // --------------------------------------------------------------------------
  // Unhandled event types
  // --------------------------------------------------------------------------

  describe('unhandled events', () => {
    it('should reject unknown event types', () => {
      const applied = projection.applyEvent(
        makeEvent({ type: 'unknown-type', payload: { nodeId: 'n1' } })
      );
      expect(applied).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('reset', () => {
    it('should clear all state', () => {
      projection.applyEvent(introspectionEvent('n1'));
      projection.applyEvent(stateChangeEvent('n1', 'active', { eventTimeMs: 2000, ingestSeq: 2 }));

      projection.reset();

      const snapshot = projection.getSnapshot();
      expect(snapshot.payload.nodes).toHaveLength(0);
      expect(snapshot.payload.recentStateChanges).toHaveLength(0);
      expect(snapshot.payload.stats.totalNodes).toBe(0);
      expect(snapshot.cursor).toBe(0);
    });

    it('should allow re-ingestion after reset', () => {
      projection.applyEvent(introspectionEvent('n1', { eventTimeMs: 1000, ingestSeq: 1 }));
      projection.reset();

      // Event with same eventTimeMs should now be accepted (merge tracker reset)
      const applied = projection.applyEvent(
        introspectionEvent('n1', { eventTimeMs: 1000, ingestSeq: 1 })
      );
      expect(applied).toBe(true);
      expect(projection.getSnapshot().payload.nodes).toHaveLength(1);
    });
  });
});
