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
});
