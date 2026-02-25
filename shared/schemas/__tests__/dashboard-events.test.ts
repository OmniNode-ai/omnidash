/**
 * Tests for dashboard-events schema utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeHealthStatus,
  HEALTH_THRESHOLDS,
  type ProjectedNode,
  type HealthStatus,
} from '../dashboard-events';

describe('computeHealthStatus', () => {
  const NOW = new Date('2026-01-25T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper to create a ProjectedNode with required fields
   */
  function createNode(overrides: Partial<ProjectedNode> = {}): ProjectedNode {
    return {
      node_id: '00000000-0000-0000-0000-000000000001',
      state: 'ACTIVE',
      last_event_at: NOW,
      ...overrides,
    };
  }

  describe('state-based logic', () => {
    it('returns unhealthy for OFFLINE nodes', () => {
      const node = createNode({ state: 'OFFLINE' });

      const result = computeHealthStatus(node);

      expect(result).toBe('unhealthy');
    });

    it('returns unhealthy for OFFLINE nodes regardless of heartbeat', () => {
      // Even with a recent heartbeat, OFFLINE state should return unhealthy
      const node = createNode({
        state: 'OFFLINE',
        last_heartbeat_at: NOW - 1000, // 1 second ago
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('unhealthy');
    });

    it('returns unknown for PENDING nodes', () => {
      const node = createNode({ state: 'PENDING' });

      const result = computeHealthStatus(node);

      expect(result).toBe('unknown');
    });

    it('returns unknown for PENDING nodes regardless of heartbeat', () => {
      // Even with a heartbeat, PENDING state should return unknown
      const node = createNode({
        state: 'PENDING',
        last_heartbeat_at: NOW - 5000, // 5 seconds ago
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('unknown');
    });
  });

  describe('heartbeat-based logic for ACTIVE nodes', () => {
    it('returns unknown when no heartbeat is present', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: undefined,
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('unknown');
    });

    it('returns healthy for heartbeat within 30 seconds', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW - 15_000, // 15 seconds ago
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('healthy');
    });

    it('returns healthy for heartbeat exactly at 30 seconds (boundary)', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW - HEALTH_THRESHOLDS.GREEN_MAX_AGE_MS, // exactly 30 seconds
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('healthy');
    });

    it('returns degraded for heartbeat just over 30 seconds', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW - HEALTH_THRESHOLDS.GREEN_MAX_AGE_MS - 1, // 30 seconds + 1ms
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('degraded');
    });

    it('returns degraded for heartbeat within 30-60 seconds', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW - 45_000, // 45 seconds ago
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('degraded');
    });

    it('returns degraded for heartbeat exactly at 60 seconds (boundary)', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW - HEALTH_THRESHOLDS.YELLOW_MAX_AGE_MS, // exactly 60 seconds
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('degraded');
    });

    it('returns unhealthy for heartbeat just over 60 seconds', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW - HEALTH_THRESHOLDS.YELLOW_MAX_AGE_MS - 1, // 60 seconds + 1ms
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('unhealthy');
    });

    it('returns unhealthy for heartbeat older than 60 seconds', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW - 120_000, // 2 minutes ago
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('unhealthy');
    });

    it('returns unhealthy for very stale heartbeat', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW - 86_400_000, // 24 hours ago
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('unhealthy');
    });
  });

  describe('edge cases', () => {
    it('returns healthy for heartbeat at exactly now (0ms age)', () => {
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW, // exactly now
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('healthy');
    });

    it('handles future heartbeat timestamp gracefully (negative age)', () => {
      // This shouldn't happen in practice, but if last_heartbeat_at is in the future,
      // the age would be negative and less than GREEN_MAX_AGE_MS
      const node = createNode({
        state: 'ACTIVE',
        last_heartbeat_at: NOW + 10_000, // 10 seconds in the future
      });

      const result = computeHealthStatus(node);

      expect(result).toBe('healthy');
    });
  });

  describe('threshold constants', () => {
    it('has GREEN_MAX_AGE_MS set to 30 seconds', () => {
      expect(HEALTH_THRESHOLDS.GREEN_MAX_AGE_MS).toBe(30_000);
    });

    it('has YELLOW_MAX_AGE_MS set to 60 seconds', () => {
      expect(HEALTH_THRESHOLDS.YELLOW_MAX_AGE_MS).toBe(60_000);
    });
  });

  describe('return type coverage', () => {
    it('can return all possible HealthStatus values', () => {
      const statuses: HealthStatus[] = [];

      // unhealthy from OFFLINE state
      statuses.push(computeHealthStatus(createNode({ state: 'OFFLINE' })));

      // unknown from PENDING state
      statuses.push(computeHealthStatus(createNode({ state: 'PENDING' })));

      // unknown from no heartbeat
      statuses.push(
        computeHealthStatus(createNode({ state: 'ACTIVE', last_heartbeat_at: undefined }))
      );

      // healthy from recent heartbeat
      statuses.push(
        computeHealthStatus(createNode({ state: 'ACTIVE', last_heartbeat_at: NOW - 10_000 }))
      );

      // degraded from aging heartbeat
      statuses.push(
        computeHealthStatus(createNode({ state: 'ACTIVE', last_heartbeat_at: NOW - 45_000 }))
      );

      // unhealthy from stale heartbeat
      statuses.push(
        computeHealthStatus(createNode({ state: 'ACTIVE', last_heartbeat_at: NOW - 90_000 }))
      );

      expect(statuses).toContain('healthy');
      expect(statuses).toContain('degraded');
      expect(statuses).toContain('unhealthy');
      expect(statuses).toContain('unknown');
    });
  });
});
