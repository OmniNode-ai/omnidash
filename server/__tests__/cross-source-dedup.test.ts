/**
 * Cross-Source Dedup Tests (OMN-2197)
 *
 * Validates that the bidirectional correlation-ID dedup in projection-bootstrap
 * prevents the same underlying action from appearing as duplicate events when
 * it arrives via both EventBusDataSource and EventConsumer paths.
 *
 * Scenario: A tool call is published to BOTH the legacy `agent-actions` topic
 * AND the canonical `onex.cmd.omniintelligence.tool-content.v1` topic.
 * EventBusDataSource sees the canonical event, EventConsumer sees the legacy
 * event (and possibly the canonical one too). Without correlation-ID dedup,
 * the same action appears 2-3 times in the Event Bus Monitor.
 *
 * These tests mock EventBusDataSource and EventConsumer as EventEmitters
 * and call wireProjectionSources() to verify dedup end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — vi.hoisted ensures these run before vi.mock factories
// ---------------------------------------------------------------------------

const { mockEventBusDataSource, mockEventConsumer } = vi.hoisted(() => {
  const { EventEmitter } = require('events');
  return {
    mockEventBusDataSource: new EventEmitter(),
    mockEventConsumer: new EventEmitter(),
  };
});

vi.mock('../event-bus-data-source', () => ({
  eventBusDataSource: mockEventBusDataSource,
  getEventBusDataSource: () => mockEventBusDataSource,
}));

vi.mock('../event-consumer', () => ({
  eventConsumer: mockEventConsumer,
}));

// Mock storage to prevent DB connections
vi.mock('../storage', () => ({
  getIntelligenceDb: () => null,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { ProjectionService, type RawEventInput } from '../projection-service';
import { EventBusProjection } from '../projections/event-bus-projection';
import {
  wireProjectionSources,
  projectionService,
  eventBusProjection,
} from '../projection-bootstrap';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OMN-2197: Cross-source correlation-ID dedup', () => {
  let cleanup: () => void;

  beforeEach(() => {
    eventBusProjection.reset();
    cleanup = wireProjectionSources();
  });

  afterEach(() => {
    cleanup();
    mockEventBusDataSource.removeAllListeners();
    mockEventConsumer.removeAllListeners();
  });

  // -----------------------------------------------------------------------
  // Helper: simulate events from each source
  // -----------------------------------------------------------------------

  function emitFromDataSource(event: Record<string, unknown>): void {
    mockEventBusDataSource.emit('event', event);
  }

  function emitFromConsumer(eventName: string, data: Record<string, unknown>): void {
    mockEventConsumer.emit(eventName, data);
  }

  // -----------------------------------------------------------------------
  // Scenario 1: EventBusDataSource delivers first
  // -----------------------------------------------------------------------

  it('should deduplicate when EventBusDataSource delivers first', () => {
    const correlationId = 'corr-abc-123';
    const now = Date.now();

    // EventBusDataSource delivers the canonical tool-content event first
    emitFromDataSource({
      event_id: 'evt-original-id',
      topic: 'onex.cmd.omniintelligence.tool-content.v1',
      event_type: 'tool-content',
      source: 'omniintelligence',
      correlation_id: correlationId,
      timestamp: now,
      payload: { tool_name: 'Read' },
    });

    // EventConsumer delivers the same event (reshaped with new UUID)
    emitFromConsumer('actionUpdate', {
      id: 'new-random-uuid-1',
      correlationId,
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Read',
      timestamp: now,
    });

    const snapshot = eventBusProjection.getSnapshot();
    expect(snapshot.payload.totalEventsIngested).toBe(1);
    expect(snapshot.payload.events).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Scenario 2: EventConsumer delivers first (race condition fix)
  // -----------------------------------------------------------------------

  it('should deduplicate when EventConsumer delivers first', () => {
    const correlationId = 'corr-def-456';
    const now = Date.now();

    // EventConsumer delivers the legacy agent-actions event first
    emitFromConsumer('actionUpdate', {
      id: 'consumer-uuid-1',
      correlationId,
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Edit',
      timestamp: now,
    });

    // EventBusDataSource delivers the canonical event later
    emitFromDataSource({
      event_id: 'evt-canonical-id',
      topic: 'onex.cmd.omniintelligence.tool-content.v1',
      event_type: 'tool-content',
      source: 'omniintelligence',
      correlation_id: correlationId,
      timestamp: now,
      payload: { tool_name: 'Edit' },
    });

    const snapshot = eventBusProjection.getSnapshot();
    expect(snapshot.payload.totalEventsIngested).toBe(1);
    expect(snapshot.payload.events).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Two EventConsumer events with same correlation_id
  // (agent-actions + tool-content both routed through EventConsumer)
  // -----------------------------------------------------------------------

  it('should deduplicate two EventConsumer events with same correlation_id', () => {
    const correlationId = 'corr-ghi-789';
    const now = Date.now();

    // First: from agent-actions topic
    emitFromConsumer('actionUpdate', {
      id: 'uuid-from-agent-actions',
      correlationId,
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Write',
      timestamp: now,
    });

    // Second: from tool-content topic (same underlying action)
    emitFromConsumer('actionUpdate', {
      id: 'uuid-from-tool-content',
      correlationId,
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Write',
      timestamp: now,
    });

    const snapshot = eventBusProjection.getSnapshot();
    expect(snapshot.payload.totalEventsIngested).toBe(1);
    expect(snapshot.payload.events).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Events with different correlation IDs are NOT deduped
  // -----------------------------------------------------------------------

  it('should not deduplicate events with different correlation IDs', () => {
    const now = Date.now();

    emitFromDataSource({
      event_id: 'evt-1',
      topic: 'onex.cmd.omniintelligence.tool-content.v1',
      event_type: 'tool-content',
      source: 'omniintelligence',
      correlation_id: 'corr-unique-1',
      timestamp: now,
      payload: { tool_name: 'Read' },
    });

    emitFromConsumer('actionUpdate', {
      id: 'uuid-2',
      correlationId: 'corr-unique-2',
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Edit',
      timestamp: now + 1,
    });

    const snapshot = eventBusProjection.getSnapshot();
    expect(snapshot.payload.totalEventsIngested).toBe(2);
    expect(snapshot.payload.events).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Events without correlation IDs are not affected
  // -----------------------------------------------------------------------

  it('should not deduplicate events without correlation IDs', () => {
    const now = Date.now();

    emitFromDataSource({
      event_id: 'evt-no-corr-1',
      topic: 'onex.evt.platform.node-heartbeat.v1',
      event_type: 'heartbeat',
      source: 'platform',
      timestamp: now,
      payload: { status: 'ok' },
    });

    emitFromConsumer('nodeHeartbeatUpdate', {
      id: 'consumer-hb-1',
      type: 'heartbeat',
      timestamp: now + 1,
    });

    const snapshot = eventBusProjection.getSnapshot();
    // Both should be ingested (no correlation_id to dedup on)
    expect(snapshot.payload.totalEventsIngested).toBe(2);
    expect(snapshot.payload.events).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Triple duplicate (all 3 paths for the same action)
  // -----------------------------------------------------------------------

  it('should deduplicate triple arrival (DataSource + 2x Consumer) with same correlation_id', () => {
    const correlationId = 'corr-triple-test';
    const now = Date.now();

    // Path 1: EventBusDataSource canonical event
    emitFromDataSource({
      event_id: 'evt-canonical',
      topic: 'onex.cmd.omniintelligence.tool-content.v1',
      event_type: 'tool-content',
      source: 'omniintelligence',
      correlation_id: correlationId,
      timestamp: now,
      payload: { tool_name: 'Read' },
    });

    // Path 2: EventConsumer from agent-actions topic
    emitFromConsumer('actionUpdate', {
      id: 'uuid-from-legacy',
      correlationId,
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Read',
      timestamp: now,
    });

    // Path 3: EventConsumer from tool-content topic
    emitFromConsumer('actionUpdate', {
      id: 'uuid-from-canonical',
      correlationId,
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Read',
      timestamp: now,
    });

    const snapshot = eventBusProjection.getSnapshot();
    expect(snapshot.payload.totalEventsIngested).toBe(1);
    expect(snapshot.payload.events).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Event counts reflect actual unique actions
  // -----------------------------------------------------------------------

  it('should produce accurate event counts (no inflated counts from duplicates)', () => {
    const now = Date.now();

    // 3 unique actions, each appearing via 2 sources
    for (let i = 0; i < 3; i++) {
      const corrId = `corr-count-test-${i}`;

      emitFromDataSource({
        event_id: `evt-ds-${i}`,
        topic: 'onex.cmd.omniintelligence.tool-content.v1',
        event_type: 'tool-content',
        source: 'omniintelligence',
        correlation_id: corrId,
        timestamp: now + i,
        payload: { tool_name: 'Read' },
      });

      emitFromConsumer('actionUpdate', {
        id: `uuid-consumer-${i}`,
        correlationId: corrId,
        agentName: 'omniclaude',
        actionType: 'tool',
        actionName: 'Read',
        timestamp: now + i,
      });
    }

    const snapshot = eventBusProjection.getSnapshot();
    // Should be exactly 3, not 6
    expect(snapshot.payload.totalEventsIngested).toBe(3);
    expect(snapshot.payload.events).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // Scenario 8: Failed ingest does NOT mark correlation ID as seen
  // -----------------------------------------------------------------------

  it('should not mark correlation ID as seen when ingest throws', () => {
    const correlationId = 'corr-ingest-throw-test';
    const now = Date.now();

    // Make projectionService.ingest throw on the first call, then restore
    const originalIngest = projectionService.ingest.bind(projectionService);
    let callCount = 0;
    const ingestSpy = vi.spyOn(projectionService, 'ingest').mockImplementation((raw) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated ingest failure');
      }
      return originalIngest(raw);
    });

    // First delivery: EventBusDataSource sends the event, but ingest throws.
    // The error is caught by the try/catch in wireProjectionSources, so the
    // correlation ID should NOT be tracked in the dedup set.
    emitFromDataSource({
      event_id: 'evt-will-fail',
      topic: 'onex.cmd.omniintelligence.tool-content.v1',
      event_type: 'tool-content',
      source: 'omniintelligence',
      correlation_id: correlationId,
      timestamp: now,
      payload: { tool_name: 'Read' },
    });

    // Verify: nothing was ingested (ingest threw)
    let snapshot = eventBusProjection.getSnapshot();
    expect(snapshot.payload.totalEventsIngested).toBe(0);

    // Second delivery: EventConsumer sends the same event (same correlation ID).
    // Because the first ingest failed and dedup state was NOT tracked, this
    // second delivery should succeed.
    emitFromConsumer('actionUpdate', {
      id: 'uuid-retry-success',
      correlationId,
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Read',
      timestamp: now,
    });

    // Verify: the retry succeeded — exactly 1 event ingested
    snapshot = eventBusProjection.getSnapshot();
    expect(snapshot.payload.totalEventsIngested).toBe(1);
    expect(snapshot.payload.events).toHaveLength(1);

    ingestSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Scenario 9: Ring-buffer capacity eviction allows late duplicates
  // -----------------------------------------------------------------------

  it('should allow late duplicate after ring-buffer eviction (capacity = 5000)', () => {
    // The correlation-ID dedup ring has capacity 5000. After filling it,
    // the oldest entry is evicted. A late duplicate arriving with that
    // evicted correlation ID should NOT be deduplicated — it will be
    // ingested as a second copy. This is the intentional trade-off
    // documented in the production code comments.
    const CORR_DEDUP_CAPACITY = 5000;
    const now = Date.now();

    // The very first correlation ID — this will be evicted once the ring
    // wraps around after CORR_DEDUP_CAPACITY entries.
    const firstCorrId = 'corr-eviction-target-0';

    // Emit the first event via EventBusDataSource
    emitFromDataSource({
      event_id: 'evt-evict-0',
      topic: 'onex.cmd.omniintelligence.tool-content.v1',
      event_type: 'tool-content',
      source: 'omniintelligence',
      correlation_id: firstCorrId,
      timestamp: now,
      payload: { tool_name: 'Read' },
    });

    // Fill the ring buffer to capacity by emitting CORR_DEDUP_CAPACITY - 1
    // more unique events (total = 5000, filling slots 0..4999).
    // Then emit one more to cause slot 0 (firstCorrId) to be evicted.
    for (let i = 1; i <= CORR_DEDUP_CAPACITY; i++) {
      emitFromDataSource({
        event_id: `evt-fill-${i}`,
        topic: 'onex.cmd.omniintelligence.tool-content.v1',
        event_type: 'tool-content',
        source: 'omniintelligence',
        correlation_id: `corr-fill-${i}`,
        timestamp: now + i,
        payload: { tool_name: 'Read' },
      });
    }

    // At this point we've emitted 5001 events. The ring buffer has
    // wrapped: slot 0 now holds 'corr-fill-5000' and 'corr-eviction-target-0'
    // has been evicted from the set.
    const snapshotBefore = eventBusProjection.getSnapshot();
    const countBefore = snapshotBefore.payload.totalEventsIngested;

    // Now emit a "late duplicate" via EventConsumer with the evicted
    // correlation ID. Because the ID was evicted from the ring, the dedup
    // check will NOT catch it, and it will be ingested as a new event.
    emitFromConsumer('actionUpdate', {
      id: 'uuid-late-dup-after-eviction',
      correlationId: firstCorrId,
      agentName: 'omniclaude',
      actionType: 'tool',
      actionName: 'Read',
      timestamp: now,
    });

    const snapshotAfter = eventBusProjection.getSnapshot();

    // The late duplicate should have been ingested (not deduplicated),
    // proving the ring-buffer eviction behavior.
    expect(snapshotAfter.payload.totalEventsIngested).toBe(countBefore + 1);
  }, 30_000); // Extended timeout: 5001 events through the projection pipeline
});
