/**
 * Projection Bootstrap — Wire Event Sources to ProjectionService (OMN-2095)
 *
 * Creates the ProjectionService singleton, registers views, and wires
 * event sources (EventBusDataSource, EventConsumer) so that every Kafka
 * event is routed through the projection pipeline.
 *
 * Call `wireProjectionSources()` after EventConsumer/EventBusDataSource
 * have started to begin live ingestion.
 */

import { ProjectionService, type RawEventInput } from './projection-service';
import { EventBusProjection } from './projections/event-bus-projection';
import { eventConsumer } from './event-consumer';
import { eventBusDataSource } from './event-bus-data-source';

// ============================================================================
// Singleton instances
// ============================================================================

/**
 * Application-wide ProjectionService singleton. Manages view registration,
 * cursor assignment, and event fan-out to all registered projection views.
 */
export const projectionService = new ProjectionService();

/**
 * EventBusProjection singleton. Maintains the materialized view consumed
 * by the `/api/projections/event-bus` endpoint and the EventBusMonitor page.
 * Registered into projectionService at module load time.
 */
export const eventBusProjection = new EventBusProjection();

// Register views
projectionService.registerView(eventBusProjection);

// ============================================================================
// Event source wiring
// ============================================================================

/**
 * Wire EventBusDataSource and EventConsumer to the ProjectionService.
 *
 * EventBusDataSource provides full 197-topic coverage (all Kafka events).
 * EventConsumer provides enriched events for legacy agent topics.
 * We deduplicate by tracking event IDs ingested from EventBusDataSource
 * to avoid double-counting when the same event arrives through both sources.
 */
export function wireProjectionSources(): void {
  // Ring-buffer deduplication: O(1) per add, no periodic pruning spikes.
  // Tracks event IDs from EventBusDataSource so EventConsumer doesn't double-count.
  // Trade-off: if an ID is evicted from the ring before EventConsumer delivers
  // the same event, a rare double-count can occur. At DEDUP_CAPACITY=5000 and
  // typical inter-source latency <1s, this is negligible.
  const DEDUP_CAPACITY = 5000;
  const dedupRing: string[] = new Array(DEDUP_CAPACITY);
  const dedupSet = new Set<string>();
  let dedupIdx = 0;

  function trackEventId(id: string): void {
    // Evict oldest entry if ring is full
    const evicted = dedupRing[dedupIdx];
    if (evicted !== undefined) dedupSet.delete(evicted);
    dedupRing[dedupIdx] = id;
    dedupSet.add(id);
    dedupIdx = (dedupIdx + 1) % DEDUP_CAPACITY;
  }

  const sources: string[] = [];

  // --------------------------------------------------------------------------
  // EventBusDataSource: full 197-topic coverage
  // --------------------------------------------------------------------------

  if (typeof eventBusDataSource.on === 'function') {
    eventBusDataSource.on('event', (event: Record<string, unknown>) => {
      const eventId = event.event_id as string | undefined;
      // Track for dedup: use event_id if present, otherwise derive a key from
      // topic + type + timestamp to avoid double-counting when the same event
      // arrives through both EventBusDataSource and EventConsumer.
      const dedupKey =
        eventId || `${event.topic || ''}:${event.event_type || ''}:${event.timestamp || ''}`;
      trackEventId(dedupKey);

      let payload: Record<string, unknown>;
      const rawPayload = event.payload;
      if (rawPayload != null && typeof rawPayload === 'object' && !Array.isArray(rawPayload)) {
        payload = rawPayload as Record<string, unknown>;
      } else {
        payload = { value: rawPayload };
      }

      const raw: RawEventInput = {
        id: eventId,
        topic: (event.topic as string) || '',
        type: (event.event_type as string) || '',
        source: (event.source as string) || '',
        severity: mapSeverity(payload),
        payload,
        eventTimeMs: extractTimestamp(event),
      };

      projectionService.ingest(raw);
    });
    sources.push('EventBusDataSource');
  } else {
    console.warn('[projection] EventBusDataSource.on not available — skipping wiring');
  }

  // --------------------------------------------------------------------------
  // EventConsumer: enriched legacy agent events
  // --------------------------------------------------------------------------

  if (typeof eventConsumer.on !== 'function') {
    console.warn('[projection] EventConsumer.on not available — skipping consumer wiring');
  } else {
    const consumerEventNames = [
      'actionUpdate',
      'routingUpdate',
      'transformationUpdate',
      'performanceUpdate',
      'nodeIntrospectionUpdate',
      'nodeHeartbeatUpdate',
      'nodeStateChangeUpdate',
    ] as const;

    for (const eventName of consumerEventNames) {
      eventConsumer.on(eventName, (data: Record<string, unknown>) => {
        // Skip if already ingested via EventBusDataSource.
        // Use same fallback key derivation as EventBusDataSource for events without id.
        const id = data.id as string | undefined;
        const dedupKey =
          id ||
          `${data.topic || ''}:${data.actionType || data.type || ''}:${data.timestamp || data.createdAt || ''}`;
        if (dedupSet.has(dedupKey)) return;

        const raw: RawEventInput = {
          id,
          topic: (data.topic as string) || eventName,
          type: (data.actionType as string) || (data.type as string) || eventName,
          source:
            (data.agentName as string) ||
            (data.sourceAgent as string) ||
            (data.node_id as string) ||
            'system',
          severity: mapSeverity(data),
          payload: data,
          eventTimeMs: extractTimestamp(data),
        };

        projectionService.ingest(raw);
      });
    }
    sources.push('EventConsumer');
  }

  if (sources.length > 0) {
    console.log(
      `[projection] Wired to ${sources.join(' + ')}. Views:`,
      projectionService.viewIds.join(', ')
    );
  } else {
    console.warn('[projection] No event sources available — projections will be empty');
  }
}

// ============================================================================
// Helpers
// ============================================================================

function mapSeverity(data: Record<string, unknown>): 'info' | 'warning' | 'error' | 'critical' {
  const severity = data.severity || data.priority;
  if (severity === 'critical') return 'critical';
  if (severity === 'error') return 'error';
  if (severity === 'warning' || severity === 'high') return 'warning';
  return 'info';
}

function extractTimestamp(data: Record<string, unknown>): number | undefined {
  const ts = data.timestamp || data.createdAt || data.created_at || data.emitted_at;
  if (typeof ts === 'number' && ts > 0) return ts;
  if (typeof ts === 'string' && ts.length > 0) {
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}
