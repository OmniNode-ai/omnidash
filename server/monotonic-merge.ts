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
// Types
// ============================================================================

/**
 * Position of an event in the total ordering.
 *
 * @property eventTime - Epoch milliseconds from the event's own timestamp
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
 * Returns Date.now() as fallback if no valid timestamp is found.
 */
export function extractEventTimeMs(event: Record<string, unknown>): number {
  // Try common timestamp fields in priority order
  const candidates = [
    event.emitted_at, // ONEX canonical envelope
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

  return Date.now();
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
