/**
 * Tests for useRegistryWebSocket Hook
 *
 * Tests critical behaviors:
 * - Event deduplication (same correlation_id should not create duplicate events)
 * - Event filtering (only registry event types should be processed)
 * - Stats tracking (totalEventsReceived, eventsByType, lastEventTime)
 * - clearEvents functionality
 * - Memory leak prevention (seenEventIds cleanup via SEEN_EVENT_IDS_CLEANUP_MULTIPLIER)
 * - Query invalidation on relevant events
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor as _waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';

// Mock dependencies before importing the hook
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockReconnect = vi.fn();
let mockOnMessage: ((message: any) => void) | undefined;

vi.mock('../useWebSocket', () => ({
  useWebSocket: vi.fn((options: { onMessage?: (message: any) => void }) => {
    // Capture the onMessage callback so we can call it in tests
    mockOnMessage = options.onMessage;
    return {
      isConnected: true,
      connectionStatus: 'connected' as const,
      error: null,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      reconnect: mockReconnect,
    };
  }),
}));

const mockInvalidateQueries = vi.fn();
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
} as unknown as QueryClient;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

// Import the hook after mocking dependencies
import {
  useRegistryWebSocket,
  DEFAULT_MAX_RECENT_EVENTS,
  SEEN_EVENT_IDS_CLEANUP_MULTIPLIER,
  type RegistryEventType,
} from '../useRegistryWebSocket';

describe('useRegistryWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMessage = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper to create a registry event message
   */
  function createEvent(
    type: RegistryEventType,
    correlationId: string,
    payload: Record<string, unknown> = {}
  ) {
    return {
      type,
      timestamp: new Date().toISOString(),
      data: {
        type,
        timestamp: new Date().toISOString(),
        correlation_id: correlationId,
        payload,
      },
    };
  }

  describe('initialization', () => {
    it('should return initial state with empty events and stats', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.error).toBeNull();
      expect(result.current.recentEvents).toEqual([]);
      expect(result.current.stats).toEqual({
        totalEventsReceived: 0,
        eventsByType: {},
        lastEventTime: null,
      });
    });

    it('should auto-subscribe to registry topics when connected', () => {
      renderHook(() => useRegistryWebSocket());

      expect(mockSubscribe).toHaveBeenCalledWith(['registry', 'registry-nodes']);
    });

    it('should not auto-subscribe when autoSubscribe is false', () => {
      renderHook(() => useRegistryWebSocket({ autoSubscribe: false }));

      expect(mockSubscribe).not.toHaveBeenCalled();
    });
  });

  describe('event filtering', () => {
    it('should process valid registry event types', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      const validTypes: RegistryEventType[] = [
        'NODE_REGISTERED',
        'NODE_STATE_CHANGED',
        'NODE_HEARTBEAT',
        'NODE_DEREGISTERED',
        'INSTANCE_HEALTH_CHANGED',
        'INSTANCE_ADDED',
        'INSTANCE_REMOVED',
      ];

      validTypes.forEach((type, index) => {
        act(() => {
          mockOnMessage?.(createEvent(type, `correlation-${index}`));
        });
      });

      expect(result.current.recentEvents).toHaveLength(validTypes.length);
      expect(result.current.stats.totalEventsReceived).toBe(validTypes.length);
    });

    it('should ignore non-registry event types', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      const nonRegistryTypes = [
        'UNKNOWN_EVENT',
        'AGENT_METRIC_UPDATE',
        'connection_ack',
        'ping',
        'pong',
        '',
      ];

      nonRegistryTypes.forEach((type, index) => {
        act(() => {
          mockOnMessage?.({
            type,
            timestamp: new Date().toISOString(),
            data: { correlation_id: `ignore-${index}` },
          });
        });
      });

      expect(result.current.recentEvents).toHaveLength(0);
      expect(result.current.stats.totalEventsReceived).toBe(0);
    });
  });

  describe('event deduplication', () => {
    it('should deduplicate events with the same correlation_id', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      const correlationId = 'duplicate-correlation-123';

      // Send the same event multiple times
      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', correlationId));
      });

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', correlationId));
      });

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', correlationId));
      });

      // Should only have one event
      expect(result.current.recentEvents).toHaveLength(1);
      expect(result.current.stats.totalEventsReceived).toBe(1);
      expect(result.current.recentEvents[0].correlationId).toBe(correlationId);
    });

    it('should allow events with different correlation_ids', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'correlation-1'));
      });

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'correlation-2'));
      });

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'correlation-3'));
      });

      expect(result.current.recentEvents).toHaveLength(3);
      expect(result.current.stats.totalEventsReceived).toBe(3);
    });

    it('should allow duplicate correlation_ids after clearEvents', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      const correlationId = 'reused-correlation';

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', correlationId));
      });

      expect(result.current.recentEvents).toHaveLength(1);

      // Clear events (which also clears seenEventIds)
      act(() => {
        result.current.clearEvents();
      });

      expect(result.current.recentEvents).toHaveLength(0);

      // Same correlation_id should now be accepted
      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', correlationId));
      });

      expect(result.current.recentEvents).toHaveLength(1);
    });
  });

  describe('stats tracking', () => {
    it('should track totalEventsReceived', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      for (let i = 0; i < 5; i++) {
        act(() => {
          mockOnMessage?.(createEvent('NODE_REGISTERED', `event-${i}`));
        });
      }

      expect(result.current.stats.totalEventsReceived).toBe(5);
    });

    it('should track eventsByType correctly', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'reg-1'));
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'reg-2'));
        mockOnMessage?.(createEvent('NODE_STATE_CHANGED', 'state-1'));
        mockOnMessage?.(createEvent('INSTANCE_ADDED', 'inst-1'));
        mockOnMessage?.(createEvent('INSTANCE_ADDED', 'inst-2'));
        mockOnMessage?.(createEvent('INSTANCE_ADDED', 'inst-3'));
      });

      expect(result.current.stats.eventsByType).toEqual({
        NODE_REGISTERED: 2,
        NODE_STATE_CHANGED: 1,
        INSTANCE_ADDED: 3,
      });
    });

    it('should update lastEventTime on each event', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      expect(result.current.stats.lastEventTime).toBeNull();

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'event-1'));
      });

      const firstEventTime = result.current.stats.lastEventTime;
      expect(firstEventTime).toBeInstanceOf(Date);

      // Advance time
      vi.advanceTimersByTime(1000);

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'event-2'));
      });

      const secondEventTime = result.current.stats.lastEventTime;
      expect(secondEventTime).toBeInstanceOf(Date);
      expect(secondEventTime!.getTime()).toBeGreaterThanOrEqual(firstEventTime!.getTime());
    });
  });

  describe('clearEvents functionality', () => {
    it('should clear all recent events', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'event-1'));
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'event-2'));
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'event-3'));
      });

      expect(result.current.recentEvents).toHaveLength(3);

      act(() => {
        result.current.clearEvents();
      });

      expect(result.current.recentEvents).toHaveLength(0);
    });

    it('should reset all stats', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'event-1'));
        mockOnMessage?.(createEvent('NODE_STATE_CHANGED', 'event-2'));
      });

      expect(result.current.stats.totalEventsReceived).toBe(2);
      expect(result.current.stats.lastEventTime).not.toBeNull();

      act(() => {
        result.current.clearEvents();
      });

      expect(result.current.stats).toEqual({
        totalEventsReceived: 0,
        eventsByType: {},
        lastEventTime: null,
      });
    });

    it('should clear seenEventIds allowing previously seen events', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      const correlationId = 'test-correlation';

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', correlationId));
      });

      // Try to add same event - should be deduplicated
      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', correlationId));
      });

      expect(result.current.recentEvents).toHaveLength(1);

      // Clear and try again
      act(() => {
        result.current.clearEvents();
      });

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', correlationId));
      });

      expect(result.current.recentEvents).toHaveLength(1);
    });
  });

  describe('memory leak prevention', () => {
    it('should respect maxRecentEvents option', () => {
      const maxRecentEvents = 5;
      const { result } = renderHook(() => useRegistryWebSocket({ maxRecentEvents }));

      // Add more events than the limit
      for (let i = 0; i < 10; i++) {
        act(() => {
          mockOnMessage?.(createEvent('NODE_REGISTERED', `event-${i}`));
        });
      }

      expect(result.current.recentEvents).toHaveLength(maxRecentEvents);
      // Most recent events should be first
      expect(result.current.recentEvents[0].correlationId).toBe('event-9');
    });

    it('should use DEFAULT_MAX_RECENT_EVENTS when not specified', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      // Add more events than the default limit
      for (let i = 0; i < DEFAULT_MAX_RECENT_EVENTS + 20; i++) {
        act(() => {
          mockOnMessage?.(createEvent('NODE_REGISTERED', `event-${i}`));
        });
      }

      expect(result.current.recentEvents).toHaveLength(DEFAULT_MAX_RECENT_EVENTS);
    });

    it('should cleanup seenEventIds when exceeding threshold to prevent memory leaks', () => {
      // Use small maxRecentEvents to make threshold easier to hit
      const maxRecentEvents = 10;
      const threshold = maxRecentEvents * SEEN_EVENT_IDS_CLEANUP_MULTIPLIER; // 50
      const { result } = renderHook(() => useRegistryWebSocket({ maxRecentEvents }));

      // Add events up to threshold - no cleanup yet
      for (let i = 0; i < threshold; i++) {
        act(() => {
          mockOnMessage?.(createEvent('NODE_REGISTERED', `event-${i}`));
        });
      }

      // The hook should have processed all events
      expect(result.current.stats.totalEventsReceived).toBe(threshold);

      // At this point, seenEventIds has exactly 50 IDs
      // Try to reuse event-0 - should be deduplicated (still in seenEventIds)
      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'event-0'));
      });
      expect(result.current.stats.totalEventsReceived).toBe(threshold); // No change - deduplicated

      // Add one more event to trigger cleanup (size > threshold)
      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', `event-${threshold}`));
      });

      // After cleanup, seenEventIds should only contain the last 10 event IDs
      expect(result.current.stats.totalEventsReceived).toBe(threshold + 1);

      // event-0 should have been pruned from seenEventIds during cleanup
      // (because it's no longer in the 10 most recent events)
      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'event-0'));
      });

      // This should now be accepted since event-0 was pruned from seenEventIds
      expect(result.current.stats.totalEventsReceived).toBe(threshold + 2);
    });

    it('should keep eventsByType bounded to 7 keys (one per RegistryEventType)', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      // Generate many events of all types
      const eventTypes: RegistryEventType[] = [
        'NODE_REGISTERED',
        'NODE_STATE_CHANGED',
        'NODE_HEARTBEAT',
        'NODE_DEREGISTERED',
        'INSTANCE_HEALTH_CHANGED',
        'INSTANCE_ADDED',
        'INSTANCE_REMOVED',
      ];

      for (let i = 0; i < 100; i++) {
        const type = eventTypes[i % eventTypes.length];
        act(() => {
          mockOnMessage?.(createEvent(type, `event-${i}`));
        });
      }

      // eventsByType should have at most 7 keys
      expect(Object.keys(result.current.stats.eventsByType).length).toBeLessThanOrEqual(7);
    });
  });

  describe('query invalidation', () => {
    it('should invalidate registry-discovery queries on NODE_REGISTERED', () => {
      renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'node-1'));
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['registry-discovery'],
      });
    });

    it('should invalidate registry-discovery queries on NODE_STATE_CHANGED', () => {
      renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_STATE_CHANGED', 'state-1'));
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['registry-discovery'],
      });
    });

    it('should invalidate registry-discovery queries on NODE_DEREGISTERED', () => {
      renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_DEREGISTERED', 'dereg-1'));
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['registry-discovery'],
      });
    });

    it('should invalidate registry-discovery queries on INSTANCE_HEALTH_CHANGED', () => {
      renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('INSTANCE_HEALTH_CHANGED', 'health-1'));
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['registry-discovery'],
      });
    });

    it('should invalidate registry-discovery queries on INSTANCE_ADDED', () => {
      renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('INSTANCE_ADDED', 'inst-add-1'));
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['registry-discovery'],
      });
    });

    it('should invalidate registry-discovery queries on INSTANCE_REMOVED', () => {
      renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('INSTANCE_REMOVED', 'inst-rem-1'));
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['registry-discovery'],
      });
    });

    it('should NOT invalidate queries on NODE_HEARTBEAT', () => {
      renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_HEARTBEAT', 'heartbeat-1'));
      });

      expect(mockInvalidateQueries).not.toHaveBeenCalled();
    });
  });

  describe('onEvent callback', () => {
    it('should call onEvent callback when event is received', () => {
      const onEvent = vi.fn();
      renderHook(() => useRegistryWebSocket({ onEvent }));

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'callback-1'));
      });

      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NODE_REGISTERED',
          correlation_id: 'callback-1',
        })
      );
    });

    it('should not call onEvent for duplicate events', () => {
      const onEvent = vi.fn();
      renderHook(() => useRegistryWebSocket({ onEvent }));

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'same-id'));
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'same-id'));
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'same-id'));
      });

      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it('should not call onEvent for filtered (non-registry) events', () => {
      const onEvent = vi.fn();
      renderHook(() => useRegistryWebSocket({ onEvent }));

      act(() => {
        mockOnMessage?.({
          type: 'UNKNOWN_EVENT',
          timestamp: new Date().toISOString(),
        });
      });

      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  describe('event structure', () => {
    it('should create RecentRegistryEvent with correct structure', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      const timestamp = new Date().toISOString();
      act(() => {
        mockOnMessage?.({
          type: 'NODE_REGISTERED',
          timestamp,
          data: {
            type: 'NODE_REGISTERED',
            timestamp,
            correlation_id: 'structure-test',
            payload: { node_id: 'node-123', name: 'test-node' },
          },
        });
      });

      const event = result.current.recentEvents[0];
      expect(event).toMatchObject({
        id: 'structure-test',
        type: 'NODE_REGISTERED',
        correlationId: 'structure-test',
        payload: { node_id: 'node-123', name: 'test-node' },
      });
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should order events with most recent first', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.(createEvent('NODE_REGISTERED', 'first'));
      });

      vi.advanceTimersByTime(100);

      act(() => {
        mockOnMessage?.(createEvent('NODE_STATE_CHANGED', 'second'));
      });

      vi.advanceTimersByTime(100);

      act(() => {
        mockOnMessage?.(createEvent('INSTANCE_ADDED', 'third'));
      });

      expect(result.current.recentEvents[0].correlationId).toBe('third');
      expect(result.current.recentEvents[1].correlationId).toBe('second');
      expect(result.current.recentEvents[2].correlationId).toBe('first');
    });
  });

  describe('error handling', () => {
    it('should handle malformed messages gracefully', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      // Should not throw for malformed messages
      act(() => {
        mockOnMessage?.(null as any);
      });

      act(() => {
        mockOnMessage?.(undefined as any);
      });

      act(() => {
        mockOnMessage?.({ type: 'NODE_REGISTERED' }); // Missing data
      });

      // Hook should remain stable
      expect(result.current.recentEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle events with invalid timestamps gracefully', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      act(() => {
        mockOnMessage?.({
          type: 'NODE_REGISTERED',
          timestamp: 'invalid-timestamp',
          data: {
            type: 'NODE_REGISTERED',
            timestamp: 'also-invalid',
            correlation_id: 'invalid-ts-test',
            payload: {},
          },
        });
      });

      // Should process the event (Date constructor handles invalid strings)
      expect(result.current.recentEvents.length).toBe(1);
    });
  });

  describe('reconnect functionality', () => {
    it('should expose reconnect function', () => {
      const { result } = renderHook(() => useRegistryWebSocket());

      expect(typeof result.current.reconnect).toBe('function');

      act(() => {
        result.current.reconnect();
      });

      expect(mockReconnect).toHaveBeenCalled();
    });
  });
});
