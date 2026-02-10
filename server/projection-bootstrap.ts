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

export const projectionService = new ProjectionService();
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
  const ingestedEventIds = new Set<string>();
  const MAX_TRACKED_IDS = 5000;

  // --------------------------------------------------------------------------
  // EventBusDataSource: full 197-topic coverage
  // --------------------------------------------------------------------------

  if (typeof eventBusDataSource.on !== 'function') {
    console.warn('[projection] EventBusDataSource.on not available — skipping wiring');
    return;
  }

  eventBusDataSource.on('event', (event: Record<string, unknown>) => {
    const eventId = event.event_id as string | undefined;
    if (eventId) ingestedEventIds.add(eventId);

    // Cap tracked IDs to prevent unbounded growth
    if (ingestedEventIds.size > MAX_TRACKED_IDS) {
      const entries = Array.from(ingestedEventIds);
      ingestedEventIds.clear();
      for (let i = entries.length - MAX_TRACKED_IDS / 2; i < entries.length; i++) {
        ingestedEventIds.add(entries[i]);
      }
    }

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

  // --------------------------------------------------------------------------
  // EventConsumer: enriched legacy agent events
  // --------------------------------------------------------------------------

  if (typeof eventConsumer.on !== 'function') {
    console.warn('[projection] EventConsumer.on not available — skipping consumer wiring');
    console.log(
      '[projection] Wired to EventBusDataSource only. Views:',
      projectionService.viewIds.join(', ')
    );
    return;
  }

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
      // Skip if already ingested via EventBusDataSource
      const id = data.id as string | undefined;
      if (id && ingestedEventIds.has(id)) return;

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

  console.log(
    '[projection] Wired to EventBusDataSource + EventConsumer. Views:',
    projectionService.viewIds.join(', ')
  );
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
