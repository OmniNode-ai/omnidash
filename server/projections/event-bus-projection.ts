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
 *             + O(n * w) burst detection (n = buffer, w = number of windowing calls, currently 6-7)
 *
 * Scaling note: Array.splice for sorted insertion is O(n) due to element
 * shifting. At MAX_BUFFER_SIZE=500 this is ~500 shifts per insert — well
 * within V8's optimized threshold (~microseconds). If MAX_BUFFER_SIZE needs
 * to grow beyond ~2000, replace the sorted array with a skip list or B-tree.
 *
 * Maintained state:
 * - events:             Bounded buffer (500 max), binary insert by (eventTimeMs DESC, ingestSeq DESC)
 * - topicBreakdown:     Map<string, number>, insert: ++count[topic], evict: --count[topic]
 * - eventTypeBreakdown: Map<string, number>, same pattern
 * - timeSeries:         Map<bucketKey, number>, 15s buckets, prune >5min on read
 * - rollingWindow:      number[] of ingest timestamps for EPS calculation
 * - cursor:             max(ingestSeq) across all events in buffer
 */

import type { ProjectionView } from '../projection-service';
import type {
  ProjectionEvent,
  ProjectionResponse,
  ProjectionEventsResponse,
} from '@shared/projection-types';
import {
  TIME_SERIES_BUCKET_MS,
  type EventBusPayload,
  type BurstInfo,
} from '@shared/event-bus-payload';
import { computeRate, computeErrorRate, countEventsInWindow } from '../lib/windowing-helpers';

export type { EventBusPayload, BurstInfo };
export { TIME_SERIES_BUCKET_MS };

// ============================================================================
// Burst Detection Config (OMN-2158)
// ============================================================================

export interface EventBusProjectionConfig {
  /** Unified monitoring window for baseline computation (default 5 min) */
  monitoringWindowMs?: number;
  /** Staleness threshold — independent from monitoring window (default 10 min) */
  stalenessThresholdMs?: number;
  /** Short window for burst detection (default 30s) */
  burstWindowMs?: number;
  /** Short-window rate must be >= this multiplier of baseline (default 3x) */
  burstThroughputMultiplier?: number;
  /** Min absolute events/sec to trigger throughput burst (default 5) */
  burstThroughputMinRate?: number;
  /** Short-window error rate must be >= this multiplier of baseline (default 2x) */
  burstErrorMultiplier?: number;
  /** Absolute error rate threshold — spike if exceeded (default 0.05 = 5%) */
  burstErrorAbsoluteThreshold?: number;
  /** Min events in short window to compute error rate (default 10) */
  burstErrorMinEvents?: number;
  /** Cooldown after burst detection to prevent flapping (default 15s) */
  burstCooldownMs?: number;
}

/** Default burst detection configuration — single source of truth for server-side defaults. */
export const DEFAULT_BURST_CONFIG = {
  monitoringWindowMs: 5 * 60 * 1000,
  stalenessThresholdMs: 10 * 60 * 1000,
  burstWindowMs: 30 * 1000,
  burstThroughputMultiplier: 3,
  burstThroughputMinRate: 5,
  burstErrorMultiplier: 2,
  burstErrorAbsoluteThreshold: 0.05,
  burstErrorMinEvents: 10,
  burstCooldownMs: 15 * 1000,
} as const;

// ============================================================================
// Constants
// ============================================================================

