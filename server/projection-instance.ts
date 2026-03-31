// no-migration: OMN-5318 comments only — no schema changes, no new projection tables
/**
 * Intent Projection Wiring (OMN-2096)
 *
 * Registers the IntentProjectionView with the shared ProjectionService
 * singleton (from projection-bootstrap.ts) and wires EventBusDataSource
 * intent events into the projection pipeline.
 *
 * Call `initProjectionListeners()` once during server startup
 * to wire the intent-event listener.
 *
 * **Testing**: Test files that import this module should call
 * `teardownProjectionListeners()` in afterEach/afterAll to prevent
 * duplicate listeners across test suites.
 */

import { projectionService } from './projection-bootstrap';
import { IntentProjectionView, INTENT_VIEW_ID } from './projections/intent-projection';
import { eventBusDataSource } from './event-bus-data-source';
import {
  INTENT_CLASSIFIED_TOPIC,
  INTENT_STORED_TOPIC,
  EVENT_TYPE_NAMES,
} from '@shared/intent-types';

// Re-export projectionService for backward-compatible imports
export { projectionService };

// ============================================================================
// EventBusDataSource → ProjectionService wiring
// ============================================================================

/** Guard flag to prevent duplicate view registration and listener wiring under Vite HMR. */
let initialized = false;

/**
 * Route intent events from EventBusDataSource into the projection pipeline.
 * Converts the raw event envelope to a {@link RawEventInput} and passes it
 * to {@link ProjectionService.ingest}.
 *
 * @param event - Raw intent event from EventBusDataSource
 */
// ─── REGRESSION WARNING ───────────────────────────────────────────────────
// The intent payload uses camelCase field names:
//   { intentType, sessionId, createdAt, correlationId, confidence, ... }
//
// This camelCase object is ingested verbatim as the ProjectionEvent payload.
// IntentDashboard.projectionIntentItems reads it with dual-casing fallbacks
// (e.g. intent_category ?? intentType) specifically because of this.
//
// If you ever normalise the payload to snake_case HERE, also remove the
// camelCase fallbacks in IntentDashboard.tsx. If you do it the other way
// around — removing the fallbacks without normalising here — the Session
// Timeline dots turn gray and category badges go blank (regressed OMN-5318).
// ─────────────────────────────────────────────────────────────────────────
function handleIntentEvent(event: {
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}): void {
  const payload = event.payload;
  if (!payload || typeof payload !== 'object') return;

  // Resolve a short event-type name the projection view accepts.
  const TOPIC_TO_TYPE: Record<string, string> = {
    [INTENT_CLASSIFIED_TOPIC]: EVENT_TYPE_NAMES.INTENT_CLASSIFIED,
    [INTENT_STORED_TOPIC]: EVENT_TYPE_NAMES.INTENT_STORED,
  };
  const resolvedType =
    typeof payload.event_type === 'string'
      ? payload.event_type
      : (TOPIC_TO_TYPE[event.topic] ?? event.topic);

  projectionService.ingest({
    id:
      payload.id != null
        ? String(payload.id)
        : payload.intent_id != null
          ? String(payload.intent_id)
          : undefined,
    topic: event.topic,
    type: resolvedType,
    source: 'event-bus-data-source',
    severity: 'info',
    payload, // camelCase fields preserved — see warning above before changing
    eventTimeMs: extractTimestampMs(event),
  });
}

/**
 * Register the IntentProjectionView and wire the EventBusDataSource listener.
 * Safe to call multiple times (idempotent via guard flag).
 * Call once during server startup after EventBusDataSource is ready.
 *
 * View registration is intentionally deferred to this function (rather than
 * running at module-import time) so that test files importing this module
 * do not silently mutate projectionService state as a side effect.
 */
export function initProjectionListeners(): void {
  if (initialized) return;
  initialized = true;

  // Register view (idempotent guard in case another code path already registered)
  if (!projectionService.getView(INTENT_VIEW_ID)) {
    projectionService.registerView(new IntentProjectionView());
  }

  if (typeof eventBusDataSource.on === 'function') {
    eventBusDataSource.on('intent-event', handleIntentEvent);
  }
}

/**
 * Remove EventBusDataSource listeners registered by this module and
 * reset the guard flag so `initProjectionListeners()` can re-register.
 * Call during graceful shutdown or in test teardown to prevent
 * duplicate listeners in hot-reload scenarios.
 */
export function teardownProjectionListeners(): void {
  if (typeof eventBusDataSource.removeListener === 'function') {
    eventBusDataSource.removeListener('intent-event', handleIntentEvent);
  }
  initialized = false;
}

/**
 * Extract a millisecond-epoch timestamp from an intent event.
 * Checks payload fields (timestamp, created_at, stored_at, createdAt)
 * then falls back to the event envelope timestamp.
 */
function extractTimestampMs(event: {
  payload: Record<string, unknown>;
  timestamp: string;
}): number | undefined {
  const payload = event.payload;

  for (const field of ['timestamp', 'created_at', 'stored_at', 'createdAt']) {
    const val = payload[field];
    if (typeof val === 'number' && val > 0) return val;
    if (typeof val === 'string' && val.length > 0) {
      const parsed = new Date(val).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  if (event.timestamp) {
    const parsed = new Date(event.timestamp).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return undefined;
}
