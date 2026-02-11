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

// Register views (runs at import time — module-level side effect).
//
// Idempotent guard: if the module is re-evaluated (e.g. test runner
// resetModules with the same singleton in scope), skip re-registration
// instead of throwing "already registered".
//
// Module-caching dependency: This pattern relies on Node.js evaluating the
// module once and caching the result. All importers (routes.ts, websocket.ts,
// index.ts) receive the same `projectionService` and `eventBusProjection`
// instances. If module caching breaks (symlink aliasing, path mismatches, or
// test runners with `resetModules`), separate instances could be created.
// The idempotent guard above prevents duplicate registration errors but does
// NOT prevent the scenario where a second `projectionService` instance exists
// with no views. Importers should always use the exports from this module
// rather than constructing their own instances.
if (!projectionService.getView(eventBusProjection.viewId)) {
  projectionService.registerView(eventBusProjection);
}

// ============================================================================
// Module-scoped fallback sequence counter
// ============================================================================

// Intentionally module-scoped (not inside wireProjectionSources) so that the
// counter persists across rewires within a single process lifetime. If it were
// local to wireProjectionSources, each call (e.g. test teardown/setup,
// hot-reload) would reset the counter to 0, allowing dedup keys from a
// previous wiring to collide with those from the new wiring.
let fallbackSeq = 0;
const FALLBACK_SEQ_MAX = Number.MAX_SAFE_INTEGER;

// ============================================================================
// Event source wiring
// ============================================================================

/** Cleanup function returned by wireProjectionSources to remove listeners. */
export type ProjectionSourceCleanup = () => void;

/**
 * Wire EventBusDataSource and EventConsumer to the ProjectionService.
 *
 * EventBusDataSource provides full 197-topic coverage (all Kafka events).
 * EventConsumer provides enriched events for legacy agent topics.
 * We deduplicate by tracking event IDs ingested from EventBusDataSource
 * to avoid double-counting when the same event arrives through both sources.
 *
 * @returns Cleanup function that removes all registered listeners.
 *          Call on shutdown or before re-wiring to prevent listener leaks.
 */
