/**
 * EventBusProjection — Server-Side Materialized View (OMN-2095)
 *
 * Replaces the 1020-line useEventBusStream client hook with a server-side
 * materialized view. Aggregates maintained incrementally.
 *
 * Complexity (n = buffer size, capped at MAX_BUFFER_SIZE = 500):
 * - insert:   O(log n) binary search + O(n) splice shift
 * - evict:    O(1) pop + O(1) counter updates
 * - snapshot: O(k) Map-to-object serialization + O(m log m) timeSeries sort
 *
 * Maintained state:
 * - events:             Bounded buffer (500 max), binary insert by (eventTimeMs DESC, ingestSeq DESC)
 * - topicBreakdown:     Map<string, number>, insert: ++count[topic], evict: --count[topic]
 * - eventTypeBreakdown: Map<string, number>, same pattern
 * - timeSeries:         Map<bucketKey, number>, 15s buckets, prune >5min on read
 * - rollingWindow:      number[] of ingest timestamps for EPS calculation
 * - cursor:             max(ingestSeq) across all events in buffer
 */

import type {
  ProjectionView,
  ProjectionEvent,
  ProjectionResponse,
  ProjectionEventsResponse,
} from '../projection-service';

// ============================================================================
// Constants
// ============================================================================

export const MAX_BUFFER_SIZE = 500;
export const TIME_SERIES_BUCKET_MS = 15_000; // 15 seconds
export const TIME_SERIES_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const ROLLING_WINDOW_MS = 60_000; // 60 seconds for EPS
const ROLLING_WINDOW_MAX_ENTRIES = 10_000;

// ============================================================================
// Types
// ============================================================================

/**
 * Snapshot payload returned by getSnapshot().
 * All aggregates are pre-computed — no O(n) scans on read.
 * SYNC: Must match client/src/lib/data-sources/event-bus-projection-source.ts → EventBusPayload
 */
export interface EventBusPayload {
  events: ProjectionEvent[];
  topicBreakdown: Record<string, number>;
  eventTypeBreakdown: Record<string, number>;
  timeSeries: Array<{ bucketKey: number; count: number }>;
  eventsPerSecond: number;
  errorCount: number;
  activeTopics: number;
  totalEventsIngested: number;
}

// ============================================================================
// Implementation
// ============================================================================

export class EventBusProjection implements ProjectionView<EventBusPayload> {
  readonly viewId = 'event-bus';

  /** Sorted by (eventTimeMs DESC, ingestSeq DESC) — newest first */
  private events: ProjectionEvent[] = [];
  private topicCounts = new Map<string, number>();
  private eventTypeCounts = new Map<string, number>();
  private timeSeriesBuckets = new Map<number, number>();
  /** Ingest-time timestamps for EPS calculation (sorted ASC) */
  private rollingWindow: number[] = [];
  private _cursor = 0;
  private _totalIngested = 0;
  private _errorCount = 0;

  // --------------------------------------------------------------------------
  // ProjectionView interface
  // --------------------------------------------------------------------------

  getSnapshot(options?: { limit?: number }): ProjectionResponse<EventBusPayload> {
    const limit = options?.limit ?? this.events.length;

    // Prune stale time series buckets and rolling window entries
    this.pruneTimeSeries();
    this.pruneRollingWindow();

    // Compute EPS from rolling window
    const windowSeconds = ROLLING_WINDOW_MS / 1000;
    const eps =
      this.rollingWindow.length > 0
        ? Math.round((this.rollingWindow.length / windowSeconds) * 10) / 10
        : 0;

    // Serialize maps to plain objects
    const topicBreakdown: Record<string, number> = {};
    for (const [k, v] of this.topicCounts) topicBreakdown[k] = v;

    const eventTypeBreakdown: Record<string, number> = {};
    for (const [k, v] of this.eventTypeCounts) eventTypeBreakdown[k] = v;

    // Convert time series to sorted array
    const timeSeries: Array<{ bucketKey: number; count: number }> = [];
    for (const [k, v] of this.timeSeriesBuckets) {
      timeSeries.push({ bucketKey: k, count: v });
    }
    timeSeries.sort((a, b) => a.bucketKey - b.bucketKey);

    return {
      viewId: this.viewId,
      cursor: this._cursor,
      snapshotTimeMs: Date.now(),
      payload: {
        events: this.events.slice(0, limit),
        topicBreakdown,
        eventTypeBreakdown,
        timeSeries,
        eventsPerSecond: eps,
        errorCount: this._errorCount,
        activeTopics: this.topicCounts.size,
        totalEventsIngested: this._totalIngested,
      },
    };
  }

  getEventsSince(cursor: number, limit?: number): ProjectionEventsResponse {
    // Collect events with ingestSeq > cursor
    const matched: ProjectionEvent[] = [];
    for (const e of this.events) {
      if (e.ingestSeq > cursor) matched.push(e);
    }

    // Sort ASC by ingestSeq for client playback order
    matched.sort((a, b) => a.ingestSeq - b.ingestSeq);
    const result = limit ? matched.slice(0, limit) : matched;

    return {
      viewId: this.viewId,
      cursor: result.length > 0 ? result[result.length - 1].ingestSeq : cursor,
      snapshotTimeMs: Date.now(),
      events: result,
    };
  }

