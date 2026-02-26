/**
 * Monotonic Merge Utility (OMN-1804)
 *
 * Enforces event-time-wins ordering so that older events can never overwrite
 * newer state. Events arrive out of order from DB preload and Kafka replay;
 * this module provides a lightweight freshness gate that rejects stale events.
 *
 * Design:
 * - Pure utility with no external dependencies (easily testable)
 * - Per-key tracking: each view/topic/event-type has its own position cursor
 * - Stable tie-break: when eventTime is equal, higher seq (Kafka offset) wins
 * - Debug-level logging for rejected events (rejections are expected during replay)
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Sentinel timestamp for events with no valid timestamp.
 *
 * Convention: events with missing timestamps are assigned epoch 0 (1970-01-01),
 * making them the OLDEST possible events. This ensures they:
 *   - Never overwrite events that have real timestamps (monotonic merge rejects them)
 *   - Are always overwritten by any event with a real timestamp
 *   - Sort to the beginning (oldest end) in any time-ordered collection
 *
 * The alternative — using Date.now() — would incorrectly treat timestamp-less
 * events as the NEWEST, allowing them to block future events with real (but
 * slightly earlier) timestamps from being applied. This violates the monotonic
 * guarantee and causes data loss.
 */
export const MISSING_TIMESTAMP_SENTINEL_MS = 0;

// ============================================================================
// Types
// ============================================================================

/**
 * Position of an event in the total ordering.
 *
 * @property eventTime - Epoch milliseconds from the event's own timestamp.
 *   Events with no valid timestamp use {@link MISSING_TIMESTAMP_SENTINEL_MS} (epoch 0),
 *   which treats them as the oldest possible event. See the constant's doc for rationale.
 * @property seq       - Tie-breaker: Kafka offset, DB row id, or monotonic counter
 */
export interface EventPosition {
  eventTime: number;
  seq: number;
}

// ============================================================================
// Core Function
// ============================================================================

/**
 * Determine whether an incoming event should be applied (is newer) or
 * rejected (is older or equal to the last applied event).
 *
 * Missing-timestamp handling: events without a valid timestamp should have
 * eventTime set to {@link MISSING_TIMESTAMP_SENTINEL_MS} (epoch 0) by the
 * caller (see {@link extractEventTimeMs}). This means:
 *   - A timestamp-less event will be accepted as the first event for a key
 *   - A timestamp-less event will be REJECTED if any event with a real
 *     timestamp (or even another epoch-0 event with higher seq) was already applied
 *   - A real-timestamped event will always overwrite a previously applied
 *     timestamp-less event (since any real timestamp > 0)
 *
 * This is the correct behavior: timestamp-less events should never block
 * or overwrite events that have real timestamps.
 *
 * @param lastApplied - Position of the most recently applied event (null = first event)
 * @param incoming    - Position of the event being evaluated
 * @returns true if the incoming event should be applied, false if stale
 */
export function shouldApplyEvent(
  lastApplied: EventPosition | null,
  incoming: EventPosition
): boolean {
  if (!lastApplied) return true; // first event always applies
  if (incoming.eventTime > lastApplied.eventTime) return true;
  if (incoming.eventTime === lastApplied.eventTime && incoming.seq > lastApplied.seq) return true;
  return false;
}

// ============================================================================
// Tracker Class
// ============================================================================

/**
 * Tracks per-key (topic/view) last-applied event positions and provides
 * a single checkAndUpdate() call that atomically tests and advances the cursor.
 *
 * Also tracks rejection counts for operational visibility.
 */
export class MonotonicMergeTracker {
  /** Defensive cap to prevent unbounded growth if topics proliferate. */
  private static readonly MAX_TRACKED_KEYS = 5000;

  private positions = new Map<string, EventPosition>();
  private _rejectedCount = 0;

