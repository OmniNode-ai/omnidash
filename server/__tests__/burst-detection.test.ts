/**
 * Burst Detection Tests (OMN-2158)
 *
 * Covers:
 * - Throughput burst detection: short-window rate >= multiplier * baseline
 * - Error spike detection: OR logic (multiplier-based, absolute-threshold)
 * - Cooldown: burst persists for cooldownMs even when rate drops
 * - Low-baseline guard: no false positives when baseline is near zero
 * - Low-sample guard: error spike requires minimum event count
 * - Priority: error spike takes precedence over throughput burst
 * - Windowed error rate: computed within monitoring window (fixes latent bug)
 * - Config: all thresholds configurable via constructor
 * - Reset: burst state cleared on reset()
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  EventBusProjection,
  type EventBusProjectionConfig,
} from '../projections/event-bus-projection';
import { ProjectionService, type RawEventInput } from '../projection-service';

// ============================================================================
// Test Helpers
// ============================================================================

const rawEventFactory = (() => {
  let counter = 0;
  return {
    reset() {
      counter = 0;
    },
    make(overrides: Partial<RawEventInput> = {}): RawEventInput {
      return {
        id: `burst-${++counter}`,
        eventTimeMs: Date.now(),
        topic: 'test-topic',
        type: 'test-event',
        source: 'test-source',
        severity: 'info',
        payload: { data: 'test' },
        ...overrides,
      };
    },
  };
})();

function makeProjection(config?: EventBusProjectionConfig) {
  const projection = new EventBusProjection(config);
  const service = new ProjectionService();
  service.registerView(projection);
  return { projection, service };
}

/**
 * Ingest N events at a specific eventTimeMs.
 * Useful for creating controlled time distributions.
 */
