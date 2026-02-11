/**
 * IntentProjectionView Tests (OMN-2096)
 *
 * Covers:
 * - Event filtering (ACCEPTED_TYPES only)
 * - Buffer ordering (eventTimeMs DESC, ingestSeq DESC)
 * - CRITICAL: Equal eventTimeMs stable ordering via ingestSeq (v3)
 * - Distribution tracking (incremental insert/evict)
 * - Snapshot envelope shape and limit clamping
 * - Events-since cursor queries
 * - Reset behavior
 * - Eviction at MAX_BUFFER boundary (500)
 * - Category extraction from various payload shapes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IntentProjectionView, INTENT_VIEW_ID } from '../projections/intent-projection';
import type { ProjectionEvent } from '../projection-service';

// ============================================================================
// Test Helpers
// ============================================================================

let seqCounter = 0;

function intentEvent(overrides: Partial<ProjectionEvent> = {}): ProjectionEvent {
  seqCounter++;
  return {
    id: `test-${seqCounter}`,
    eventTimeMs: Date.now(),
    ingestSeq: seqCounter,
    topic: 'intent-classified',
    type: 'IntentClassified',
    source: 'test',
    severity: 'info',
    payload: {
      intent_category: 'debugging',
      confidence: 0.95,
      session_ref: 'session-1',
    },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('IntentProjectionView', () => {
  let view: IntentProjectionView;

  beforeEach(() => {
    view = new IntentProjectionView();
    seqCounter = 0;
  });

  // --------------------------------------------------------------------------
  // View Identity
  // --------------------------------------------------------------------------

  describe('view identity', () => {
    it('should have viewId matching INTENT_VIEW_ID constant', () => {
      expect(view.viewId).toBe(INTENT_VIEW_ID);
      expect(view.viewId).toBe('intent');
    });
  });

  // --------------------------------------------------------------------------
  // Event Filtering
  // --------------------------------------------------------------------------

  describe('event filtering', () => {
    it('should accept IntentClassified events', () => {
      const result = view.applyEvent(intentEvent({ type: 'IntentClassified' }));
      expect(result).toBe(true);
    });

    it('should accept intent-classified events (kebab-case)', () => {
      const result = view.applyEvent(intentEvent({ type: 'intent-classified' }));
      expect(result).toBe(true);
    });

    it('should accept INTENT_CLASSIFIED events (UPPER_SNAKE_CASE)', () => {
      const result = view.applyEvent(intentEvent({ type: 'INTENT_CLASSIFIED' }));
      expect(result).toBe(true);
    });

    it('should accept IntentStored events', () => {
      const result = view.applyEvent(intentEvent({ type: 'IntentStored' }));
      expect(result).toBe(true);
    });

    it('should accept intent-stored events (kebab-case)', () => {
      const result = view.applyEvent(intentEvent({ type: 'intent-stored' }));
      expect(result).toBe(true);
    });

    it('should accept INTENT_STORED events (UPPER_SNAKE_CASE)', () => {
      const result = view.applyEvent(intentEvent({ type: 'INTENT_STORED' }));
      expect(result).toBe(true);
    });

    it('should reject events with non-intent types', () => {
      expect(view.applyEvent(intentEvent({ type: 'node-heartbeat' }))).toBe(false);
      expect(view.applyEvent(intentEvent({ type: 'session-started' }))).toBe(false);
      expect(view.applyEvent(intentEvent({ type: 'agent-actions' }))).toBe(false);
      expect(view.applyEvent(intentEvent({ type: 'unknown' }))).toBe(false);
    });

    it('should not mutate state when an event is rejected', () => {
      view.applyEvent(intentEvent({ type: 'node-heartbeat' }));
      const snapshot = view.getSnapshot();
      expect(snapshot.payload.recentIntents).toHaveLength(0);
      expect(snapshot.payload.totalIntents).toBe(0);
      expect(snapshot.cursor).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Buffer Ordering
  // --------------------------------------------------------------------------

  describe('buffer ordering', () => {
    it('should order events by eventTimeMs DESC', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, eventTimeMs: 1000, id: 'old' }));
      view.applyEvent(intentEvent({ ingestSeq: 2, eventTimeMs: 3000, id: 'new' }));
      view.applyEvent(intentEvent({ ingestSeq: 3, eventTimeMs: 2000, id: 'mid' }));

      const snapshot = view.getSnapshot();
      const ids = snapshot.payload.recentIntents.map((e) => e.id);
      expect(ids).toEqual(['new', 'mid', 'old']);
    });

    it('should order events by ingestSeq DESC when eventTimeMs is equal', () => {
      const sameTime = 1700000000000;

      view.applyEvent(
        intentEvent({
          ingestSeq: 1,
          eventTimeMs: sameTime,
          id: 'a',
          payload: { intent_category: 'cat-a' },
        })
      );
      view.applyEvent(
        intentEvent({
          ingestSeq: 2,
          eventTimeMs: sameTime,
          id: 'b',
          payload: { intent_category: 'cat-b' },
        })
      );
      view.applyEvent(
        intentEvent({
          ingestSeq: 3,
          eventTimeMs: sameTime,
          id: 'c',
          payload: { intent_category: 'cat-c' },
        })
      );

      const snapshot = view.getSnapshot();
      const ids = snapshot.payload.recentIntents.map((e) => e.id);

      // Higher ingestSeq should come first (DESC order)
      expect(ids).toEqual(['c', 'b', 'a']);
    });

    it('should maintain stable ordering when eventTimeMs is equal but ingestSeq differs (v3 CRITICAL)', () => {
      // This is the CRITICAL v3 requirement: two intents with EQUAL eventTimeMs
      // but different ingestSeq must maintain stable ordering by ingestSeq DESC.
      const sameTime = 1700000000000;

      view.applyEvent(
        intentEvent({
          ingestSeq: 10,
          eventTimeMs: sameTime,
          id: 'first',
          payload: { intent_category: 'alpha' },
        })
      );
      view.applyEvent(
        intentEvent({
          ingestSeq: 20,
          eventTimeMs: sameTime,
          id: 'second',
          payload: { intent_category: 'beta' },
        })
      );
      view.applyEvent(
        intentEvent({
          ingestSeq: 15,
          eventTimeMs: sameTime,
          id: 'middle',
          payload: { intent_category: 'gamma' },
        })
      );

      const snapshot = view.getSnapshot();
      const ids = snapshot.payload.recentIntents.map((e) => e.id);

      // Sorted by ingestSeq DESC: 20, 15, 10
      expect(ids).toEqual(['second', 'middle', 'first']);
    });

    it('should use eventTimeMs as primary sort and ingestSeq as tiebreaker', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, eventTimeMs: 2000, id: 'time2-seq1' }));
      view.applyEvent(intentEvent({ ingestSeq: 2, eventTimeMs: 2000, id: 'time2-seq2' }));
      view.applyEvent(intentEvent({ ingestSeq: 3, eventTimeMs: 3000, id: 'time3-seq3' }));
      view.applyEvent(intentEvent({ ingestSeq: 4, eventTimeMs: 1000, id: 'time1-seq4' }));

      const snapshot = view.getSnapshot();
      const ids = snapshot.payload.recentIntents.map((e) => e.id);

      // time3 > time2 > time1, within time2: seq2 > seq1
      expect(ids).toEqual(['time3-seq3', 'time2-seq2', 'time2-seq1', 'time1-seq4']);
    });

    it('should insert the newest event at position 0 (fast path)', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, eventTimeMs: 1000, id: 'first' }));
      view.applyEvent(intentEvent({ ingestSeq: 2, eventTimeMs: 2000, id: 'second' }));

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.recentIntents[0].id).toBe('second');
    });
  });

  // --------------------------------------------------------------------------
  // Distribution Tracking
  // --------------------------------------------------------------------------

  describe('distribution tracking', () => {
    it('should increment category count on insert', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, payload: { intent_category: 'debugging' } }));
      view.applyEvent(intentEvent({ ingestSeq: 2, payload: { intent_category: 'debugging' } }));
      view.applyEvent(
        intentEvent({
          ingestSeq: 3,
          payload: { intent_category: 'refactoring' },
        })
      );

      const snapshot = view.getSnapshot();
      const dist = snapshot.payload.distribution;

      const debugging = dist.find((d) => d.category === 'debugging');
      const refactoring = dist.find((d) => d.category === 'refactoring');

      expect(debugging?.count).toBe(2);
      expect(refactoring?.count).toBe(1);
    });

    it('should calculate correct percentages', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, payload: { intent_category: 'debugging' } }));
      view.applyEvent(intentEvent({ ingestSeq: 2, payload: { intent_category: 'debugging' } }));
      view.applyEvent(
        intentEvent({
          ingestSeq: 3,
          payload: { intent_category: 'refactoring' },
        })
      );

      const snapshot = view.getSnapshot();
      const dist = snapshot.payload.distribution;

      const debugging = dist.find((d) => d.category === 'debugging');
      const refactoring = dist.find((d) => d.category === 'refactoring');

      // debugging: 2/3 = 66.66..., refactoring: 1/3 = 33.33...
      expect(debugging?.percentage).toBeCloseTo(66.667, 1);
      expect(refactoring?.percentage).toBeCloseTo(33.333, 1);
    });

    it('should sort distribution by count descending', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, payload: { intent_category: 'low' } }));
      view.applyEvent(intentEvent({ ingestSeq: 2, payload: { intent_category: 'high' } }));
      view.applyEvent(intentEvent({ ingestSeq: 3, payload: { intent_category: 'high' } }));
      view.applyEvent(intentEvent({ ingestSeq: 4, payload: { intent_category: 'high' } }));
      view.applyEvent(intentEvent({ ingestSeq: 5, payload: { intent_category: 'mid' } }));
      view.applyEvent(intentEvent({ ingestSeq: 6, payload: { intent_category: 'mid' } }));

      const snapshot = view.getSnapshot();
      const categories = snapshot.payload.distribution.map((d) => d.category);
      expect(categories).toEqual(['high', 'mid', 'low']);
    });

    it('should track categoryCount accurately', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, payload: { intent_category: 'a' } }));
      view.applyEvent(intentEvent({ ingestSeq: 2, payload: { intent_category: 'b' } }));
      view.applyEvent(intentEvent({ ingestSeq: 3, payload: { intent_category: 'a' } }));

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.categoryCount).toBe(2);
    });

    it('should default category to unknown when payload has no recognized category key', () => {
      view.applyEvent(
        intentEvent({
          ingestSeq: 1,
          payload: { something_else: 'value' },
        })
      );

      const snapshot = view.getSnapshot();
      const unknownEntry = snapshot.payload.distribution.find((d) => d.category === 'unknown');
      expect(unknownEntry).toBeDefined();
      expect(unknownEntry?.count).toBe(1);
    });

    it('should extract category from intentCategory (camelCase) payload key', () => {
      view.applyEvent(
        intentEvent({
          ingestSeq: 1,
          payload: { intentCategory: 'code-review' },
        })
      );

      const snapshot = view.getSnapshot();
      const entry = snapshot.payload.distribution.find((d) => d.category === 'code-review');
      expect(entry).toBeDefined();
      expect(entry?.count).toBe(1);
    });

    it('should extract category from intent_type payload key', () => {
      view.applyEvent(
        intentEvent({
          ingestSeq: 1,
          payload: { intent_type: 'feature-request' },
        })
      );

      const snapshot = view.getSnapshot();
      const entry = snapshot.payload.distribution.find((d) => d.category === 'feature-request');
      expect(entry).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Snapshot Envelope
  // --------------------------------------------------------------------------

  describe('snapshot envelope', () => {
    it('should return correct viewId in snapshot', () => {
      const snapshot = view.getSnapshot();
      expect(snapshot.viewId).toBe('intent');
    });

    it('should return cursor as max ingestSeq seen', () => {
      view.applyEvent(intentEvent({ ingestSeq: 5 }));
      view.applyEvent(intentEvent({ ingestSeq: 10 }));
      view.applyEvent(intentEvent({ ingestSeq: 7 }));

      const snapshot = view.getSnapshot();
      expect(snapshot.cursor).toBe(10);
    });

    it('should return snapshotTimeMs as a recent timestamp', () => {
      const before = Date.now();
      const snapshot = view.getSnapshot();
      const after = Date.now();

      expect(snapshot.snapshotTimeMs).toBeGreaterThanOrEqual(before);
      expect(snapshot.snapshotTimeMs).toBeLessThanOrEqual(after);
    });

    it('should default to 100 items in snapshot when no limit given', () => {
      // Insert 150 events
      for (let i = 1; i <= 150; i++) {
        view.applyEvent(intentEvent({ ingestSeq: i, eventTimeMs: i * 1000 }));
      }

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.recentIntents).toHaveLength(100);
    });

    it('should respect custom limit parameter', () => {
      for (let i = 1; i <= 50; i++) {
        view.applyEvent(intentEvent({ ingestSeq: i, eventTimeMs: i * 1000 }));
      }

      const snapshot = view.getSnapshot({ limit: 10 });
      expect(snapshot.payload.recentIntents).toHaveLength(10);
    });

    it('should clamp limit to MAX_BUFFER (500)', () => {
      // Even if caller requests 1000, should cap at 500
      for (let i = 1; i <= 500; i++) {
        view.applyEvent(intentEvent({ ingestSeq: i, eventTimeMs: i * 1000 }));
      }

      const snapshot = view.getSnapshot({ limit: 1000 });
      expect(snapshot.payload.recentIntents).toHaveLength(500);
    });

    it('should clamp limit minimum to 1', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));

      const snapshot = view.getSnapshot({ limit: 0 });
      expect(snapshot.payload.recentIntents).toHaveLength(1);
    });

    it('should return lastEventTimeMs from most recently applied event', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, eventTimeMs: 5000 }));
      view.applyEvent(intentEvent({ ingestSeq: 2, eventTimeMs: 9000 }));

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.lastEventTimeMs).toBe(9000);
    });

    it('should return lastEventTimeMs as null when no events applied', () => {
      const snapshot = view.getSnapshot();
      expect(snapshot.payload.lastEventTimeMs).toBeNull();
    });

    it('should include all expected fields in the payload', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));

      const snapshot = view.getSnapshot();
      expect(snapshot.payload).toHaveProperty('recentIntents');
      expect(snapshot.payload).toHaveProperty('distribution');
      expect(snapshot.payload).toHaveProperty('totalIntents');
      expect(snapshot.payload).toHaveProperty('categoryCount');
      expect(snapshot.payload).toHaveProperty('lastEventTimeMs');
    });

    it('should return totalIntents as the cumulative count of all ingested events', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, payload: { intent_category: 'a' } }));
      view.applyEvent(intentEvent({ ingestSeq: 2, payload: { intent_category: 'b' } }));
      view.applyEvent(intentEvent({ ingestSeq: 3, payload: { intent_category: 'a' } }));

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.totalIntents).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Events-Since
  // --------------------------------------------------------------------------

  describe('events-since', () => {
    it('should return events with ingestSeq greater than cursor', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));
      view.applyEvent(intentEvent({ ingestSeq: 2 }));
      view.applyEvent(intentEvent({ ingestSeq: 3 }));
      view.applyEvent(intentEvent({ ingestSeq: 4 }));

      const response = view.getEventsSince(2);
      expect(response.events).toHaveLength(2);
      expect(response.events[0].ingestSeq).toBe(3);
      expect(response.events[1].ingestSeq).toBe(4);
    });

    it('should return correct cursor in events-since response', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));
      view.applyEvent(intentEvent({ ingestSeq: 2 }));
      view.applyEvent(intentEvent({ ingestSeq: 3 }));

      const response = view.getEventsSince(1);
      expect(response.cursor).toBe(3);
    });

    it('should return provided cursor when no events match', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));
      view.applyEvent(intentEvent({ ingestSeq: 2 }));

      const response = view.getEventsSince(5);
      expect(response.events).toHaveLength(0);
      expect(response.cursor).toBe(5);
    });

    it('should respect limit parameter in events-since', () => {
      for (let i = 1; i <= 10; i++) {
        view.applyEvent(intentEvent({ ingestSeq: i }));
      }

      const response = view.getEventsSince(0, 3);
      expect(response.events).toHaveLength(3);
      expect(response.events[0].ingestSeq).toBe(1);
      expect(response.events[2].ingestSeq).toBe(3);
    });

    it('should return correct viewId in events-since response', () => {
      const response = view.getEventsSince(0);
      expect(response.viewId).toBe('intent');
    });

    it('should return snapshotTimeMs in events-since response', () => {
      const before = Date.now();
      const response = view.getEventsSince(0);
      const after = Date.now();

      expect(response.snapshotTimeMs).toBeGreaterThanOrEqual(before);
      expect(response.snapshotTimeMs).toBeLessThanOrEqual(after);
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('reset', () => {
    it('should clear all buffer contents', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));
      view.applyEvent(intentEvent({ ingestSeq: 2 }));
      view.reset();

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.recentIntents).toHaveLength(0);
    });

    it('should clear distribution map', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, payload: { intent_category: 'debug' } }));
      view.reset();

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.distribution).toHaveLength(0);
      expect(snapshot.payload.categoryCount).toBe(0);
    });

    it('should reset cursor to 0', () => {
      view.applyEvent(intentEvent({ ingestSeq: 42 }));
      view.reset();

      const snapshot = view.getSnapshot();
      expect(snapshot.cursor).toBe(0);
    });

    it('should reset lastEventTimeMs to null', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1, eventTimeMs: 5000 }));
      view.reset();

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.lastEventTimeMs).toBeNull();
    });

    it('should clear applied events so events-since returns nothing', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));
      view.applyEvent(intentEvent({ ingestSeq: 2 }));
      view.reset();

      const response = view.getEventsSince(0);
      expect(response.events).toHaveLength(0);
    });

    it('should reset totalIntents to 0', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));
      view.reset();

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.totalIntents).toBe(0);
    });

    it('should allow applying events after reset', () => {
      view.applyEvent(intentEvent({ ingestSeq: 1 }));
      view.reset();
      view.applyEvent(intentEvent({ ingestSeq: 2 }));

      const snapshot = view.getSnapshot();
      expect(snapshot.payload.recentIntents).toHaveLength(1);
      expect(snapshot.cursor).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Eviction Behavior
  // --------------------------------------------------------------------------

  describe('eviction behavior', () => {
    it('should keep buffer at MAX_BUFFER (500) after overflow', () => {
      for (let i = 1; i <= 501; i++) {
        view.applyEvent(
          intentEvent({
            ingestSeq: i,
            eventTimeMs: i * 1000,
            payload: { intent_category: 'cat' },
          })
        );
      }

      const snapshot = view.getSnapshot({ limit: 500 });
      expect(snapshot.payload.recentIntents).toHaveLength(500);
    });

    it('should evict the oldest event when buffer exceeds MAX_BUFFER', () => {
      // Fill buffer with 500 events
      for (let i = 1; i <= 500; i++) {
        view.applyEvent(
          intentEvent({
            ingestSeq: i,
            eventTimeMs: i * 1000,
            id: `evt-${i}`,
            payload: { intent_category: 'cat' },
          })
        );
      }

      // The oldest is evt-1 (eventTimeMs=1000, at the tail of DESC buffer)
      let snapshot = view.getSnapshot({ limit: 500 });
      const lastId = snapshot.payload.recentIntents[snapshot.payload.recentIntents.length - 1].id;
      expect(lastId).toBe('evt-1');

      // Insert 501st event, which should evict evt-1
      view.applyEvent(
        intentEvent({
          ingestSeq: 501,
          eventTimeMs: 501000,
          id: 'evt-501',
          payload: { intent_category: 'cat' },
        })
      );

      snapshot = view.getSnapshot({ limit: 500 });
      const allIds = snapshot.payload.recentIntents.map((e) => e.id);
      expect(allIds).not.toContain('evt-1');
      expect(allIds[0]).toBe('evt-501');
      expect(allIds[allIds.length - 1]).toBe('evt-2');
    });

    it('should decrement distribution count for evicted category', () => {
      // Fill 500 events all with category 'fill'
      for (let i = 1; i <= 500; i++) {
        view.applyEvent(
          intentEvent({
            ingestSeq: i,
            eventTimeMs: i * 1000,
            payload: { intent_category: 'fill' },
          })
        );
      }

      let snapshot = view.getSnapshot();
      const fillBefore = snapshot.payload.distribution.find((d) => d.category === 'fill');
      expect(fillBefore?.count).toBe(500);

      // Insert 501st with a different category; this evicts the oldest 'fill' event
      view.applyEvent(
        intentEvent({
          ingestSeq: 501,
          eventTimeMs: 501000,
          payload: { intent_category: 'new-cat' },
        })
      );

      snapshot = view.getSnapshot();
      const fillAfter = snapshot.payload.distribution.find((d) => d.category === 'fill');
      expect(fillAfter?.count).toBe(499);

      const newCat = snapshot.payload.distribution.find((d) => d.category === 'new-cat');
      expect(newCat?.count).toBe(1);
    });

    it('should remove category from distribution when count reaches 0', () => {
      // Insert 1 event with category 'ephemeral', then fill the rest with 'filler'
      view.applyEvent(
        intentEvent({
          ingestSeq: 1,
          eventTimeMs: 1000,
          payload: { intent_category: 'ephemeral' },
        })
      );
      for (let i = 2; i <= 500; i++) {
        view.applyEvent(
          intentEvent({
            ingestSeq: i,
            eventTimeMs: i * 1000,
            payload: { intent_category: 'filler' },
          })
        );
      }

      let snapshot = view.getSnapshot();
      expect(snapshot.payload.distribution.find((d) => d.category === 'ephemeral')).toBeDefined();

      // Insert one more to push out the 'ephemeral' event (it is the oldest)
      view.applyEvent(
        intentEvent({
          ingestSeq: 501,
          eventTimeMs: 501000,
          payload: { intent_category: 'filler' },
        })
      );

      snapshot = view.getSnapshot();
      const ephemeral = snapshot.payload.distribution.find((d) => d.category === 'ephemeral');
      expect(ephemeral).toBeUndefined();
      expect(snapshot.payload.categoryCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Cursor Tracking
  // --------------------------------------------------------------------------

  describe('cursor tracking', () => {
    it('should track the maximum ingestSeq as cursor', () => {
      view.applyEvent(intentEvent({ ingestSeq: 5 }));
      view.applyEvent(intentEvent({ ingestSeq: 3 }));
      view.applyEvent(intentEvent({ ingestSeq: 10 }));

      const snapshot = view.getSnapshot();
      expect(snapshot.cursor).toBe(10);
    });

    it('should not regress cursor when a lower ingestSeq arrives', () => {
      view.applyEvent(intentEvent({ ingestSeq: 10 }));
      view.applyEvent(intentEvent({ ingestSeq: 5 }));

      const snapshot = view.getSnapshot();
      expect(snapshot.cursor).toBe(10);
    });

    it('should start cursor at 0 before any events', () => {
      const snapshot = view.getSnapshot();
      expect(snapshot.cursor).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Empty State
  // --------------------------------------------------------------------------

  describe('empty state', () => {
    it('should return an empty snapshot when no events have been applied', () => {
      const snapshot = view.getSnapshot();

      expect(snapshot.viewId).toBe('intent');
      expect(snapshot.cursor).toBe(0);
      expect(snapshot.payload.recentIntents).toHaveLength(0);
      expect(snapshot.payload.distribution).toHaveLength(0);
      expect(snapshot.payload.totalIntents).toBe(0);
      expect(snapshot.payload.categoryCount).toBe(0);
      expect(snapshot.payload.lastEventTimeMs).toBeNull();
    });

    it('should return empty events-since from cursor 0', () => {
      const response = view.getEventsSince(0);
      expect(response.events).toHaveLength(0);
      expect(response.cursor).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Applied Events Trimming
  // --------------------------------------------------------------------------

  describe('applied events trimming', () => {
    it('should trim appliedEvents to 1.5x MAX_BUFFER when exceeding 2x MAX_BUFFER', () => {
      // Insert 1001 events (MAX_BUFFER * 2 = 1000 triggers trim)
      for (let i = 1; i <= 1001; i++) {
        view.applyEvent(
          intentEvent({
            ingestSeq: i,
            eventTimeMs: i * 1000,
            payload: { intent_category: 'cat' },
          })
        );
      }

      // After trim, appliedEvents should retain 750 (1.5 * MAX_BUFFER=500)
      // events-since from 0 should return those 750 events
      const response = view.getEventsSince(0);
      expect(response.events).toHaveLength(750);
      // Oldest retained event: 1001 - 750 + 1 = 252
      expect(response.events[0].ingestSeq).toBe(252);
      expect(response.events[response.events.length - 1].ingestSeq).toBe(1001);
    });
  });
});
