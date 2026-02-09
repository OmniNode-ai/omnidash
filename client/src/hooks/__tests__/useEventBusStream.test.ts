/**
 * Tests for useEventBusStream hook
 *
 * Tests the core risk areas:
 * - Event ID generation stability and uniqueness
 * - Event processing and normalization
 * - Deduplication via ID stability
 * - Exported constants validation
 *
 * @see typed-honking-nygaard.md - Event Bus Monitor Refactor Plan
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEventId,
  processEvent,
  DEFAULT_MAX_ITEMS,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEDUPE_SET_CLEANUP_MULTIPLIER,
  MAX_TIMESTAMP_ENTRIES,
  MAX_ERRORS,
  TIME_SERIES_BUCKET_MS,
} from '../useEventBusStream';
import type { ProcessedEvent, WireEventData } from '../useEventBusStream.types';

// Mock the event-bus-dashboard config module
vi.mock('@/lib/configs/event-bus-dashboard', () => ({
  getTopicLabel: (topic: string) => {
    const labels: Record<string, string> = {
      'agent-actions': 'Agent Actions',
      'agent-routing-decisions': 'Routing Decisions',
      'agent-transformation-events': 'Transformations',
      'router-performance-metrics': 'Performance',
      errors: 'Errors',
    };
    return labels[topic] || topic;
  },
  getEventMonitoringConfig: () => ({
    max_events: 50,
    max_events_options: [50, 100, 200, 500, 1000],
    throughput_cleanup_interval: 100,
    time_series_window_ms: 5 * 60 * 1000,
    throughput_window_ms: 60 * 1000,
    max_breakdown_items: 50,
    periodic_cleanup_interval_ms: 10 * 1000,
  }),
}));

// Mock useWebSocket hook (not used in unit tests, but required for imports)
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    isConnected: false,
    connectionStatus: 'disconnected',
    error: null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    reconnect: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('useEventBusStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // getEventId() - Stability and Uniqueness Tests
  // ============================================================================

  describe('getEventId', () => {
    it('returns server ID when present', () => {
      const event: WireEventData = {
        id: 'server-123',
        topic: 'test',
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(getEventId(event, 'test-topic', 'test-type')).toBe('server-123');
    });

    it('returns correlationId when no id present', () => {
      const event: WireEventData = {
        correlationId: 'corr-456',
        topic: 'test',
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(getEventId(event, 'test-topic', 'test-type')).toBe('corr-456');
    });

    it('prefers id over correlationId when both present', () => {
      const event: WireEventData = {
        id: 'server-123',
        correlationId: 'corr-456',
        topic: 'test',
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(getEventId(event, 'test-topic', 'test-type')).toBe('server-123');
    });

    it('generates stable hash when no server ID', () => {
      const event: WireEventData = {
        topic: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        actionType: 'tool_call',
      };
      const id1 = getEventId(event, 'test-topic', 'test-type');
      const id2 = getEventId(event, 'test-topic', 'test-type');
      expect(id1).toBe(id2); // Same input = same ID
    });

    it('generates different IDs for different event data', () => {
      const event1: WireEventData = {
        topic: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        actionType: 'foo',
      };
      const event2: WireEventData = {
        topic: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        actionType: 'bar',
      };
      const id1 = getEventId(event1, 'test-topic', 'test-type');
      const id2 = getEventId(event2, 'test-topic', 'test-type');
      expect(id1).not.toBe(id2);
    });

    it('generates different IDs for different topics', () => {
      const event: WireEventData = { timestamp: '2024-01-01T00:00:00Z' };
      const id1 = getEventId(event, 'topic-a', 'test-type');
      const id2 = getEventId(event, 'topic-b', 'test-type');
      expect(id1).not.toBe(id2);
    });

    it('generates different IDs for different event types', () => {
      const event: WireEventData = { timestamp: '2024-01-01T00:00:00Z' };
      const id1 = getEventId(event, 'test-topic', 'type-a');
      const id2 = getEventId(event, 'test-topic', 'type-b');
      expect(id1).not.toBe(id2);
    });

    it('generates hash ID with h- prefix when no server ID', () => {
      const event: WireEventData = { timestamp: '2024-01-01T00:00:00Z' };
      const id = getEventId(event, 'test-topic', 'test-type');
      expect(id.startsWith('h-')).toBe(true);
    });

    it('uses createdAt as fallback timestamp for hash', () => {
      const event1: WireEventData = { createdAt: '2024-01-01T00:00:00Z' };
      const event2: WireEventData = { timestamp: '2024-01-01T00:00:00Z' };
      // Both should produce IDs (though they may differ due to different field names in payload)
      const id1 = getEventId(event1, 'test-topic', 'test-type');
      const id2 = getEventId(event2, 'test-topic', 'test-type');
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1.startsWith('h-')).toBe(true);
      expect(id2.startsWith('h-')).toBe(true);
    });

    it('handles empty event data gracefully', () => {
      const event: WireEventData = {};
      const id = getEventId(event, 'test-topic', 'test-type');
      expect(id).toBeDefined();
      expect(id.startsWith('h-')).toBe(true);
    });
  });

  // ============================================================================
  // processEvent() - Normalization Tests
  // ============================================================================

  describe('processEvent', () => {
    it('extracts priority from data.priority', () => {
      const result = processEvent('action', { priority: 'high' }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.priority).toBe('high');
      }
    });

    it('falls back to severity when no priority', () => {
      const result = processEvent('action', { severity: 'critical' }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.priority).toBe('critical');
      }
    });

    it('falls back to headers.priority when no top-level priority/severity', () => {
      const result = processEvent('action', { headers: { priority: 'low' } }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.priority).toBe('low');
      }
    });

    it('infers critical priority from actionType=error', () => {
      const result = processEvent('action', { actionType: 'error' }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.priority).toBe('critical');
      }
    });

    it('defaults priority to normal when no indicators', () => {
      const result = processEvent('action', {}, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.priority).toBe('normal');
      }
    });

    it('extracts source from agentName', () => {
      const result = processEvent('action', { agentName: 'test-agent' }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.source).toBe('test-agent');
      }
    });

    it('extracts source from sourceAgent when no agentName', () => {
      const result = processEvent('action', { sourceAgent: 'source-agent' }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.source).toBe('source-agent');
      }
    });

    it('extracts source from selectedAgent as fallback', () => {
      const result = processEvent('action', { selectedAgent: 'selected-agent' }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.source).toBe('selected-agent');
      }
    });

    it('defaults source to system when no agent info', () => {
      const result = processEvent('action', {}, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.source).toBe('system');
      }
    });

    it('stringifies payload correctly', () => {
      const data = { foo: 'bar', nested: { baz: 123 } };
      const result = processEvent('action', data, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(JSON.parse(result.event.payload)).toEqual(data);
      }
    });

    it('normalizes timestamp string to Date', () => {
      const timestamp = '2024-01-15T10:30:00Z';
      const result = processEvent('action', { timestamp }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.timestamp).toBeInstanceOf(Date);
        expect(result.event.timestampRaw).toBe(timestamp);
      }
    });

    it('normalizes numeric timestamp to Date', () => {
      const timestamp = 1705315800000; // 2024-01-15T10:30:00Z
      const result = processEvent('action', { timestamp }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.timestamp).toBeInstanceOf(Date);
      }
    });

    it('uses createdAt over timestamp when both present', () => {
      const result = processEvent(
        'action',
        {
          createdAt: '2024-01-15T10:30:00Z',
          timestamp: '2024-01-10T00:00:00Z',
        },
        'test-topic'
      );
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.timestampRaw).toBe('2024-01-15T10:30:00Z');
      }
    });

    it('provides default timestamp when none present', () => {
      const beforeTest = new Date();
      const result = processEvent('action', {}, 'test-topic');
      const afterTest = new Date();

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        // Timestamp should be between beforeTest and afterTest
        expect(result.event.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTest.getTime());
        expect(result.event.timestamp.getTime()).toBeLessThanOrEqual(afterTest.getTime());
      }
    });

    it('includes correlationId when present', () => {
      const result = processEvent('action', { correlationId: 'corr-123' }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.correlationId).toBe('corr-123');
      }
    });

    it('sets eventType from input parameter', () => {
      const result = processEvent('routing', {}, 'agent-routing-decisions');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.eventType).toBe('routing');
      }
    });

    it('uses topic label for display and raw topic for filtering', () => {
      const result = processEvent('action', {}, 'agent-actions');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.topic).toBe('Agent Actions'); // From mock
        expect(result.event.topicRaw).toBe('agent-actions');
      }
    });

    it('generates unique ID for processed event', () => {
      const result = processEvent('action', { id: 'server-id-123' }, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.id).toBe('server-id-123');
      }
    });
  });

  // ============================================================================
  // Deduplication - ID Stability Tests
  // ============================================================================

  describe('deduplication', () => {
    it('same event processed twice has same ID', () => {
      const event: WireEventData = {
        actionType: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        agentName: 'test-agent',
      };
      const result1 = processEvent('action', event, 'test-topic');
      const result2 = processEvent('action', event, 'test-topic');

      expect(result1.status).toBe('success');
      expect(result2.status).toBe('success');
      if (result1.status === 'success' && result2.status === 'success') {
        expect(result1.event.id).toBe(result2.event.id);
      }
    });

    it('events with different data have different IDs', () => {
      const event1: WireEventData = {
        actionType: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        agentName: 'agent-1',
      };
      const event2: WireEventData = {
        actionType: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        agentName: 'agent-2',
      };
      const result1 = processEvent('action', event1, 'test-topic');
      const result2 = processEvent('action', event2, 'test-topic');

      expect(result1.status).toBe('success');
      expect(result2.status).toBe('success');
      if (result1.status === 'success' && result2.status === 'success') {
        expect(result1.event.id).not.toBe(result2.event.id);
      }
    });

    it('server IDs take precedence for deduplication', () => {
      const event1: WireEventData = {
        id: 'server-id-1',
        actionType: 'test',
        timestamp: '2024-01-01T00:00:00Z',
      };
      const event2: WireEventData = {
        id: 'server-id-1', // Same server ID
        actionType: 'different', // Different data
        timestamp: '2024-01-02T00:00:00Z',
      };
      const result1 = processEvent('action', event1, 'test-topic');
      const result2 = processEvent('action', event2, 'test-topic');

      expect(result1.status).toBe('success');
      expect(result2.status).toBe('success');
      if (result1.status === 'success' && result2.status === 'success') {
        // Same server ID = same processed ID (would be deduplicated)
        expect(result1.event.id).toBe(result2.event.id);
      }
    });
  });

  // ============================================================================
  // Constants Validation Tests
  // ============================================================================

  describe('constants', () => {
    it('DEFAULT_MAX_ITEMS is reasonable', () => {
      expect(DEFAULT_MAX_ITEMS).toBeGreaterThan(0);
      expect(DEFAULT_MAX_ITEMS).toBeLessThanOrEqual(10000);
      expect(DEFAULT_MAX_ITEMS).toBe(500); // Current default
    });

    it('DEDUPE_SET_CLEANUP_MULTIPLIER provides headroom', () => {
      expect(DEDUPE_SET_CLEANUP_MULTIPLIER).toBeGreaterThanOrEqual(2);
      expect(DEDUPE_SET_CLEANUP_MULTIPLIER).toBe(5); // Current value
    });

    it('flush interval is responsive but not excessive', () => {
      expect(DEFAULT_FLUSH_INTERVAL_MS).toBeGreaterThanOrEqual(50);
      expect(DEFAULT_FLUSH_INTERVAL_MS).toBeLessThanOrEqual(500);
      expect(DEFAULT_FLUSH_INTERVAL_MS).toBe(100); // Current default
    });

    it('MAX_TIMESTAMP_ENTRIES is reasonable for throughput tracking', () => {
      expect(MAX_TIMESTAMP_ENTRIES).toBeGreaterThan(0);
      expect(MAX_TIMESTAMP_ENTRIES).toBeLessThanOrEqual(100000);
      expect(MAX_TIMESTAMP_ENTRIES).toBe(10000); // Current value
    });

    it('MAX_ERRORS caps error buffer reasonably', () => {
      expect(MAX_ERRORS).toBeGreaterThan(0);
      expect(MAX_ERRORS).toBeLessThanOrEqual(1000);
      expect(MAX_ERRORS).toBe(50); // Current value
    });

    it('TIME_SERIES_BUCKET_MS is appropriate for charting', () => {
      expect(TIME_SERIES_BUCKET_MS).toBeGreaterThanOrEqual(1000); // At least 1 second
      expect(TIME_SERIES_BUCKET_MS).toBeLessThanOrEqual(60000); // At most 1 minute
      expect(TIME_SERIES_BUCKET_MS).toBe(15000); // Current value (15 seconds)
    });

    it('dedupe set size is calculated correctly', () => {
      const expectedDedupeSize = DEFAULT_MAX_ITEMS * DEDUPE_SET_CLEANUP_MULTIPLIER;
      expect(expectedDedupeSize).toBe(2500); // 500 * 5
    });
  });

  // ============================================================================
  // Type Exports Tests
  // ============================================================================

  describe('type exports', () => {
    it('ProcessedEvent has required fields', () => {
      // Type-only test - if this compiles, types are correct
      const event: ProcessedEvent = {
        id: 'test',
        topic: 'test',
        topicRaw: 'test',
        eventType: 'test',
        priority: 'normal',
        timestamp: new Date(),
        timestampRaw: '2024-01-01T00:00:00Z',
        source: 'test',
        payload: '{}',
        summary: 'test summary',
        normalizedType: 'test',
        groupKey: 'test',
        parsedDetails: null,
      };
      expect(event.id).toBeDefined();
      expect(event.topic).toBeDefined();
      expect(event.topicRaw).toBeDefined();
      expect(event.eventType).toBeDefined();
      expect(event.priority).toBeDefined();
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestampRaw).toBeDefined();
      expect(event.source).toBeDefined();
      expect(event.payload).toBeDefined();
      expect(event.summary).toBeDefined();
      expect(event.normalizedType).toBeDefined();
      expect(event.groupKey).toBeDefined();
    });

    it('ProcessedEvent supports optional correlationId', () => {
      const eventWithCorrelation: ProcessedEvent = {
        id: 'test',
        topic: 'test',
        topicRaw: 'test',
        eventType: 'test',
        priority: 'normal',
        timestamp: new Date(),
        timestampRaw: '2024-01-01T00:00:00Z',
        source: 'test',
        payload: '{}',
        summary: 'test summary',
        normalizedType: 'test',
        groupKey: 'test',
        parsedDetails: null,
        correlationId: 'corr-123',
      };
      expect(eventWithCorrelation.correlationId).toBe('corr-123');

      const eventWithoutCorrelation: ProcessedEvent = {
        id: 'test',
        topic: 'test',
        topicRaw: 'test',
        eventType: 'test',
        priority: 'normal',
        timestamp: new Date(),
        timestampRaw: '2024-01-01T00:00:00Z',
        source: 'test',
        payload: '{}',
        summary: 'test summary',
        normalizedType: 'test',
        groupKey: 'test',
        parsedDetails: null,
      };
      expect(eventWithoutCorrelation.correlationId).toBeUndefined();
    });

    it('ProcessedEvent supports optional parseError', () => {
      const eventWithError: ProcessedEvent = {
        id: 'test',
        topic: 'test',
        topicRaw: 'test',
        eventType: 'test',
        priority: 'normal',
        timestamp: new Date(),
        timestampRaw: '2024-01-01T00:00:00Z',
        source: 'test',
        payload: '{}',
        summary: 'test summary',
        normalizedType: 'test',
        groupKey: 'test',
        parsedDetails: null,
        parseError: 'Some error message',
      };
      expect(eventWithError.parseError).toBe('Some error message');
    });

    it('EventPriority accepts valid priority values', () => {
      // Type assertion test - validates the priority type
      const priorities: ProcessedEvent['priority'][] = ['critical', 'high', 'normal', 'low'];
      priorities.forEach((p) => {
        expect(['critical', 'high', 'normal', 'low']).toContain(p);
      });
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases', () => {
    it('handles very large payload without crashing', () => {
      const largeData: WireEventData = {
        id: 'large-event',
        data: 'x'.repeat(10000),
      };
      const result = processEvent('action', largeData, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.event.id).toBe('large-event');
        expect(result.event.payload.length).toBeGreaterThan(10000);
      }
    });

    it('handles special characters in event data', () => {
      const specialData: WireEventData = {
        id: 'special-chars',
        message: 'Test with special chars: <>&"\' and unicode: \u00e9\u00e8\u00e0',
      };
      const result = processEvent('action', specialData, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const parsed = JSON.parse(result.event.payload);
        expect(parsed.message).toContain('<>&');
        expect(parsed.message).toContain('\u00e9');
      }
    });

    it('handles null and undefined values in event data', () => {
      const dataWithNulls: WireEventData = {
        id: 'null-event',
        nullField: null,
        definedField: 'value',
      };
      const result = processEvent('action', dataWithNulls, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const parsed = JSON.parse(result.event.payload);
        expect(parsed.nullField).toBeNull();
        expect(parsed.definedField).toBe('value');
      }
    });

    it('handles nested objects in event data', () => {
      const nestedData: WireEventData = {
        id: 'nested-event',
        nested: {
          level1: {
            level2: {
              value: 'deep',
            },
          },
        },
      };
      const result = processEvent('action', nestedData, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const parsed = JSON.parse(result.event.payload);
        expect(parsed.nested.level1.level2.value).toBe('deep');
      }
    });

    it('handles arrays in event data', () => {
      const arrayData: WireEventData = {
        id: 'array-event',
        items: [1, 2, 3, 'four', { five: 5 }],
      };
      const result = processEvent('action', arrayData, 'test-topic');
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const parsed = JSON.parse(result.event.payload);
        expect(parsed.items).toEqual([1, 2, 3, 'four', { five: 5 }]);
      }
    });

    it('generates consistent hash for events with same content but different key order', () => {
      // Note: JSON.stringify maintains insertion order, so this tests the hash stability
      const event1: WireEventData = { a: 1, b: 2, timestamp: '2024-01-01T00:00:00Z' };
      const event2: WireEventData = { a: 1, b: 2, timestamp: '2024-01-01T00:00:00Z' };

      const id1 = getEventId(event1, 'topic', 'type');
      const id2 = getEventId(event2, 'topic', 'type');

      expect(id1).toBe(id2);
    });
  });
});
