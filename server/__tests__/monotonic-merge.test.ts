import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldApplyEvent,
  MonotonicMergeTracker,
  extractEventTimeMs,
  parseOffsetAsSeq,
  type EventPosition,
} from '../monotonic-merge';

describe('shouldApplyEvent', () => {
  it('should accept the first event when lastApplied is null', () => {
    expect(shouldApplyEvent(null, { eventTime: 1000, seq: 0 })).toBe(true);
  });

  it('should accept an event with a newer eventTime', () => {
    const last: EventPosition = { eventTime: 1000, seq: 5 };
    expect(shouldApplyEvent(last, { eventTime: 2000, seq: 0 })).toBe(true);
  });

  it('should reject an event with an older eventTime', () => {
    const last: EventPosition = { eventTime: 2000, seq: 5 };
    expect(shouldApplyEvent(last, { eventTime: 1000, seq: 10 })).toBe(false);
  });

  it('should accept an event with equal eventTime but higher seq', () => {
    const last: EventPosition = { eventTime: 1000, seq: 5 };
    expect(shouldApplyEvent(last, { eventTime: 1000, seq: 6 })).toBe(true);
  });

  it('should reject an event with equal eventTime and equal seq', () => {
    const last: EventPosition = { eventTime: 1000, seq: 5 };
    expect(shouldApplyEvent(last, { eventTime: 1000, seq: 5 })).toBe(false);
  });

  it('should reject an event with equal eventTime but lower seq', () => {
    const last: EventPosition = { eventTime: 1000, seq: 5 };
    expect(shouldApplyEvent(last, { eventTime: 1000, seq: 4 })).toBe(false);
  });

  it('should handle zero values correctly', () => {
    expect(shouldApplyEvent(null, { eventTime: 0, seq: 0 })).toBe(true);
    const last: EventPosition = { eventTime: 0, seq: 0 };
    expect(shouldApplyEvent(last, { eventTime: 0, seq: 1 })).toBe(true);
    expect(shouldApplyEvent(last, { eventTime: 1, seq: 0 })).toBe(true);
    expect(shouldApplyEvent(last, { eventTime: 0, seq: 0 })).toBe(false);
  });
});

describe('MonotonicMergeTracker', () => {
  let tracker: MonotonicMergeTracker;

  beforeEach(() => {
    tracker = new MonotonicMergeTracker();
  });

  it('should accept the first event for any key', () => {
    expect(tracker.checkAndUpdate('topic-a', { eventTime: 1000, seq: 0 })).toBe(true);
    expect(tracker.rejectedCount).toBe(0);
  });

  it('should track positions independently per key', () => {
    tracker.checkAndUpdate('topic-a', { eventTime: 2000, seq: 10 });
    tracker.checkAndUpdate('topic-b', { eventTime: 1000, seq: 5 });

    // topic-a is at time=2000, so time=1500 should be rejected
    expect(tracker.checkAndUpdate('topic-a', { eventTime: 1500, seq: 0 })).toBe(false);

    // topic-b is at time=1000, so time=1500 should be accepted
    expect(tracker.checkAndUpdate('topic-b', { eventTime: 1500, seq: 0 })).toBe(true);
  });

  it('should count rejections', () => {
    tracker.checkAndUpdate('key', { eventTime: 2000, seq: 10 });

    // Three stale events
    tracker.checkAndUpdate('key', { eventTime: 1000, seq: 0 });
    tracker.checkAndUpdate('key', { eventTime: 1500, seq: 0 });
    tracker.checkAndUpdate('key', { eventTime: 2000, seq: 9 });

    expect(tracker.rejectedCount).toBe(3);
  });

  it('should advance the cursor when accepting events', () => {
    tracker.checkAndUpdate('key', { eventTime: 1000, seq: 5 });
    const pos1 = tracker.getPosition('key');
    expect(pos1).toEqual({ eventTime: 1000, seq: 5 });

    tracker.checkAndUpdate('key', { eventTime: 2000, seq: 0 });
    const pos2 = tracker.getPosition('key');
    expect(pos2).toEqual({ eventTime: 2000, seq: 0 });
  });

  it('should NOT advance the cursor when rejecting events', () => {
    tracker.checkAndUpdate('key', { eventTime: 2000, seq: 10 });
    tracker.checkAndUpdate('key', { eventTime: 1000, seq: 5 }); // rejected

    const pos = tracker.getPosition('key');
    expect(pos).toEqual({ eventTime: 2000, seq: 10 });
  });

  it('should return null for unknown keys', () => {
    expect(tracker.getPosition('nonexistent')).toBeNull();
  });

  it('should track the number of distinct keys', () => {
    expect(tracker.trackedKeyCount).toBe(0);
    tracker.checkAndUpdate('a', { eventTime: 1, seq: 0 });
    tracker.checkAndUpdate('b', { eventTime: 1, seq: 0 });
    tracker.checkAndUpdate('c', { eventTime: 1, seq: 0 });
    expect(tracker.trackedKeyCount).toBe(3);
  });

  it('should reset all state', () => {
    tracker.checkAndUpdate('a', { eventTime: 1000, seq: 5 });
    tracker.checkAndUpdate('a', { eventTime: 500, seq: 0 }); // rejected

    expect(tracker.trackedKeyCount).toBe(1);
    expect(tracker.rejectedCount).toBe(1);

    tracker.reset();

    expect(tracker.trackedKeyCount).toBe(0);
    expect(tracker.rejectedCount).toBe(0);
    expect(tracker.getPosition('a')).toBeNull();

    // After reset, events should be accepted again
    expect(tracker.checkAndUpdate('a', { eventTime: 500, seq: 0 })).toBe(true);
  });

  it('should handle a realistic replay scenario (DB preload then Kafka)', () => {
    // Simulating: DB preload delivers events, then Kafka replays some older ones

    // DB preload events (arrive first, in chronological order from oldest to newest)
    expect(tracker.checkAndUpdate('routing', { eventTime: 1000, seq: 100 })).toBe(true);
    expect(tracker.checkAndUpdate('routing', { eventTime: 2000, seq: 200 })).toBe(true);
    expect(tracker.checkAndUpdate('routing', { eventTime: 3000, seq: 300 })).toBe(true);

    // Kafka replay starts: some events are older than what DB delivered
    expect(tracker.checkAndUpdate('routing', { eventTime: 1500, seq: 150 })).toBe(false); // stale
    expect(tracker.checkAndUpdate('routing', { eventTime: 2500, seq: 250 })).toBe(false); // stale
    expect(tracker.checkAndUpdate('routing', { eventTime: 3000, seq: 299 })).toBe(false); // same time, lower seq

    // New event from Kafka that is genuinely newer
    expect(tracker.checkAndUpdate('routing', { eventTime: 4000, seq: 400 })).toBe(true);

    expect(tracker.rejectedCount).toBe(3);
  });
});