function ingestBatch(
  service: ProjectionService,
  count: number,
  overrides: Partial<RawEventInput> = {}
) {
  for (let i = 0; i < count; i++) {
    service.ingest(rawEventFactory.make(overrides));
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Burst Detection (OMN-2158)', () => {
  beforeEach(() => {
    rawEventFactory.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // Snapshot shape
  // --------------------------------------------------------------------------

  describe('snapshot shape', () => {
    it('should include burst detection fields in snapshot payload', () => {
      const { projection, service } = makeProjection();
      service.ingest(rawEventFactory.make());

      const snap = projection.getSnapshot();
      const p = snap.payload;

      expect(p).toHaveProperty('monitoringWindowMs');
      expect(p).toHaveProperty('stalenessThresholdMs');
      expect(p).toHaveProperty('burstWindowMs');
      expect(p).toHaveProperty('windowedErrorRate');
      expect(p).toHaveProperty('burstInfo');

      expect(p.monitoringWindowMs).toBe(5 * 60 * 1000);
      expect(p.stalenessThresholdMs).toBe(10 * 60 * 1000);
      expect(p.burstWindowMs).toBe(30 * 1000);
    });

    it('should use custom config values when provided', () => {
      const { projection, service } = makeProjection({
        monitoringWindowMs: 2 * 60 * 1000,
        stalenessThresholdMs: 5 * 60 * 1000,
        burstWindowMs: 10 * 1000,
      });
      service.ingest(rawEventFactory.make());

      const snap = projection.getSnapshot();
      expect(snap.payload.monitoringWindowMs).toBe(2 * 60 * 1000);
      expect(snap.payload.stalenessThresholdMs).toBe(5 * 60 * 1000);
      expect(snap.payload.burstWindowMs).toBe(10 * 1000);
    });

    it('should return burstInfo: null when no burst detected', () => {
      const { projection, service } = makeProjection();
      // Ingest a few events at a steady rate — not enough to trigger burst
      service.ingest(rawEventFactory.make());
      service.ingest(rawEventFactory.make());

      const snap = projection.getSnapshot();
      expect(snap.payload.burstInfo).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Windowed error rate (fixes latent bug)
  // --------------------------------------------------------------------------

  describe('windowed error rate', () => {
    it('should compute error rate within monitoring window only', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000, // 1 min window
      });

      // Events outside the window (2 min ago) — should NOT count
      ingestBatch(service, 5, { eventTimeMs: now - 120_000, severity: 'error' });

      // Events inside the window — 2 errors out of 10
      ingestBatch(service, 8, { eventTimeMs: now - 10_000, severity: 'info' });
      ingestBatch(service, 2, { eventTimeMs: now - 5_000, severity: 'error' });

      const snap = projection.getSnapshot();
      // 2 errors / 10 in-window events = 0.2 (events outside window excluded)
      expect(snap.payload.windowedErrorRate).toBeCloseTo(0.2, 1);
    });

    it('should return 0 when no events in monitoring window', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
      });

      // Only old events outside the window
      ingestBatch(service, 5, { eventTimeMs: now - 120_000, severity: 'error' });

      const snap = projection.getSnapshot();
      expect(snap.payload.windowedErrorRate).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Throughput burst
  // --------------------------------------------------------------------------

  describe('throughput burst', () => {
    it('should detect burst when short-window rate exceeds multiplier of baseline', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000, // 1 min baseline
        burstWindowMs: 10_000, // 10s short window
        burstThroughputMultiplier: 3,
        burstThroughputMinRate: 2, // low threshold for test
      });

      // Baseline: 30 events spread over 60s = 0.5 evt/s
      for (let i = 0; i < 30; i++) {
        service.ingest(
          rawEventFactory.make({
            eventTimeMs: now - 60_000 + i * 2000, // one every 2s
          })
        );
      }

      // Burst: 30 events in the last 10s = 3 evt/s (6x baseline)
      for (let i = 0; i < 30; i++) {
        service.ingest(
          rawEventFactory.make({
            eventTimeMs: now - 10_000 + i * 300, // 30 events in 10s
          })
        );
      }

      const snap = projection.getSnapshot();
      expect(snap.payload.burstInfo).not.toBeNull();
      expect(snap.payload.burstInfo?.type).toBe('throughput');
      expect(snap.payload.burstInfo!.multiplier).toBeGreaterThanOrEqual(3);
    });

    it('should NOT trigger when short-window rate is below minimum absolute rate', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstThroughputMultiplier: 3,
        burstThroughputMinRate: 100, // very high threshold
      });

      // Even if multiplier is high, absolute rate is too low
      service.ingest(rawEventFactory.make({ eventTimeMs: now - 50_000 }));
      ingestBatch(service, 5, { eventTimeMs: now - 5_000 });

      const snap = projection.getSnapshot();
      expect(snap.payload.burstInfo).toBeNull();
    });

    it('should NOT trigger when baseline is zero', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstThroughputMinRate: 2,
      });

      // All events in the short window only — baseline is effectively just these same events
      // This tests that we don't divide by zero or get NaN
      ingestBatch(service, 5, { eventTimeMs: now - 5_000 });

      const snap = projection.getSnapshot();
      // The baseline includes the short window events, so multiplier is ~1x, not a burst
      expect(snap.payload.burstInfo).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Error spike
  // --------------------------------------------------------------------------

  describe('error spike', () => {
    it('should detect error spike when short-window error rate exceeds multiplier of baseline', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstErrorMultiplier: 2,
        burstErrorAbsoluteThreshold: 0.5, // high threshold to isolate multiplier test
        burstErrorMinEvents: 5,
      });

      // Baseline: 50 events, 5 errors = 10% error rate
      ingestBatch(service, 45, { eventTimeMs: now - 30_000, severity: 'info' });
      ingestBatch(service, 5, { eventTimeMs: now - 30_000, severity: 'error' });

      // Short window: 10 events, 5 errors = 50% error rate (5x baseline)
      ingestBatch(service, 5, { eventTimeMs: now - 5_000, severity: 'info' });
      ingestBatch(service, 5, { eventTimeMs: now - 5_000, severity: 'error' });

      const snap = projection.getSnapshot();
      expect(snap.payload.burstInfo).not.toBeNull();
      expect(snap.payload.burstInfo?.type).toBe('error_spike');
    });

    it('should detect error spike when absolute threshold is exceeded', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstErrorMultiplier: 100, // very high multiplier to isolate absolute test
        burstErrorAbsoluteThreshold: 0.05, // 5%
        burstErrorMinEvents: 5,
      });

      // No baseline errors (so multiplier can't be exceeded)
      ingestBatch(service, 20, { eventTimeMs: now - 30_000, severity: 'info' });

      // Short window: 10 events, 2 errors = 20% (exceeds 5% absolute threshold)
      ingestBatch(service, 8, { eventTimeMs: now - 5_000, severity: 'info' });
      ingestBatch(service, 2, { eventTimeMs: now - 5_000, severity: 'error' });

      const snap = projection.getSnapshot();
      expect(snap.payload.burstInfo).not.toBeNull();
      expect(snap.payload.burstInfo?.type).toBe('error_spike');
    });

    it('should NOT trigger with too few events (sample gate)', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstErrorMinEvents: 20, // high sample gate
      });

      // Short window: only 3 events (below sample gate)
      ingestBatch(service, 1, { eventTimeMs: now - 5_000, severity: 'info' });
      ingestBatch(service, 2, { eventTimeMs: now - 5_000, severity: 'error' });

      const snap = projection.getSnapshot();
      expect(snap.payload.burstInfo).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Priority: error spike > throughput burst
  // --------------------------------------------------------------------------

  describe('burst priority', () => {
    it('should prefer error spike over throughput burst when both conditions met', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstThroughputMultiplier: 2,
        burstThroughputMinRate: 1,
        burstErrorMultiplier: 2,
        burstErrorAbsoluteThreshold: 0.05,
        burstErrorMinEvents: 5,
      });

      // Baseline: low rate with few errors
      ingestBatch(service, 10, { eventTimeMs: now - 50_000, severity: 'info' });

      // Short window: high rate AND high error rate
      ingestBatch(service, 30, { eventTimeMs: now - 5_000, severity: 'info' });
      ingestBatch(service, 20, { eventTimeMs: now - 5_000, severity: 'error' });

      const snap = projection.getSnapshot();
      expect(snap.payload.burstInfo).not.toBeNull();
      expect(snap.payload.burstInfo?.type).toBe('error_spike');
    });
  });

  // --------------------------------------------------------------------------
  // Cooldown
  // --------------------------------------------------------------------------

  describe('cooldown', () => {
    it('should persist burst info during cooldown period', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const COOLDOWN_MS = 15_000;
      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstThroughputMultiplier: 3,
        burstThroughputMinRate: 2,
        burstCooldownMs: COOLDOWN_MS,
      });

      // Create a burst scenario
      for (let i = 0; i < 20; i++) {
        service.ingest(
          rawEventFactory.make({
            eventTimeMs: now - 60_000 + i * 3000,
          })
        );
      }
      for (let i = 0; i < 40; i++) {
        service.ingest(
          rawEventFactory.make({
            eventTimeMs: now - 10_000 + i * 250,
          })
        );
      }

      // First snapshot should detect burst
      const snap1 = projection.getSnapshot();
      expect(snap1.payload.burstInfo).not.toBeNull();

      // Advance time by half the cooldown — burst should persist
      vi.setSystemTime(now + COOLDOWN_MS / 2);
      const snap2 = projection.getSnapshot();
      expect(snap2.payload.burstInfo).not.toBeNull();
      expect(snap2.payload.burstInfo?.type).toBe(snap1.payload.burstInfo?.type);
    });

    it('should clear burst info after cooldown expires and rate normalizes', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const COOLDOWN_MS = 5_000; // short cooldown for test
      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstThroughputMultiplier: 3,
        burstThroughputMinRate: 2,
        burstCooldownMs: COOLDOWN_MS,
      });

      // Create burst
      for (let i = 0; i < 10; i++) {
        service.ingest(
          rawEventFactory.make({
            eventTimeMs: now - 50_000 + i * 5000,
          })
        );
      }
      for (let i = 0; i < 40; i++) {
        service.ingest(
          rawEventFactory.make({
            eventTimeMs: now - 8_000 + i * 200,
          })
        );
      }

      const snap1 = projection.getSnapshot();
      expect(snap1.payload.burstInfo).not.toBeNull();

      // Advance past cooldown AND past burst window so rate normalizes
      vi.setSystemTime(now + COOLDOWN_MS + 20_000);

      // No new events — the old events are now outside the burst window
      const snap2 = projection.getSnapshot();
      expect(snap2.payload.burstInfo).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  describe('reset', () => {
    it('should clear burst state on reset()', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const { projection, service } = makeProjection({
        monitoringWindowMs: 60_000,
        burstWindowMs: 10_000,
        burstThroughputMultiplier: 3,
        burstThroughputMinRate: 2,
      });

      // Create burst
      for (let i = 0; i < 10; i++) {
        service.ingest(
          rawEventFactory.make({
            eventTimeMs: now - 50_000 + i * 5000,
          })
        );
      }
      for (let i = 0; i < 40; i++) {
        service.ingest(
          rawEventFactory.make({
            eventTimeMs: now - 8_000 + i * 200,
          })
        );
      }

      expect(projection.getSnapshot().payload.burstInfo).not.toBeNull();

      projection.reset();

      const snap = projection.getSnapshot();
      expect(snap.payload.burstInfo).toBeNull();
      expect(snap.payload.windowedErrorRate).toBe(0);
    });
  });
});

