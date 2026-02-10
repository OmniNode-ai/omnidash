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

import type {
  ProjectionView,
  ProjectionResponse,
  ProjectionEventsResponse,
  ProjectionEvent,
} from '../projection-service';

// ============================================================================
// Constants
// ============================================================================

/** Internal buffer cap. Snapshot ?limit clamps to this. */
const MAX_BUFFER = 500;

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
// Payload Type
// ============================================================================

export interface IntentDistributionEntry {
  category: string;
  count: number;
  percentage: number;
}

/**
 * Snapshot payload returned by getSnapshot().
 * Client treats this as the authoritative source of truth.
 */
export interface IntentPayload {
  recentIntents: ProjectionEvent[];
  distribution: IntentDistributionEntry[];
  totalIntents: number;
  categoryCount: number;
  lastEventTimeMs: number | null;
}

// ============================================================================
// IntentProjectionView
// ============================================================================

export class IntentProjectionView implements ProjectionView<IntentPayload> {
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

  /** Total intents ever applied (including evicted). */
  private _totalApplied = 0;

  // --------------------------------------------------------------------------
  // ProjectionView interface
  // --------------------------------------------------------------------------

  getSnapshot(options?: { limit?: number }): ProjectionResponse<IntentPayload> {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), MAX_BUFFER);
    const recentIntents = this.buffer.slice(0, limit);

    const totalIntents =
      this.distributionMap.size > 0
        ? Array.from(this.distributionMap.values()).reduce((sum, c) => sum + c, 0)
        : 0;

    const distribution: IntentDistributionEntry[] = Array.from(this.distributionMap.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalIntents > 0 ? (count / totalIntents) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      viewId: this.viewId,
      cursor: this._cursor,
      snapshotTimeMs: Date.now(),
      payload: {
        recentIntents,
        distribution,
        totalIntents,
        categoryCount: this.distributionMap.size,
        lastEventTimeMs: this._lastEventTimeMs,
      },
    };
  }

  getEventsSince(cursor: number, limit?: number): ProjectionEventsResponse {
    const filtered = this.appliedEvents.filter((e) => e.ingestSeq > cursor);
    const result = limit ? filtered.slice(0, limit) : filtered;
    return {
      viewId: this.viewId,
      cursor: result.length > 0 ? result[result.length - 1].ingestSeq : cursor,
      snapshotTimeMs: Date.now(),
      events: result,
    };
  }

  applyEvent(event: ProjectionEvent): boolean {
    if (!this.isIntentEvent(event)) return false;

    // Track cursor
    if (event.ingestSeq > this._cursor) {
      this._cursor = event.ingestSeq;
    }

    // Track last event time
    if (event.eventTimeMs > 0) {
      this._lastEventTimeMs = event.eventTimeMs;
    }

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
    this._totalApplied++;

    // Trim appliedEvents if too large (keep last MAX_BUFFER * 2)
    if (this.appliedEvents.length > MAX_BUFFER * 2) {
      this.appliedEvents = this.appliedEvents.slice(-MAX_BUFFER);
    }

    return true;
  }

  reset(): void {
    this.buffer = [];
    this.distributionMap.clear();
    this.appliedEvents = [];
    this._cursor = 0;
    this._lastEventTimeMs = null;
    this._totalApplied = 0;
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private isIntentEvent(event: ProjectionEvent): boolean {
    return ACCEPTED_TYPES.has(event.type);
  }

  private extractCategory(event: ProjectionEvent): string {
    const payload = event.payload;
    return (
      (payload.intent_category as string) ??
      (payload.intentCategory as string) ??
      (payload.intent_type as string) ??
      (payload.intentType as string) ??
      'unknown'
    );
  }

  /**
   * Insert event into buffer maintaining (eventTimeMs DESC, ingestSeq DESC) order.
   * Binary search for O(log n) position finding.
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