describe('extractEventTimeMs', () => {
  it('should extract from emitted_at (numeric)', () => {
    expect(extractEventTimeMs({ emitted_at: 1700000000000 })).toBe(1700000000000);
  });

  it('should extract from emitted_at (ISO string)', () => {
    const iso = '2024-01-15T10:30:00.000Z';
    expect(extractEventTimeMs({ emitted_at: iso })).toBe(new Date(iso).getTime());
  });

  it('should extract from timestamp field', () => {
    const iso = '2024-06-01T12:00:00.000Z';
    expect(extractEventTimeMs({ timestamp: iso })).toBe(new Date(iso).getTime());
  });

  it('should extract from created_at field', () => {
    const iso = '2024-03-10T08:00:00.000Z';
    expect(extractEventTimeMs({ created_at: iso })).toBe(new Date(iso).getTime());
  });

  it('should extract from createdAt field (camelCase)', () => {
    const iso = '2024-03-10T08:00:00.000Z';
    expect(extractEventTimeMs({ createdAt: iso })).toBe(new Date(iso).getTime());
  });

  it('should prefer emitted_at over timestamp', () => {
    const emitted = '2024-06-01T12:00:00.000Z';
    const ts = '2024-01-01T00:00:00.000Z';
    expect(extractEventTimeMs({ emitted_at: emitted, timestamp: ts })).toBe(
      new Date(emitted).getTime()
    );
  });

  it('should fall back to Date.now() for events with no valid timestamp', () => {
    const before = Date.now();
    const result = extractEventTimeMs({});
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should fall back to Date.now() for invalid timestamp strings', () => {
    const before = Date.now();
    const result = extractEventTimeMs({ timestamp: 'not-a-date' });
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('should handle numeric timestamp field', () => {
    expect(extractEventTimeMs({ timestamp: 1700000000000 })).toBe(1700000000000);
  });

  it('should skip empty string fields', () => {
    const before = Date.now();
    const result = extractEventTimeMs({ timestamp: '', created_at: '' });
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

describe('parseOffsetAsSeq', () => {
  it('should parse a valid offset string', () => {
    expect(parseOffsetAsSeq('42')).toBe(42);
  });

  it('should parse zero offset', () => {
    expect(parseOffsetAsSeq('0')).toBe(0);
  });

  it('should return 0 for null', () => {
    expect(parseOffsetAsSeq(null)).toBe(0);
  });

  it('should return 0 for undefined', () => {
    expect(parseOffsetAsSeq(undefined)).toBe(0);
  });

  it('should return 0 for non-numeric string', () => {
    expect(parseOffsetAsSeq('abc')).toBe(0);
  });

  it('should handle large offsets', () => {
    expect(parseOffsetAsSeq('9999999999')).toBe(9999999999);
  });
});
