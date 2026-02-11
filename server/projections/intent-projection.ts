/**
 * IntentProjectionView (OMN-2096)
 *
 * Server-side materialized view for intent events. Implements
 * ProjectionView<IntentPayload> so ProjectionService can route
 * intent-classified and intent-stored events here.
 *
 * Materializes:
 * - recentIntents: bounded buffer (MAX_BUFFER internal cap), sorted
 *   by (eventTimeMs DESC, ingestSeq DESC)
 * - distribution: Map<category, count> with incremental insert++/evict--
 * - cursor: max(ingestSeq) across applied events
 *
 * Sort key: (eventTimeMs DESC, ingestSeq DESC) — universal across projections.
 */

import type { ProjectionView } from '../projection-service';
import type {
  ProjectionResponse,
  ProjectionEventsResponse,
  ProjectionEvent,
  IntentDistributionEntry,
  IntentProjectionPayload,
} from '@shared/projection-types';

/** Re-export shared types for consumers that previously imported from here. */
export type { IntentDistributionEntry, IntentProjectionPayload };
/** Convenience alias mapping the legacy name to {@link IntentProjectionPayload}. */
export type { IntentProjectionPayload as IntentPayload };

// ============================================================================
// Constants
// ============================================================================

/** Internal buffer cap. Snapshot ?limit clamps to this. */
const MAX_BUFFER = 500;

/** Strip server-only fields (error, eventTimeMissing) from events for wire payload. */
function stripServerFields(
  event: ProjectionEvent
): Pick<
  ProjectionEvent,
  'id' | 'eventTimeMs' | 'ingestSeq' | 'type' | 'topic' | 'source' | 'severity' | 'payload'
> {
  const { id, eventTimeMs, ingestSeq, type, topic, source, severity, payload } = event;
  return { id, eventTimeMs, ingestSeq, type, topic, source, severity, payload };
}

/** View identifier used in ProjectionResponse envelopes and invalidation. */
export const INTENT_VIEW_ID = 'intent';

/** Event types that this view accepts. */
const ACCEPTED_TYPES = new Set([
  'IntentClassified',
  'intent-classified',
  'INTENT_CLASSIFIED',
  'IntentStored',
  'intent-stored',
  'INTENT_STORED',
]);

// ============================================================================
// IntentProjectionView
// ============================================================================

/**
 * Server-side materialized view for intent events.
 *
 * Maintains a bounded buffer of recent intents sorted by
 * (eventTimeMs DESC, ingestSeq DESC) and an incremental
 * category distribution map.
 */
export class IntentProjectionView implements ProjectionView<IntentProjectionPayload> {
  readonly viewId = INTENT_VIEW_ID;

  /** Bounded buffer, newest first (sorted by eventTimeMs DESC, ingestSeq DESC). */
  private buffer: ProjectionEvent[] = [];

  /** Incremental category counts. */
  private distributionMap = new Map<string, number>();

  /** All events applied (for getEventsSince). */
  private appliedEvents: ProjectionEvent[] = [];

  /** Cursor: max ingestSeq seen. */
  private _cursor = 0;

  /** Last event timestamp for stats. */
  private _lastEventTimeMs: number | null = null;

  /** Cumulative count of all intent events ingested (never decremented on eviction). */
  private _totalIngested = 0;

  /** Cached snapshot response, invalidated on each applyEvent call. */
  private _cachedSnapshot: {
    limit: number;
    response: ProjectionResponse<IntentProjectionPayload>;
  } | null = null;

  // --------------------------------------------------------------------------
  // ProjectionView interface
  // --------------------------------------------------------------------------