export function wireProjectionSources(): ProjectionSourceCleanup {
  // Guard: if module caching broke (symlink aliasing, path mismatches, or
  // bundler re-evaluation), a second ProjectionService instance may exist
  // with zero views. Surface the problem immediately instead of silently
  // routing events into the void.
  if (projectionService.viewCount === 0) {
    console.warn(
      '[projection] WARNING: projectionService has no registered views — possible module caching issue'
    );
  }

  // Ring-buffer deduplication: O(1) per add, no periodic pruning spikes.
  // Tracks event IDs from EventBusDataSource so EventConsumer doesn't double-count.
  // Trade-off: if an ID is evicted from the ring before EventConsumer delivers
  // the same event, a rare double-count can occur. At DEDUP_CAPACITY=5000 and
  // typical inter-source latency <1s, this is negligible.
  const DEDUP_CAPACITY = 5000;
  // Pre-fill with null to keep V8 packed-elements representation (faster property
  // access than a holey array created by `new Array(n)` with sparse slots).
  // null (not '') so that a real empty-string event ID is evictable.
  const dedupRing: (string | null)[] = new Array<string | null>(DEDUP_CAPACITY).fill(null);
  const dedupSet = new Set<string>();
  let dedupIdx = 0;

  function trackEventId(id: string): void {
    // Evict oldest entry if ring is full (null sentinel marks unused slots)
    const evicted = dedupRing[dedupIdx];
    if (evicted !== null) dedupSet.delete(evicted);
    dedupRing[dedupIdx] = id;
    dedupSet.add(id);
    dedupIdx = (dedupIdx + 1) % DEDUP_CAPACITY;
  }

  // Normalized fallback key: tries all known field name variants so the same
  // event produces an identical key regardless of which source delivers it.
  // Collision risk: two distinct events with identical topic + type + timestamp
  // (plausible at >1000 events/ms) would share a key, causing the second to be
  // silently dropped. This is acceptable because: (1) events with no event_id
  // are already low-fidelity (legacy format), (2) the dedup window is only
  // DEDUP_CAPACITY=5000 events, and (3) a rare duplicate miss is preferable
  // to a rare duplicate count.
  //
  // When timestamp is missing (sentinel 0/''), a monotonic counter is appended
  // to prevent collisions between events that share the same topic+type.
  // Wraps at MAX_SAFE_INTEGER to prevent loss of integer precision.
  // After wrap-around, early sequence numbers reappear. If the dedup ring
  // still holds a key from those early numbers (extremely unlikely given
  // DEDUP_CAPACITY=5000 and 9-quadrillion wraps), a collision can occur.
  // This is acceptable for the same reasons as timestamp-based collisions:
  // events without IDs are already low-fidelity, and a rare duplicate is
  // preferable to a rare missed dedup.
  // Note: fallbackSeq and FALLBACK_SEQ_MAX are module-scoped — see above.
  function deriveFallbackDedupKey(data: Record<string, unknown>): string {
    const topic = (data.topic as string) || '';
    const type =
      (data.event_type as string) || (data.actionType as string) || (data.type as string) || '';
    const ts =
      (data.timestamp as string | number) ||
      (data.createdAt as string | number) ||
      (data.created_at as string | number) ||
      '';
    // If timestamp is missing/empty/zero, append a monotonic sequence to avoid
    // collisions between distinct events with the same topic + type.
    if (!ts || ts === 0) {
      const seq = fallbackSeq;
      fallbackSeq = (fallbackSeq + 1) % FALLBACK_SEQ_MAX;
      return `${topic}:${type}:_seq${seq}`;
    }
    return `${topic}:${type}:${ts}`;
  }

  const sources: string[] = [];
  // Track registered listeners for cleanup
  const cleanups: Array<() => void> = [];

  // --------------------------------------------------------------------------
  // EventBusDataSource: full 197-topic coverage
  // --------------------------------------------------------------------------

  // Duck-type check: eventBusDataSource may not extend EventEmitter in all
  // environments (e.g. test mocks, alternative implementations). Checking for
  // .on as a function is the standard Node.js pattern for optional listeners.
  if (typeof eventBusDataSource.on === 'function') {
    const handleDataSourceEvent = (event: Record<string, unknown>): void => {
      try {
        const eventId = event.event_id as string | undefined;
        // Track for dedup: use event_id if present, otherwise derive a normalized
        // key from topic + type + timestamp (shared derivation with EventConsumer).
        const dedupKey = eventId || deriveFallbackDedupKey(event);
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
      } catch (err) {
        console.error('[projection] EventBusDataSource event handler error:', err);
      }
    };

    eventBusDataSource.on('event', handleDataSourceEvent);
    cleanups.push(() => {
      if (typeof eventBusDataSource.removeListener === 'function') {
        eventBusDataSource.removeListener('event', handleDataSourceEvent);
      }
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
      const handler = (data: Record<string, unknown>): void => {
        try {
          // Skip if already ingested via EventBusDataSource.
          // Uses shared deriveFallbackDedupKey for symmetric key derivation:
          // both sources derive identical keys from topic+type+timestamp when
          // event_id/id is missing, so dedup works regardless of which source
          // delivers first. If both sources lack an ID AND share the same
          // topic+type+timestamp, the second is dropped (acceptable — see
          // collision risk comment on deriveFallbackDedupKey above).
          const id = data.id as string | undefined;
          const dedupKey = id || deriveFallbackDedupKey(data);
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
        } catch (err) {
          console.error(`[projection] EventConsumer ${eventName} handler error:`, err);
        }
      };

      eventConsumer.on(eventName, handler);
      cleanups.push(() => {
        if (typeof eventConsumer.removeListener === 'function') {
          eventConsumer.removeListener(eventName, handler);
        }
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

  return () => {
    for (const cleanup of cleanups) cleanup();
    console.log('[projection] Removed all event source listeners');
  };
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
