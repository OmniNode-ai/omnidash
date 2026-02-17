/**
 * EffectivenessMetricsProjection — Throttle Boundary Tests (OMN-2325)
 *
 * Exercises the throttle decision logic in queryThrottleStatus() at
 * exact boundary values:
 *
 *   1. Session count < 50 (49) -> inactive (insufficient data)
 *   2. Session count = 50 -> eligible for throttle evaluation
 *   3. Latency delta exactly 200ms -> NOT throttled (threshold is > 200)
 *   4. Latency delta 201ms -> throttled
 *   5. Utilization exactly 0.4 -> NOT throttled (threshold is < 0.4)
 *   6. Utilization 0.39 -> throttled
 *   7. Latency throttle takes priority over utilization throttle
 *
 * Strategy: Mock the Drizzle DB to return controlled window/control data
 * so the projection's pure decision logic can be verified without a real DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EffectivenessMetricsProjection } from '../projections/effectiveness-metrics-projection';

// ============================================================================
// Mock DB builder
// ============================================================================

/**
 * Build a fake Drizzle-like DB object that returns controlled results for
 * the two queries inside queryThrottleStatus():
 *
 *   1. windowData query (injected sessions in 1h window):
 *      { count, latency_p95, median_util }
 *
 *   2. controlP95Result query (control cohort P95 in 1h window):
 *      { p95 }
 *
 * The Drizzle builder chain is: db.select(...).from(...).where(...).groupBy(...)
 * We track call order to map the first select() to windowData and the second
 * to controlP95Result.
 */
function buildMockDb(opts: {
  windowCount: number;
  windowLatencyP95: number | null;
  windowMedianUtil: number | null;
  controlP95: number | null;
}) {
  let selectCallIndex = 0;

  const windowRow = {
    count: opts.windowCount,
    latency_p95: opts.windowLatencyP95,
    median_util: opts.windowMedianUtil,
  };

  const controlRow = {
    p95: opts.controlP95,
  };

  function makeChain(result: unknown[]) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.from = self;
    chain.where = self;
    chain.groupBy = self;
    chain.orderBy = self;
    chain.limit = self;
    // Terminal: the chain is thenable — resolves to the result array
    chain.then = (resolve: (v: unknown[]) => void) => {
      resolve(result);
      return { catch: () => ({ finally: () => {} }) };
    };
    // Support await (Promise-like)
    chain[Symbol.toStringTag] = 'Promise';
    return chain;
  }

  return {
    select: vi.fn(() => {
      const idx = selectCallIndex++;
      if (idx === 0) return makeChain([windowRow]);
      return makeChain(opts.controlP95 != null ? [controlRow] : [controlRow]);
    }),
  };
}

// ============================================================================
// Mock storage (prevent real DB connections on import)
// ============================================================================

vi.mock('../storage', () => ({
  tryGetIntelligenceDb: vi.fn(() => null),
  getIntelligenceDb: vi.fn(() => {
    throw new Error('not configured');
  }),
  isDatabaseConfigured: vi.fn(() => false),
  getDatabaseError: vi.fn(() => 'mocked'),
}));

// ============================================================================
// Tests
// ============================================================================