export const MAX_BUFFER_SIZE = 500;
export const TIME_SERIES_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const ROLLING_WINDOW_MS = 60_000; // 60 seconds for EPS
// Cap-based pruning fires when this threshold is exceeded; between prunes,
// the array can temporarily hold up to this many entries. At 166+ events/sec
// sustained, cap-based pruning kicks in; below that, only the lazy time-based
// prune in getSnapshot() trims stale entries. See applyEvent() for details.
const EPS_WINDOW_MAX_SAMPLES = 10_000;

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

  // ── Burst detection state (OMN-2158) ─────────────────────────────
  private readonly config: Required<EventBusProjectionConfig>;
  private _burstInfo: BurstInfo | null = null;

  constructor(config?: EventBusProjectionConfig) {
    this.config = { ...DEFAULT_BURST_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // ProjectionView interface
  // --------------------------------------------------------------------------

  /**
   * Build a point-in-time snapshot of the event bus state.
   *
   * Lazily prunes stale time-series buckets and rolling window entries
   * before computing EPS and serializing aggregates. The optional `limit`
   * caps the number of events included (defaults to the full buffer).
   *
   * DESIGN NOTE: This method has a write side effect — it updates `_burstInfo`
   * via `detectBurst()`. Burst detection is intentionally lazy (computed on
   * snapshot read, not on every applyEvent) because it requires windowed rate
   * calculations that would be wasteful to run on every insert. The tradeoff
   * is that burst detection timing is coupled to snapshot polling frequency
   * (currently 2s). If snapshot caching is introduced, burst detection must
   * be extracted to a separate `tick()` method called at a fixed interval.
   */
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

    // ── Burst detection (OMN-2158) ──────────────────────────────────
    const now = Date.now();
    const timeExtractor = (e: ProjectionEvent) => e.eventTimeMs;
    const isError = (e: ProjectionEvent) => e.severity === 'error' || e.severity === 'critical';

    // Windowed error rate (fixes latent whole-buffer bug)
    const windowedErrorRate = computeErrorRate(
      this.events,
      this.config.monitoringWindowMs,
      timeExtractor,
      isError,
      now
    );

    // Burst detection with cooldown
    this._burstInfo = this.detectBurst(now, timeExtractor, isError);

    return {
      viewId: this.viewId,
      cursor: this._cursor,
      snapshotTimeMs: now,
      payload: {
        events: this.events.slice(0, limit),
        topicBreakdown,
        eventTypeBreakdown,
        timeSeries,
        eventsPerSecond: eps,
        errorCount: this._errorCount,
        activeTopics: this.topicCounts.size,
        totalEventsIngested: this._totalIngested,
        // Burst detection (OMN-2158)
        monitoringWindowMs: this.config.monitoringWindowMs,
        stalenessThresholdMs: this.config.stalenessThresholdMs,
        burstWindowMs: this.config.burstWindowMs,
        windowedErrorRate,
        burstInfo: this._burstInfo,
      },
    };
  }

  /**
   * Return events ingested after the given cursor, sorted ASC for client
   * playback order. Scans the full buffer (max 500 events) since events
   * are stored in DESC order and cursor gaps are possible after eviction.
   *
   * Complexity: O(n) scan + O(k log k) sort, where n = buffer size and
   * k = matched events. At MAX_BUFFER_SIZE=500 this is sub-millisecond.
   * If buffer grows beyond ~2000 or polling frequency increases, consider
   * adding a secondary index by ingestSeq (e.g. Map or ASC ring buffer).
   */
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

  /**
   * Ingest a single event into the projection, updating all aggregates
   * incrementally. Binary-inserts into the sorted buffer, increments
   * topic/type/time-series counters, and evicts the oldest event if the
   * buffer exceeds MAX_BUFFER_SIZE.
   *
   * Returns true unconditionally: EventBusProjection ingests ALL events
   * regardless of topic or type (full-stream materialization). Future views
   * with domain-scoped filtering (e.g. an IntentProjection that only cares
   * about `onex.intent.*` topics) should return false for irrelevant events
   * to avoid unnecessary invalidation broadcasts from ProjectionService.
   */
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

    // Dual-pruning strategy for the rolling window:
    //   1. Inline cap-based (here): triggers when the array exceeds 10,000 entries
    //      (EPS_WINDOW_MAX_SAMPLES) to bound memory under sustained high
    //      throughput (e.g. >166 events/s). Removes entries older than the 60s
    //      window rather than arbitrarily halving, so surviving entries are always
    //      within the EPS calculation window.
    //   2. Lazy time-based (pruneRollingWindow): runs on each getSnapshot() call
    //      to trim stale entries even when throughput is low and the cap is never hit.
    if (this.rollingWindow.length > EPS_WINDOW_MAX_SAMPLES) {
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

  /** Clear all state — buffer, counters, time series, rolling window, and burst state. */
  reset(): void {
    this.events = [];
    this.topicCounts.clear();
    this.eventTypeCounts.clear();
    this.timeSeriesBuckets.clear();
    this.rollingWindow = [];
    this._cursor = 0;
    this._totalIngested = 0;
    this._errorCount = 0;
    this._burstInfo = null;
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

  // Note: pruneTimeSeries may delete a bucket that still has events in the buffer.
  // If those events are later evicted, decrementCounters will attempt to decrement
  // a non-existent key (0 - 1 = -1 → delete). This is harmless: the delete is
  // a no-op on a missing key, and the time series is display-only with a 5-minute
  // window that rarely overlaps with the 500-event buffer tail.
  private pruneTimeSeries(): void {
    const cutoff = Date.now() - TIME_SERIES_MAX_AGE_MS;
    const cutoffBucket = Math.floor(cutoff / TIME_SERIES_BUCKET_MS) * TIME_SERIES_BUCKET_MS;

    // Use strict `<` (not `<=`): the cutoff bucket itself may partially overlap
    // with the retention window, so we keep it. Deleting from a Map during
    // iteration over its keys is safe per the ES2015 Map specification.
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
  // Burst Detection (OMN-2158)
  // --------------------------------------------------------------------------

  /**
   * Detect throughput bursts and error spikes with cooldown.
   *
   * Priority: error spike > throughput burst (staleness is handled client-side).
   *
   * Cooldown behavior: once a burst is detected, the burstInfo persists until
   * cooldownUntil expires — even if the instantaneous rate drops back to normal.
   * This prevents the banner from flapping on/off within seconds.
   */
  private detectBurst(
    now: number,
    timeExtractor: (e: ProjectionEvent) => number,
    isError: (e: ProjectionEvent) => boolean
  ): BurstInfo | null {
    // If we're in cooldown from a previous burst, keep showing it
    if (this._burstInfo && now < this._burstInfo.cooldownUntil) {
      return this._burstInfo;
    }

    // Check error spike first (higher priority than throughput burst)
    const errorSpike = this.detectErrorSpike(now, timeExtractor, isError);
    if (errorSpike) return errorSpike;

    // Check throughput burst
    const throughputBurst = this.detectThroughputBurst(now, timeExtractor);
    if (throughputBurst) return throughputBurst;

    // No burst detected — clear any expired burst info
    return null;
  }

  private detectThroughputBurst(
    now: number,
    timeExtractor: (e: ProjectionEvent) => number
  ): BurstInfo | null {
    const cfg = this.config;

    const shortRate = computeRate(this.events, cfg.burstWindowMs, timeExtractor, now);
    const baselineRate = computeRate(this.events, cfg.monitoringWindowMs, timeExtractor, now);

    // Guard: short-window rate must meet minimum absolute threshold
    if (shortRate < cfg.burstThroughputMinRate) return null;

    // Guard: baseline must be > 0 to compute meaningful multiplier
    if (baselineRate <= 0) return null;

    const multiplier = shortRate / baselineRate;
    if (multiplier < cfg.burstThroughputMultiplier) return null;

    return {
      type: 'throughput',
      shortWindowRate: Math.round(shortRate * 10) / 10,
      baselineRate: Math.round(baselineRate * 10) / 10,
      multiplier: Math.round(multiplier * 10) / 10,
      detectedAt: now,
      cooldownUntil: now + cfg.burstCooldownMs,
    };
  }

  private detectErrorSpike(
    now: number,
    timeExtractor: (e: ProjectionEvent) => number,
    isError: (e: ProjectionEvent) => boolean
  ): BurstInfo | null {
    const cfg = this.config;

    // Sample size gate: need enough events in the short window
    const shortWindowCount = countEventsInWindow(
      this.events,
      cfg.burstWindowMs,
      timeExtractor,
      now
    );
    if (shortWindowCount < cfg.burstErrorMinEvents) return null;

    const shortErrorRate = computeErrorRate(
      this.events,
      cfg.burstWindowMs,
      timeExtractor,
      isError,
      now
    );
    const baselineErrorRate = computeErrorRate(
      this.events,
      cfg.monitoringWindowMs,
      timeExtractor,
      isError,
      now
    );

    // Two trigger conditions (OR):
    // 1. Short-window error rate >= multiplier of baseline
    // 2. Short-window error rate >= absolute threshold
    const exceedsMultiplier =
      baselineErrorRate > 0 && shortErrorRate / baselineErrorRate >= cfg.burstErrorMultiplier;
    const exceedsAbsolute = shortErrorRate >= cfg.burstErrorAbsoluteThreshold;

    if (!exceedsMultiplier && !exceedsAbsolute) return null;

    // When baseline is zero, the multiplier concept is meaningless.
    // Use null to signal "new errors from zero baseline" — the client
    // renders this as "new" rather than a misleading "50x".
    // Note: null is JSON-safe (unlike Infinity which serializes to null implicitly).
    const multiplier = baselineErrorRate > 0 ? shortErrorRate / baselineErrorRate : null;

    return {
      type: 'error_spike',
      shortWindowRate: Math.round(shortErrorRate * 1000) / 1000,
      baselineRate: Math.round(baselineErrorRate * 1000) / 1000,
      multiplier: multiplier != null ? Math.round(multiplier * 10) / 10 : null,
      detectedAt: now,
      cooldownUntil: now + cfg.burstCooldownMs,
    };
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