  /**
   * Check whether an event should be applied for the given key.
   * If it should, the internal cursor is advanced atomically.
   * If rejected, the rejection counter is incremented and a debug log is emitted.
   *
   * @param key      - Tracking key (e.g. topic name, event type, view identifier)
   * @param incoming - Position of the incoming event
   * @returns true if the event was accepted (cursor advanced), false if rejected
   */
  checkAndUpdate(key: string, incoming: EventPosition): boolean {
    const lastApplied = this.positions.get(key) ?? null;

    if (shouldApplyEvent(lastApplied, incoming)) {
      this.positions.set(key, incoming);

      // Evict oldest entries if the map exceeds the defensive cap.
      // In practice the map is bounded by topic:partition cardinality (~800),
      // but this prevents runaway growth if topics proliferate unexpectedly.
      //
      // Performance: O(n) linear scan over all entries. Acceptable for ~800
      // keys but would need an LRU or min-heap if key count grows past ~5K.
      if (this.positions.size > MonotonicMergeTracker.MAX_TRACKED_KEYS) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [k, pos] of this.positions) {
          if (pos.eventTime < oldestTime) {
            oldestTime = pos.eventTime;
            oldestKey = k;
          }
        }
        if (oldestKey) this.positions.delete(oldestKey);
      }

      return true;
    }

    this._rejectedCount++;
    // Debug-level: rejections are expected during replay and preload merge
    console.debug(
      `[monotonic] Rejected stale event: key=${key}, event_time=${incoming.eventTime}, seq=${incoming.seq}` +
        (lastApplied
          ? ` (last applied: time=${lastApplied.eventTime}, seq=${lastApplied.seq})`
          : '')
    );
    return false;
  }

  /** Total number of rejected (stale) events across all keys. */
  get rejectedCount(): number {
    return this._rejectedCount;
  }

  /** Reset the tracker state (useful for testing or demo mode state resets). */
  reset(): void {
    this.positions.clear();
    this._rejectedCount = 0;
  }

  /** Get the last applied position for a given key, or null if no events tracked. */
  getPosition(key: string): EventPosition | null {
    return this.positions.get(key) ?? null;
  }

  /** Number of distinct keys being tracked. */
  get trackedKeyCount(): number {
    return this.positions.size;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract an epoch-ms timestamp from a raw event object.
 * Looks for common timestamp field names in order of preference.
 *
 * Returns {@link MISSING_TIMESTAMP_SENTINEL_MS} (epoch 0) if no valid
 * timestamp is found. This treats events without timestamps as the OLDEST
 * possible, which prevents them from blocking newer events in monotonic
 * merge ordering.
 *
 * WARNING: Using `Date.now()` as a fallback would be INCORRECT — it would
 * make timestamp-less events appear as the NEWEST, causing them to:
 *   1. Win the monotonic merge gate against all prior events
 *   2. Block future events with real (but slightly earlier) timestamps
 *   3. Violate the event-time-wins ordering guarantee
 *
 * Callers that need to persist a timestamp for DB rows should handle the
 * epoch-0 sentinel separately (e.g., fall back to Kafka message.timestamp
 * or Date.now() with a warning). See extraction-aggregator.ts for an example.
 */
export function extractEventTimeMs(event: Record<string, unknown>): number {
  // Try common timestamp fields in priority order
  const candidates = [
    event.emitted_at, // ONEX canonical envelope (consumer naming)
    event.envelope_timestamp, // ONEX canonical envelope (ModelEventEnvelope producer naming)
    event.timestamp, // Most common field name
    event.created_at, // DB row convention
    event.createdAt, // camelCase variant
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === 'string' && candidate.length > 0) {
      const parsed = new Date(candidate).getTime();
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  // No valid timestamp found — return sentinel (epoch 0 = oldest possible).
  // This is intentional: timestamp-less events must NOT be treated as newest.
  // Debug-level log: missing timestamps are common during tests and playback.
  console.debug(
    '[monotonic] Event has no valid timestamp field; assigning sentinel epoch 0 (oldest). ' +
      'Fields checked: emitted_at, envelope_timestamp, timestamp, created_at, createdAt'
  );
  return MISSING_TIMESTAMP_SENTINEL_MS;
}

/**
 * Parse a Kafka message offset string to a numeric seq value.
 * Returns 0 if the offset is not a valid number.
 */
export function parseOffsetAsSeq(offset: string | undefined | null): number {
  if (!offset) return 0;
  const parsed = parseInt(offset, 10);
  return isNaN(parsed) ? 0 : parsed;
}