describe('EffectivenessMetricsProjection — queryThrottleStatus boundaries', () => {
  let projection: EffectivenessMetricsProjection;

  beforeEach(() => {
    projection = new EffectivenessMetricsProjection();
  });

  // --------------------------------------------------------------------------
  // Session count threshold (49 vs 50)
  // --------------------------------------------------------------------------

  it('should NOT throttle when session count is 49 (below 50 threshold)', async () => {
    const db = buildMockDb({
      windowCount: 49,
      windowLatencyP95: 500, // would trigger latency throttle if count >= 50
      windowMedianUtil: 0.1, // would trigger utilization throttle if count >= 50
      controlP95: 100,
    });

    const result = await projection.queryThrottleStatus(db as never);

    expect(result.active).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.injected_sessions_1h).toBe(49);
  });

  it('should evaluate throttle rules when session count is exactly 50', async () => {
    // 50 sessions, but metrics are healthy -> not throttled
    const db = buildMockDb({
      windowCount: 50,
      windowLatencyP95: 250, // delta = 250 - 100 = 150ms (under 200 threshold)
      windowMedianUtil: 0.6, // above 0.4 threshold
      controlP95: 100,
    });

    const result = await projection.queryThrottleStatus(db as never);

    expect(result.active).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.injected_sessions_1h).toBe(50);
  });

  // --------------------------------------------------------------------------
  // Latency delta threshold (200 vs 201)
  // --------------------------------------------------------------------------

  it('should NOT throttle when latency delta is exactly 200ms (threshold is > 200)', async () => {
    const db = buildMockDb({
      windowCount: 60,
      windowLatencyP95: 300, // delta = 300 - 100 = 200ms (exactly at threshold)
      windowMedianUtil: 0.7, // healthy
      controlP95: 100,
    });

    const result = await projection.queryThrottleStatus(db as never);

    expect(result.active).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.latency_delta_p95_1h).toBe(200);
  });

  it('should throttle when latency delta is 201ms (exceeds > 200 threshold)', async () => {
    const db = buildMockDb({
      windowCount: 60,
      windowLatencyP95: 301, // delta = 301 - 100 = 201ms (over threshold)
      windowMedianUtil: 0.7, // healthy
      controlP95: 100,
    });

    const result = await projection.queryThrottleStatus(db as never);

    expect(result.active).toBe(true);
    expect(result.reason).toContain('P95 latency delta');
    expect(result.reason).toContain('201ms');
    expect(result.reason).toContain('exceeds 200ms threshold');
    expect(result.latency_delta_p95_1h).toBe(201);
  });

  // --------------------------------------------------------------------------
  // Utilization threshold (0.4 vs < 0.4)
  // --------------------------------------------------------------------------

  it('should NOT throttle when median utilization is exactly 0.4 (threshold is < 0.4)', async () => {
    const db = buildMockDb({
      windowCount: 60,
      windowLatencyP95: 200, // delta = 200 - 100 = 100ms (healthy)
      windowMedianUtil: 0.4, // exactly at threshold
      controlP95: 100,
    });

    const result = await projection.queryThrottleStatus(db as never);

    expect(result.active).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.median_utilization_1h).toBe(0.4);
  });

  it('should throttle when median utilization is 0.39 (below 0.4 threshold)', async () => {
    const db = buildMockDb({
      windowCount: 60,
      windowLatencyP95: 200, // delta = 200 - 100 = 100ms (healthy)
      windowMedianUtil: 0.39, // just below threshold
      controlP95: 100,
    });

    const result = await projection.queryThrottleStatus(db as never);

    expect(result.active).toBe(true);
    expect(result.reason).toContain('Median utilization');
    expect(result.reason).toContain('below 40% threshold');
    expect(result.median_utilization_1h).toBe(0.39);
  });

  // --------------------------------------------------------------------------
  // Priority: latency throttle checked before utilization
  // --------------------------------------------------------------------------

  it('should report latency throttle reason when both latency and utilization thresholds are exceeded', async () => {
    const db = buildMockDb({
      windowCount: 60,
      windowLatencyP95: 400, // delta = 400 - 100 = 300ms (way over 200 threshold)
      windowMedianUtil: 0.2, // well under 0.4 threshold
      controlP95: 100,
    });

    const result = await projection.queryThrottleStatus(db as never);

    expect(result.active).toBe(true);
    // Latency check runs first, so reason should mention latency, not utilization
    expect(result.reason).toContain('P95 latency delta');
    expect(result.reason).not.toContain('Median utilization');
    expect(result.latency_delta_p95_1h).toBe(300);
    expect(result.median_utilization_1h).toBe(0.2);
  });
});