// ============================================================================
// Windowing Helpers Unit Tests
// ============================================================================

describe('windowing-helpers', () => {
  // Import dynamically to avoid side effects
  let helpers: typeof import('../lib/windowing-helpers');

  beforeEach(async () => {
    helpers = await import('../lib/windowing-helpers');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getWindowCutoff', () => {
    it('should return now - windowMs', () => {
      const now = 1000000;
      vi.setSystemTime(now);
      expect(helpers.getWindowCutoff(5000)).toBe(now - 5000);
    });

    it('should accept explicit now parameter', () => {
      expect(helpers.getWindowCutoff(5000, 10000)).toBe(5000);
    });
  });

  describe('filterEventsInWindow', () => {
    it('should filter events by time extractor', () => {
      const now = 100_000;
      const events = [{ ts: now - 1000 }, { ts: now - 6000 }, { ts: now - 3000 }];
      const result = helpers.filterEventsInWindow(events, 5000, (e) => e.ts, now);
      expect(result).toHaveLength(2); // ts -1000 and -3000 are within 5s window
    });
  });

  describe('computeRate', () => {
    it('should compute events per second', () => {
      const now = 100_000;
      const events = Array.from({ length: 10 }, (_, i) => ({ ts: now - i * 100 }));
      const rate = helpers.computeRate(events, 5000, (e) => e.ts, now);
      expect(rate).toBe(10 / 5); // 10 events in 5s window = 2 evt/s
    });

    it('should return 0 for empty window', () => {
      const now = 100_000;
      const events = [{ ts: now - 60_000 }]; // outside 5s window
      expect(helpers.computeRate(events, 5000, (e) => e.ts, now)).toBe(0);
    });
  });

  describe('computeErrorRate', () => {
    it('should compute error fraction', () => {
      const now = 100_000;
      const events = [
        { ts: now - 1000, err: false },
        { ts: now - 2000, err: true },
        { ts: now - 3000, err: false },
        { ts: now - 4000, err: true },
      ];
      const rate = helpers.computeErrorRate(
        events,
        5000,
        (e) => e.ts,
        (e) => e.err,
        now
      );
      expect(rate).toBe(0.5); // 2 errors / 4 events
    });

    it('should return 0 for empty window', () => {
      expect(
        helpers.computeErrorRate(
          [],
          5000,
          () => 0,
          () => true,
          100_000
        )
      ).toBe(0);
    });
  });

  describe('countEventsInWindow', () => {
    it('should count events in window', () => {
      const now = 100_000;
      const events = [{ ts: now - 1000 }, { ts: now - 6000 }, { ts: now - 3000 }];
      expect(helpers.countEventsInWindow(events, 5000, (e) => e.ts, now)).toBe(2);
    });
  });
});