  applyEvent(event: ProjectionEvent): boolean {
    this._totalIngested++;

    // Track errors in buffer
    if (event.severity === 'error' || event.severity === 'critical') {
      this._errorCount++;
    }

    // Binary insert into sorted buffer (eventTimeMs DESC, ingestSeq DESC)
    const insertPos = this.findInsertPosition(event);
    this.events.splice(insertPos, 0, event);

    // Increment aggregate counters
    this.incrementCounters(event);

    // Track ingest time for EPS calculation
    const now = Date.now();
    this.rollingWindow.push(now);

    // Prune inline if cap exceeded — use time-based cutoff (not arbitrary halving)
    // to avoid including stale entries that would skew EPS readings.
    if (this.rollingWindow.length > ROLLING_WINDOW_MAX_ENTRIES) {
      const cutoff = now - ROLLING_WINDOW_MS;
      let pruneIdx = 0;
      while (pruneIdx < this.rollingWindow.length && this.rollingWindow[pruneIdx] < cutoff) {
        pruneIdx++;
      }
      this.rollingWindow = pruneIdx > 0 ? this.rollingWindow.slice(pruneIdx) : this.rollingWindow;
    }

    // Evict oldest if over capacity
    if (this.events.length > MAX_BUFFER_SIZE) {
      const evicted = this.events.pop()!;
      this.decrementCounters(evicted);

      // Adjust error count for evicted error events
      if (evicted.severity === 'error' || evicted.severity === 'critical') {
        this._errorCount = Math.max(0, this._errorCount - 1);
      }
    }

    // Update cursor
    this._cursor = Math.max(this._cursor, event.ingestSeq);

    return true;
  }

  reset(): void {
    this.events = [];
    this.topicCounts.clear();
    this.eventTypeCounts.clear();
    this.timeSeriesBuckets.clear();
    this.rollingWindow = [];
    this._cursor = 0;
    this._totalIngested = 0;
    this._errorCount = 0;
  }

  // --------------------------------------------------------------------------
  // Binary insert
  // --------------------------------------------------------------------------

  /**
   * Find insert position for DESC sort: (eventTimeMs DESC, ingestSeq DESC).
   * Binary search — O(log n) comparisons.
   *
   * The array is sorted newest-first. An event with higher eventTimeMs
   * (or same eventTimeMs but higher ingestSeq) goes at a lower index.
   */
  private findInsertPosition(event: ProjectionEvent): number {
    let low = 0;
    let high = this.events.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const existing = this.events[mid];

      // DESC: new event goes BEFORE existing if it's "newer"
      if (event.eventTimeMs > existing.eventTimeMs) {
        high = mid;
      } else if (event.eventTimeMs < existing.eventTimeMs) {
        low = mid + 1;
      } else {
        // Same eventTimeMs — tie-break on ingestSeq DESC
        if (event.ingestSeq > existing.ingestSeq) {
          high = mid;
        } else {
          low = mid + 1;
        }
      }
    }

    return low;
  }

  // --------------------------------------------------------------------------
  // Incremental aggregate maintenance
  // --------------------------------------------------------------------------

  private incrementCounters(event: ProjectionEvent): void {
    // Topic breakdown
    const topicCount = this.topicCounts.get(event.topic) ?? 0;
    this.topicCounts.set(event.topic, topicCount + 1);

    // Event type breakdown
    const typeCount = this.eventTypeCounts.get(event.type) ?? 0;
    this.eventTypeCounts.set(event.type, typeCount + 1);

    // Time series bucket (skip sentinel timestamp events)
    if (event.eventTimeMs > 0) {
      const bucketKey =
        Math.floor(event.eventTimeMs / TIME_SERIES_BUCKET_MS) * TIME_SERIES_BUCKET_MS;
      const bucketCount = this.timeSeriesBuckets.get(bucketKey) ?? 0;
      this.timeSeriesBuckets.set(bucketKey, bucketCount + 1);
    }
  }

  private decrementCounters(event: ProjectionEvent): void {
    // Topic breakdown
    const topicCount = (this.topicCounts.get(event.topic) ?? 0) - 1;
    if (topicCount <= 0) {
      this.topicCounts.delete(event.topic);
    } else {
      this.topicCounts.set(event.topic, topicCount);
    }

    // Event type breakdown
    const typeCount = (this.eventTypeCounts.get(event.type) ?? 0) - 1;
    if (typeCount <= 0) {
      this.eventTypeCounts.delete(event.type);
    } else {
      this.eventTypeCounts.set(event.type, typeCount);
    }

    // Time series bucket
    if (event.eventTimeMs > 0) {
      const bucketKey =
        Math.floor(event.eventTimeMs / TIME_SERIES_BUCKET_MS) * TIME_SERIES_BUCKET_MS;
      const bucketCount = (this.timeSeriesBuckets.get(bucketKey) ?? 0) - 1;
      if (bucketCount <= 0) {
        this.timeSeriesBuckets.delete(bucketKey);
      } else {
        this.timeSeriesBuckets.set(bucketKey, bucketCount);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Pruning (called lazily on getSnapshot)
  // --------------------------------------------------------------------------

  private pruneTimeSeries(): void {
    const cutoff = Date.now() - TIME_SERIES_MAX_AGE_MS;
    const cutoffBucket = Math.floor(cutoff / TIME_SERIES_BUCKET_MS) * TIME_SERIES_BUCKET_MS;

    for (const bucketKey of this.timeSeriesBuckets.keys()) {
      if (bucketKey < cutoffBucket) {
        this.timeSeriesBuckets.delete(bucketKey);
      }
    }
  }

  private pruneRollingWindow(): void {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;

    // Rolling window is sorted ASC (push appends), use binary search
    let low = 0;
    let high = this.rollingWindow.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.rollingWindow[mid] < cutoff) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    if (low > 0) {
      this.rollingWindow = this.rollingWindow.slice(low);
    }
  }

  // --------------------------------------------------------------------------
  // Diagnostic helpers
  // --------------------------------------------------------------------------

  get bufferSize(): number {
    return this.events.length;
  }

  get cursor(): number {
    return this._cursor;
  }

  get totalIngested(): number {
    return this._totalIngested;
  }
}
