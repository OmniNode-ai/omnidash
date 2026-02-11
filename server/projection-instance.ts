/**
 * Projection Service Singleton (OMN-2096)
 *
 * Creates and configures the global ProjectionService instance.
 * Registers all projection views and wires EventConsumer events
 * into the projection pipeline.
 *
 * Import this module to get the configured service instance.
 */

import { ProjectionService } from './projection-service';
import { IntentProjectionView } from './projections/intent-projection';
import { eventConsumer } from './event-consumer';

// ============================================================================
// Singleton
// ============================================================================

export const projectionService = new ProjectionService();

// ============================================================================
// View Registration
// ============================================================================

const intentView = new IntentProjectionView();
projectionService.registerView(intentView);

// ============================================================================
// EventConsumer → ProjectionService wiring
// ============================================================================

/**
 * Route intent events from EventConsumer into the projection pipeline.
 * EventConsumer emits 'intent-event' for both classified and stored intents.
 * We convert these to RawEventInput and pass to ProjectionService.ingest().
 */
function handleIntentEvent(event: {
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}): void {
  const payload = event.payload;
  if (!payload || typeof payload !== 'object') return;

  projectionService.ingest({
    id:
      payload.id != null
        ? String(payload.id)
        : payload.intent_id != null
          ? String(payload.intent_id)
          : undefined,
    topic: event.topic,
    type: (payload.event_type as string) ?? event.topic,
    source: 'event-consumer',
    severity: 'info',
    payload,
    eventTimeMs: extractTimestampMs(event),
  });
}

eventConsumer.on('intent-event', handleIntentEvent);

/**
 * Remove EventConsumer listeners registered by this module.
 * Call during graceful shutdown or in test teardown to prevent
 * duplicate listeners in hot-reload scenarios.
 */
export function teardownProjectionListeners(): void {
  eventConsumer.removeListener('intent-event', handleIntentEvent);
}

/**
 * Extract a millisecond timestamp from an intent event.
 */
function extractTimestampMs(event: {
  payload: Record<string, unknown>;
  timestamp: string;
}): number | undefined {
  const payload = event.payload;

  // Try payload timestamp fields
  for (const field of ['timestamp', 'created_at', 'stored_at', 'createdAt']) {
    const val = payload[field];
    if (typeof val === 'number' && val > 0) return val;
    if (typeof val === 'string' && val.length > 0) {
      const parsed = new Date(val).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  // Fall back to event envelope timestamp
  if (event.timestamp) {
    const parsed = new Date(event.timestamp).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return undefined; // Let ProjectionService use extractEventTimeMs fallback
}