  /**
   * Return the current materialized snapshot.
   * Results are cached between events; the cache is invalidated on each {@link applyEvent} call.
   * @param options.limit - Max recent intents to include (default 100, clamped to MAX_BUFFER)
   */
  getSnapshot(options?: { limit?: number }): ProjectionResponse<IntentProjectionPayload> {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), MAX_BUFFER);

    // Return cached snapshot if available for the same limit.
    // Recompute snapshotTimeMs so callers always see a fresh observation time.
    // Deep-copy payload arrays so callers cannot mutate the cached data.
    if (this._cachedSnapshot && this._cachedSnapshot.limit === limit) {
      const cached = this._cachedSnapshot.response;
      return {
        ...cached,
        snapshotTimeMs: Date.now(),
        payload: {
          ...cached.payload,
          recentIntents: cached.payload.recentIntents.slice(),
          distribution: cached.payload.distribution.slice(),
        },
      };
    }

    // Strip server-only fields (error, eventTimeMissing) from wire payload
    const recentIntents = this.buffer.slice(0, limit).map(stripServerFields);

    // Buffer-visible count for distribution percentages
    const bufferTotal =
      this.distributionMap.size > 0
        ? Array.from(this.distributionMap.values()).reduce((sum, c) => sum + c, 0)
        : 0;

    const distribution: IntentDistributionEntry[] = Array.from(this.distributionMap.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: bufferTotal > 0 ? (count / bufferTotal) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const response: ProjectionResponse<IntentProjectionPayload> = {
      viewId: this.viewId,
      cursor: this._cursor,
      snapshotTimeMs: Date.now(),
      payload: {
        recentIntents,
        distribution,
        // Cumulative lifetime count (never decreases on eviction)
        totalIntents: this._totalIngested,
        categoryCount: this.distributionMap.size,
        lastEventTimeMs: this._lastEventTimeMs,
      },
    };

    // Cache for subsequent reads between events.
    // Return a copy with sliced payload arrays so callers cannot mutate the cache.
    this._cachedSnapshot = { limit, response };
    return {
      ...response,
      payload: {
        ...response.payload,
        recentIntents: response.payload.recentIntents.slice(),
        distribution: response.payload.distribution.slice(),
      },
    };
  }

  /**
   * Return events applied after the given cursor for incremental catch-up.
   * @param cursor - Exclusive lower bound on ingestSeq (0 returns all retained events)
   * @param limit - Max events to return
   */
  getEventsSince(cursor: number, limit?: number): ProjectionEventsResponse {
    // Detect if appliedEvents has been trimmed past the requested cursor
    const oldestAvailable = this.appliedEvents.length > 0 ? this.appliedEvents[0].ingestSeq : 0;
    const truncated = cursor > 0 && cursor < oldestAvailable;

    // Filter for events past the cursor. Using filter() instead of
    // findIndex+slice for correctness even if appliedEvents arrive
    // out of ingestSeq order (defensive against concurrent ingestion).
    const past =
      cursor <= 0 || this.appliedEvents.length === 0
        ? this.appliedEvents
        : this.appliedEvents.filter((e) => e.ingestSeq > cursor);
    const raw = limit ? past.slice(0, limit) : past;

    // Strip server-only fields (error, eventTimeMissing) to match getSnapshot
    const result = raw.map(stripServerFields);

    return {
      viewId: this.viewId,
      cursor: result.length > 0 ? result[result.length - 1].ingestSeq : cursor,
      snapshotTimeMs: Date.now(),
      events: result,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  /**
   * Apply an intent event to the view, updating buffer, distribution, and cursor.
   * @param event - Canonical projection event to apply
   * @returns `true` if the event was an intent event and was applied, `false` otherwise
   */
  applyEvent(event: ProjectionEvent): boolean {
    if (!this.isIntentEvent(event)) return false;

    // Invalidate cached snapshot on any new event
    this._cachedSnapshot = null;

    // Track cursor
    if (event.ingestSeq > this._cursor) {
      this._cursor = event.ingestSeq;
    }

    // Track last event time (max to prevent regression on out-of-order events).
    // Skip sentinel value 0 (indicates missing timestamp) to prevent
    // lastEventTimeMs from being set to a meaningless value.
    if (event.eventTimeMs > 0 && event.eventTimeMs > (this._lastEventTimeMs ?? 0)) {
      this._lastEventTimeMs = event.eventTimeMs;
    }

    // Cumulative counter (never decremented, survives eviction)
    this._totalIngested++;

    // Extract category from payload
    const category = this.extractCategory(event);

    // Insert into buffer (sorted position)
    this.insertSorted(event);

    // Increment distribution for new event
    this.distributionMap.set(category, (this.distributionMap.get(category) ?? 0) + 1);

    // Evict oldest if buffer exceeds cap
    if (this.buffer.length > MAX_BUFFER) {
      const evicted = this.buffer.pop()!;
      const evictedCategory = this.extractCategory(evicted);
      const currentCount = this.distributionMap.get(evictedCategory) ?? 0;
      if (currentCount <= 1) {
        this.distributionMap.delete(evictedCategory);
      } else {
        this.distributionMap.set(evictedCategory, currentCount - 1);
      }
    }

    // Track for getEventsSince
    this.appliedEvents.push(event);

    // Trim appliedEvents if too large — keep 1.5x buffer to retain recent
    // history overlap and reduce the chance of getEventsSince() missing events.
    if (this.appliedEvents.length > MAX_BUFFER * 2) {
      this.appliedEvents = this.appliedEvents.slice(-Math.floor(MAX_BUFFER * 1.5));
    }

    return true;
  }

  /** Clear all state (buffer, distribution, cursor, cache). */
  reset(): void {
    this.buffer = [];
    this.distributionMap.clear();
    this.appliedEvents = [];
    this._cursor = 0;
    this._lastEventTimeMs = null;
    this._totalIngested = 0;
    this._cachedSnapshot = null;
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private isIntentEvent(event: ProjectionEvent): boolean {
    return ACCEPTED_TYPES.has(event.type);
  }

  private extractCategory(event: ProjectionEvent): string {
    const payload = event.payload;
    // Check each candidate field with typeof guard and empty-string fallthrough
    for (const field of ['intent_category', 'intentCategory', 'intent_type', 'intentType']) {
      const val = payload[field];
      if (typeof val === 'string' && val.length > 0) return val;
    }
    return 'unknown';
  }

  /**
   * Insert event into buffer maintaining (eventTimeMs DESC, ingestSeq DESC) order.
   * Binary search for O(log n) position finding; O(n) total due to splice/unshift.
   */
  private insertSorted(event: ProjectionEvent): void {
    if (this.buffer.length === 0) {
      this.buffer.push(event);
      return;
    }

    // Fast path: newest event (most common case)
    const head = this.buffer[0];
    if (
      event.eventTimeMs > head.eventTimeMs ||
      (event.eventTimeMs === head.eventTimeMs && event.ingestSeq > head.ingestSeq)
    ) {
      this.buffer.unshift(event);
      return;
    }

    // Binary search for insertion position (descending order)
    let lo = 0;
    let hi = this.buffer.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midEvent = this.buffer[mid];
      if (
        event.eventTimeMs > midEvent.eventTimeMs ||
        (event.eventTimeMs === midEvent.eventTimeMs && event.ingestSeq > midEvent.ingestSeq)
      ) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    this.buffer.splice(lo, 0, event);
  }
}
