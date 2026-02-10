/**
 * EventBusProjection Tests (OMN-2095)
 *
 * Covers:
 * - Monotonic ordering: events sorted (eventTimeMs DESC, ingestSeq DESC)
 * - Buffer eviction: oldest events removed when exceeding MAX_BUFFER_SIZE
 * - Aggregate consistency: topicBreakdown, eventTypeBreakdown, timeSeries
 * - Incremental maintenance: counters increment/decrement correctly
 * - Rolling window: EPS calculation
 * - Edge cases: empty buffer, sentinel timestamps, reset
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EventBusProjection,
  MAX_BUFFER_SIZE,
  TIME_SERIES_BUCKET_MS,
} from '../projections/event-bus-projection';
import { ProjectionService, type RawEventInput } from '../projection-service';

// ============================================================================
// Test Helpers
// ============================================================================

let rawCounter = 0;

function makeRawEvent(overrides: Partial<RawEventInput> = {}): RawEventInput {
  return {
    id: `test-${++rawCounter}`,
    eventTimeMs: Date.now(),
    topic: 'test-topic',
    type: 'test-event',
    source: 'test-source',
    severity: 'info',
    payload: { data: 'test' },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('EventBusProjection', () => {
  let projection: EventBusProjection;
  let service: ProjectionService;

  beforeEach(() => {
    projection = new EventBusProjection();
    service = new ProjectionService();
    service.registerView(projection);
    rawCounter = 0;
  });

  // --------------------------------------------------------------------------
  // Basic Functionality
  // --------------------------------------------------------------------------

  describe('basic functionality', () => {
    it('should have viewId "event-bus"', () => {
      expect(projection.viewId).toBe('event-bus');
    });

    it('should accept all events', () => {
      const event = service.ingest(makeRawEvent());
      const applied = projection.bufferSize;
      expect(applied).toBe(1);
    });

    it('should track total ingested count', () => {
      service.ingestBatch([makeRawEvent(), makeRawEvent(), makeRawEvent()]);
      expect(projection.totalIngested).toBe(3);
    });

    it('should return snapshot with correct envelope', () => {
      service.ingest(makeRawEvent());
      const snapshot = projection.getSnapshot();

      expect(snapshot.viewId).toBe('event-bus');
      expect(snapshot.cursor).toBeGreaterThan(0);
      expect(snapshot.snapshotTimeMs).toBeGreaterThan(0);
      expect(snapshot.payload).toBeDefined();
      expect(snapshot.payload.events).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Monotonic Ordering
  // --------------------------------------------------------------------------

  describe('monotonic ordering', () => {
    it('should maintain events in (eventTimeMs DESC, ingestSeq DESC) order', () => {
      const now = Date.now();

      // Ingest events with varying timestamps
      service.ingest(makeRawEvent({ eventTimeMs: now - 2000 })); // oldest
      service.ingest(makeRawEvent({ eventTimeMs: now })); // newest
      service.ingest(makeRawEvent({ eventTimeMs: now - 1000 })); // middle

      const { payload } = projection.getSnapshot();
      const events = payload.events;

      // Should be sorted DESC: newest first
      expect(events).toHaveLength(3);
      expect(events[0].eventTimeMs).toBe(now);
      expect(events[1].eventTimeMs).toBe(now - 1000);
      expect(events[2].eventTimeMs).toBe(now - 2000);
    });

    it('should break ties by ingestSeq DESC', () => {
      const sameTime = Date.now();

      service.ingest(makeRawEvent({ eventTimeMs: sameTime }));
      service.ingest(makeRawEvent({ eventTimeMs: sameTime }));
      service.ingest(makeRawEvent({ eventTimeMs: sameTime }));

      const { payload } = projection.getSnapshot();
      const events = payload.events;

      // Same timestamp, higher ingestSeq first
      expect(events[0].ingestSeq).toBeGreaterThan(events[1].ingestSeq);
      expect(events[1].ingestSeq).toBeGreaterThan(events[2].ingestSeq);
    });

    it('should handle out-of-order timestamps via binary insert', () => {
      const now = Date.now();

      // Events arrive out of order
      service.ingest(makeRawEvent({ id: 'C', eventTimeMs: now - 3000 }));
      service.ingest(makeRawEvent({ id: 'A', eventTimeMs: now }));
      service.ingest(makeRawEvent({ id: 'B', eventTimeMs: now - 1000 }));

      const { payload } = projection.getSnapshot();
      const events = payload.events;

      expect(events[0].id).toBe('A'); // newest timestamp
      expect(events[1].id).toBe('B');
      expect(events[2].id).toBe('C'); // oldest timestamp
    });
  });

  // --------------------------------------------------------------------------
  // Buffer Eviction
  // --------------------------------------------------------------------------

  describe('buffer eviction', () => {
    it('should evict oldest event when exceeding MAX_BUFFER_SIZE', () => {
      // Fill buffer to capacity + 1
      for (let i = 0; i < MAX_BUFFER_SIZE + 5; i++) {
        service.ingest(makeRawEvent({ eventTimeMs: Date.now() + i }));
      }

      expect(projection.bufferSize).toBe(MAX_BUFFER_SIZE);
    });

    it('should evict the oldest event (last in DESC array)', () => {
      const now = Date.now();

      // Insert MAX_BUFFER_SIZE events with increasing timestamps
      for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
        service.ingest(makeRawEvent({ eventTimeMs: now + i }));
      }

      // The oldest event has eventTimeMs = now
      // Insert one more — should evict the oldest
      service.ingest(makeRawEvent({ eventTimeMs: now + MAX_BUFFER_SIZE }));

      const { payload } = projection.getSnapshot();
      const events = payload.events;

      expect(events).toHaveLength(MAX_BUFFER_SIZE);
      // The oldest remaining event should have eventTimeMs = now + 1 (now + 0 was evicted)
      const oldest = events[events.length - 1];
      expect(oldest.eventTimeMs).toBe(now + 1);
    });

    it('should track total ingested even after eviction', () => {
      const count = MAX_BUFFER_SIZE + 10;
      for (let i = 0; i < count; i++) {
        service.ingest(makeRawEvent());
      }

      expect(projection.totalIngested).toBe(count);
      expect(projection.bufferSize).toBe(MAX_BUFFER_SIZE);
    });
  });

  // --------------------------------------------------------------------------
  // Aggregate Consistency
  // --------------------------------------------------------------------------

  describe('aggregate consistency', () => {
    it('should track topic breakdown incrementally', () => {
      service.ingest(makeRawEvent({ topic: 'topic-a' }));
      service.ingest(makeRawEvent({ topic: 'topic-a' }));
      service.ingest(makeRawEvent({ topic: 'topic-b' }));

      const { payload } = projection.getSnapshot();

      expect(payload.topicBreakdown['topic-a']).toBe(2);
      expect(payload.topicBreakdown['topic-b']).toBe(1);
      expect(payload.activeTopics).toBe(2);
    });

    it('should track event type breakdown incrementally', () => {
      service.ingest(makeRawEvent({ type: 'heartbeat' }));
      service.ingest(makeRawEvent({ type: 'heartbeat' }));
      service.ingest(makeRawEvent({ type: 'action' }));

      const { payload } = projection.getSnapshot();

      expect(payload.eventTypeBreakdown['heartbeat']).toBe(2);
      expect(payload.eventTypeBreakdown['action']).toBe(1);
    });

    it('should decrement counters on eviction', () => {
      // Fill with topic-a events
      for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
        service.ingest(makeRawEvent({ topic: 'topic-a', eventTimeMs: Date.now() + i }));
      }

      // Now add topic-b events — these will evict topic-a events
      for (let i = 0; i < 10; i++) {
        service.ingest(
          makeRawEvent({ topic: 'topic-b', eventTimeMs: Date.now() + MAX_BUFFER_SIZE + i })
        );
      }

      const { payload } = projection.getSnapshot();

      // topic-a should have MAX_BUFFER_SIZE - 10 events
      expect(payload.topicBreakdown['topic-a']).toBe(MAX_BUFFER_SIZE - 10);
      // topic-b should have 10 events
      expect(payload.topicBreakdown['topic-b']).toBe(10);
    });

    it('should delete topic from breakdown when count reaches 0', () => {
      // Insert 3 events for topic-temp
      for (let i = 0; i < 3; i++) {
        service.ingest(makeRawEvent({ topic: 'topic-temp', eventTimeMs: 100 + i }));
      }

      // Fill the rest with topic-main (more recent)
      for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
        service.ingest(makeRawEvent({ topic: 'topic-main', eventTimeMs: Date.now() + i }));
      }

      const { payload } = projection.getSnapshot();

      // topic-temp events should be evicted (they were oldest)
      expect(payload.topicBreakdown['topic-temp']).toBeUndefined();
      expect(payload.topicBreakdown['topic-main']).toBe(MAX_BUFFER_SIZE);
    });

    it('should track error count correctly with eviction', () => {
      // Insert error events
      for (let i = 0; i < 5; i++) {
        service.ingest(makeRawEvent({ severity: 'error', eventTimeMs: 100 + i }));
      }

      // Fill with info events (more recent — will evict error events)
      for (let i = 0; i < MAX_BUFFER_SIZE; i++) {
        service.ingest(makeRawEvent({ severity: 'info', eventTimeMs: Date.now() + i }));
      }

      const { payload } = projection.getSnapshot();
      expect(payload.errorCount).toBe(0);
    });

    it('should track time series buckets', () => {
      const now = Date.now();
      const bucket1 = Math.floor(now / TIME_SERIES_BUCKET_MS) * TIME_SERIES_BUCKET_MS;

      service.ingest(makeRawEvent({ eventTimeMs: bucket1 + 1 }));
      service.ingest(makeRawEvent({ eventTimeMs: bucket1 + 100 }));

      const { payload } = projection.getSnapshot();

      const bucket = payload.timeSeries.find((ts) => ts.bucketKey === bucket1);
      expect(bucket).toBeDefined();
      expect(bucket!.count).toBe(2);
    });

    it('should skip time series for sentinel timestamps', () => {
      service.ingest(makeRawEvent({ eventTimeMs: 0 })); // sentinel

      const { payload } = projection.getSnapshot();
      expect(payload.timeSeries).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Events Since
  // --------------------------------------------------------------------------

  describe('getEventsSince', () => {
    it('should return events with ingestSeq > cursor', () => {
      service.ingestBatch([makeRawEvent(), makeRawEvent(), makeRawEvent(), makeRawEvent()]);

      const response = projection.getEventsSince(2);
      expect(response.events).toHaveLength(2);
      expect(response.events[0].ingestSeq).toBe(3);
      expect(response.events[1].ingestSeq).toBe(4);
    });

    it('should return events in ASC order by ingestSeq', () => {
      service.ingestBatch([makeRawEvent(), makeRawEvent(), makeRawEvent()]);

      const response = projection.getEventsSince(0);

      for (let i = 1; i < response.events.length; i++) {
        expect(response.events[i].ingestSeq).toBeGreaterThan(response.events[i - 1].ingestSeq);
      }
    });

    it('should respect limit parameter', () => {
      service.ingestBatch([makeRawEvent(), makeRawEvent(), makeRawEvent(), makeRawEvent()]);

      const response = projection.getEventsSince(0, 2);
      expect(response.events).toHaveLength(2);
    });

    it('should return empty when caught up', () => {
      service.ingestBatch([makeRawEvent(), makeRawEvent()]);

      const response = projection.getEventsSince(2);
      expect(response.events).toHaveLength(0);
      expect(response.cursor).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('reset', () => {
    it('should clear all state', () => {
      service.ingestBatch([
        makeRawEvent({ topic: 'a', type: 'x', severity: 'error' }),
        makeRawEvent({ topic: 'b', type: 'y' }),
      ]);

      projection.reset();

      expect(projection.bufferSize).toBe(0);
      expect(projection.cursor).toBe(0);
      expect(projection.totalIngested).toBe(0);

      const { payload } = projection.getSnapshot();
      expect(payload.events).toHaveLength(0);
      expect(payload.topicBreakdown).toEqual({});
      expect(payload.eventTypeBreakdown).toEqual({});
      expect(payload.timeSeries).toHaveLength(0);
      expect(payload.eventsPerSecond).toBe(0);
      expect(payload.errorCount).toBe(0);
      expect(payload.activeTopics).toBe(0);
    });

    it('should accept events after reset', () => {
      service.ingest(makeRawEvent());
      projection.reset();
      service.ingest(makeRawEvent());

      expect(projection.bufferSize).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Snapshot Limit
  // --------------------------------------------------------------------------

  describe('snapshot limit', () => {
    it('should respect limit parameter in getSnapshot', () => {
      service.ingestBatch([makeRawEvent(), makeRawEvent(), makeRawEvent()]);

      const { payload } = projection.getSnapshot({ limit: 2 });
      expect(payload.events).toHaveLength(2);
    });

    it('should return all events when limit exceeds buffer size', () => {
      service.ingestBatch([makeRawEvent(), makeRawEvent()]);

      const { payload } = projection.getSnapshot({ limit: 100 });
      expect(payload.events).toHaveLength(2);
    });

    it('should not affect aggregates when limit is used', () => {
      service.ingest(makeRawEvent({ topic: 'a' }));
      service.ingest(makeRawEvent({ topic: 'a' }));
      service.ingest(makeRawEvent({ topic: 'b' }));

      // Get snapshot with limit — aggregates should reflect full buffer
      const { payload } = projection.getSnapshot({ limit: 1 });
      expect(payload.events).toHaveLength(1);
      expect(payload.topicBreakdown['a']).toBe(2);
      expect(payload.topicBreakdown['b']).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Integration with ProjectionService
  // --------------------------------------------------------------------------

  describe('integration with ProjectionService', () => {
    it('should emit projection-invalidate on each applied event', () => {
      const invalidations: Array<{ viewId: string; cursor: number }> = [];
      service.on('projection-invalidate', (data) => invalidations.push(data));

      service.ingestBatch([makeRawEvent(), makeRawEvent()]);

      expect(invalidations).toHaveLength(2);
      expect(invalidations[0].viewId).toBe('event-bus');
      expect(invalidations[1].viewId).toBe('event-bus');
    });

    it('should update cursor monotonically', () => {
      service.ingestBatch([makeRawEvent(), makeRawEvent(), makeRawEvent()]);

      expect(projection.cursor).toBe(3);

      // Even with out-of-order events, cursor should only advance
      service.ingest(makeRawEvent());
      expect(projection.cursor).toBe(4);
    });
  });
});
