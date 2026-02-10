/**
 * Effectiveness Routes Tests
 *
 * Exercises the /api/effectiveness endpoints (summary, throttle, latency,
 * utilization, ab, trend) against a mock Drizzle DB, covering empty-DB
 * fallbacks, aggregation logic, throttle boundary conditions, and error paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { tryGetIntelligenceDb } from '../storage';
import effectivenessRoutes from '../effectiveness-routes';

// ---------------------------------------------------------------------------
// Mock DB builder
// ---------------------------------------------------------------------------

/**
 * Creates a chainable mock that mimics the Drizzle query builder.
 * Each method returns itself so `.select().from().where().groupBy()` works.
 * The *terminal* method in each chain resolves to the provided value.
 */
function chainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'from', 'where', 'groupBy', 'orderBy', 'limit', 'offset'];
  for (const m of methods) {
    chain[m] = vi.fn();
  }
  // Every method returns the chain itself (thenable at the end)
  for (const m of methods) {
    chain[m].mockReturnValue(chain);
  }
  // Make the chain thenable so `await db.select(...).from(...)` resolves
  (chain as any).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return chain;
}

/**
 * A mock db object that supports multiple sequential query calls via
 * `pushResult()`. Each call to `db.select(...)...` resolves to the next
 * pushed result (FIFO). Falls back to `[]` if queue is empty.
 */
function createMockDb() {
  const resultQueue: unknown[] = [];

  const db = {
    pushResult(value: unknown) {
      resultQueue.push(value);
    },
    pushResults(...values: unknown[]) {
      resultQueue.push(...values);
    },
    select: vi.fn(),
  };

  db.select.mockImplementation(() => {
    const result = resultQueue.length > 0 ? resultQueue.shift() : [];
    return chainMock(result);
  });

  return db;
}

let mockDb: ReturnType<typeof createMockDb>;

vi.mock('../storage', () => ({
  tryGetIntelligenceDb: vi.fn(() => mockDb),
  getIntelligenceDb: vi.fn(() => mockDb),
  isDatabaseConfigured: vi.fn(() => true),
  getDatabaseError: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Effectiveness Routes', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    vi.mocked(tryGetIntelligenceDb).mockReturnValue(mockDb as any);

    app = express();
    app.use(express.json());
    app.use('/api/effectiveness', effectivenessRoutes);
  });

  // =========================================================================
  // GET /api/effectiveness/summary
  // =========================================================================

  describe('GET /api/effectiveness/summary', () => {
    it('should return empty summary when db is null', async () => {
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(null);

      const res = await request(app).get('/api/effectiveness/summary').expect(200);

      expect(res.body.injection_rate).toBe(0);
      expect(res.body.total_sessions).toBe(0);
      expect(res.body.treatment_sessions).toBe(0);
      expect(res.body.control_sessions).toBe(0);
      expect(res.body.throttle_active).toBe(false);
      expect(res.body.throttle_reason).toBeNull();
      expect(res.body.injection_rate_target).toBe(0.8);
    });

    it('should return aggregated summary with real data', async () => {
      // The summary endpoint now runs 5 queries in parallel via Promise.all:
      // 1. totals, 2. utilResult, 3. accResult, 4. latencyResult, 5. throttle
      // Throttle internally runs 2 more queries (windowData + controlP95)
      // Total: 4 from summary + 2 from throttle = 6 select() calls
      mockDb.pushResults(
        // 1. totals
        [{ total: 200, injected: 80, treatment: 100, control: 100 }],
        // 2. utilResult (median utilization)
        [{ median: 0.72 }],
        // 3. accResult (mean accuracy)
        [{ mean: 0.85 }],
        // 4. latencyResult (P95 by cohort)
        [
          { cohort: 'treatment', p95: 180 },
          { cohort: 'control', p95: 150 },
        ],
        // 5a. throttle - windowData (injected sessions in 1h)
        [{ count: 30, latency_p95: 170, median_util: 0.65 }],
        // 5b. throttle - controlP95
        [{ p95: 140 }]
      );

      const res = await request(app).get('/api/effectiveness/summary').expect(200);

      expect(res.body.injection_rate).toBeCloseTo(0.8); // 80/100
      expect(res.body.median_utilization).toBeCloseTo(0.72);
      expect(res.body.mean_agent_accuracy).toBeCloseTo(0.85);
      expect(res.body.latency_delta_p95_ms).toBeCloseTo(30); // 180 - 150
      expect(res.body.total_sessions).toBe(200);
      expect(res.body.treatment_sessions).toBe(100);
      expect(res.body.control_sessions).toBe(100);
      // Under 50 sessions in 1h window -> throttle not active
      expect(res.body.throttle_active).toBe(false);
    });

    it('should handle injection_rate=0 when treatment=0', async () => {
      mockDb.pushResults(
        [{ total: 0, injected: 0, treatment: 0, control: 0 }],
        [{ median: null }],
        [{ mean: null }],
        [],
        [{ count: 0, latency_p95: null, median_util: null }],
        [{ p95: null }]
      );

      const res = await request(app).get('/api/effectiveness/summary').expect(200);

      expect(res.body.injection_rate).toBe(0);
      expect(res.body.median_utilization).toBe(0);
      expect(res.body.mean_agent_accuracy).toBe(0);
    });

    it('should return 500 on database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Make the first select throw
      mockDb.select.mockImplementation(() => {
        throw new Error('DB connection lost');
      });

      const res = await request(app).get('/api/effectiveness/summary').expect(500);

      expect(res.body.error).toBe('Failed to get effectiveness summary');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/throttle
  // =========================================================================

  describe('GET /api/effectiveness/throttle', () => {
    it('should return inactive throttle when db is null', async () => {
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(null);

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      expect(res.body.active).toBe(false);
      expect(res.body.reason).toBeNull();
      expect(res.body.injected_sessions_1h).toBe(0);
    });

    it('should not throttle when session count < 50 (minimum threshold)', async () => {
      mockDb.pushResults(
        // windowData: only 30 sessions (below 50 threshold)
        [{ count: 30, latency_p95: 500, median_util: 0.1 }],
        // controlP95
        [{ p95: 100 }]
      );

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      expect(res.body.active).toBe(false);
      expect(res.body.reason).toBeNull();
      expect(res.body.injected_sessions_1h).toBe(30);
    });

    it('should throttle when session count >= 50 and latency delta > 200ms', async () => {
      mockDb.pushResults(
        // windowData: 60 sessions, high latency
        [{ count: 60, latency_p95: 400, median_util: 0.7 }],
        // controlP95
        [{ p95: 150 }]
      );

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      // latency delta = 400 - 150 = 250 > 200 -> THROTTLE
      expect(res.body.active).toBe(true);
      expect(res.body.reason).toContain('P95 latency delta');
      expect(res.body.reason).toContain('250ms');
      expect(res.body.reason).toContain('200ms threshold');
      expect(res.body.injected_sessions_1h).toBe(60);
    });

    it('should throttle when session count >= 50 and median utilization < 0.4', async () => {
      mockDb.pushResults(
        // windowData: 55 sessions, low utilization
        [{ count: 55, latency_p95: 200, median_util: 0.3 }],
        // controlP95 (latency delta = 200 - 180 = 20, below 200 threshold)
        [{ p95: 180 }]
      );

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      // latency delta = 200 - 180 = 20 (not throttled by latency)
      // median_util = 0.3 < 0.4 -> THROTTLE by utilization
      expect(res.body.active).toBe(true);
      expect(res.body.reason).toContain('Median utilization');
      expect(res.body.reason).toContain('30.0%');
      expect(res.body.reason).toContain('40% threshold');
    });

    it('should not throttle when all metrics are within bounds', async () => {
      mockDb.pushResults(
        // windowData: 100 sessions, good metrics
        [{ count: 100, latency_p95: 220, median_util: 0.6 }],
        // controlP95 (latency delta = 220 - 180 = 40, below 200 threshold)
        [{ p95: 180 }]
      );

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      expect(res.body.active).toBe(false);
      expect(res.body.reason).toBeNull();
      expect(res.body.injected_sessions_1h).toBe(100);
      expect(res.body.window_start).toBeTruthy();
    });

    it('should not throttle at exactly 50 sessions with latency delta exactly 200ms', async () => {
      mockDb.pushResults([{ count: 50, latency_p95: 300, median_util: 0.5 }], [{ p95: 100 }]);

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      // latency delta = 300 - 100 = 200, which is NOT > 200 (boundary: must exceed, not equal)
      // median_util = 0.5, which is NOT < 0.4
      expect(res.body.active).toBe(false);
    });

    it('should throttle at exactly 50 sessions with latency delta 201ms', async () => {
      mockDb.pushResults([{ count: 50, latency_p95: 301, median_util: 0.5 }], [{ p95: 100 }]);

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      // latency delta = 301 - 100 = 201 > 200 -> THROTTLE
      expect(res.body.active).toBe(true);
      expect(res.body.reason).toContain('P95 latency delta');
    });

    it('should not throttle at 49 sessions even with bad metrics', async () => {
      mockDb.pushResults([{ count: 49, latency_p95: 1000, median_util: 0.01 }], [{ p95: 100 }]);

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      // Below 50-session minimum -> never throttle
      expect(res.body.active).toBe(false);
    });

    it('should prioritize latency throttle over utilization throttle', async () => {
      // When both conditions are met, latency is checked first
      mockDb.pushResults([{ count: 60, latency_p95: 500, median_util: 0.2 }], [{ p95: 100 }]);

      const res = await request(app).get('/api/effectiveness/throttle').expect(200);

      expect(res.body.active).toBe(true);
      // Latency check comes first in the code
      expect(res.body.reason).toContain('P95 latency delta');
    });

    it('should return 500 on database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockDb.select.mockImplementation(() => {
        throw new Error('connection refused');
      });

      const res = await request(app).get('/api/effectiveness/throttle').expect(500);

      expect(res.body.error).toBe('Failed to get throttle status');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/latency
  // =========================================================================

  describe('GET /api/effectiveness/latency', () => {
    it('should return empty latency details when db is null', async () => {
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(null);

      const res = await request(app).get('/api/effectiveness/latency').expect(200);

      expect(res.body.breakdowns).toEqual([]);
      expect(res.body.trend).toEqual([]);
      expect(res.body.cache.hit_rate).toBe(0);
    });

    it('should return latency breakdowns, trend, and cache stats', async () => {
      mockDb.pushResults(
        // breakdowns (per-cohort percentiles)
        [
          {
            cohort: 'treatment',
            p50: 100,
            p95: 200,
            p99: 300,
            routing_avg: 20,
            retrieval_avg: 30,
            injection_avg: 40,
            sample_count: 500,
          },
          {
            cohort: 'control',
            p50: 90,
            p95: 180,
            p99: 250,
            routing_avg: 18,
            retrieval_avg: 25,
            injection_avg: 0,
            sample_count: 500,
          },
        ],
        // trend (daily, last 30 days)
        [
          { date: '2026-02-01', cohort: 'treatment', p50: 105, p95: 210 },
          { date: '2026-02-01', cohort: 'control', p50: 92, p95: 185 },
          { date: '2026-02-02', cohort: 'treatment', p50: 100, p95: 200 },
          { date: '2026-02-02', cohort: 'control', p50: 90, p95: 180 },
        ],
        // cache hit rate
        [{ hits: 300, misses: 100 }]
      );

      const res = await request(app).get('/api/effectiveness/latency').expect(200);

      // Breakdowns
      expect(res.body.breakdowns).toHaveLength(2);
      expect(res.body.breakdowns[0].cohort).toBe('treatment');
      expect(res.body.breakdowns[0].p50_ms).toBe(100);
      expect(res.body.breakdowns[0].p95_ms).toBe(200);
      expect(res.body.breakdowns[1].cohort).toBe('control');

      // Trend (pivoted to one row per day)
      expect(res.body.trend).toHaveLength(2);
      expect(res.body.trend[0].date).toBe('2026-02-01');
      expect(res.body.trend[0].treatment_p95).toBe(210);
      expect(res.body.trend[0].control_p95).toBe(185);
      expect(res.body.trend[0].delta_p95).toBe(25); // 210 - 185

      // Cache
      expect(res.body.cache.hit_rate).toBeCloseTo(0.75); // 300/400
      expect(res.body.cache.total_hits).toBe(300);
      expect(res.body.cache.total_misses).toBe(100);
    });

    it('should handle zero cache entries', async () => {
      mockDb.pushResults([], [], [{ hits: 0, misses: 0 }]);

      const res = await request(app).get('/api/effectiveness/latency').expect(200);

      expect(res.body.cache.hit_rate).toBe(0);
    });

    it('should return 500 on database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockDb.select.mockImplementation(() => {
        throw new Error('query failed');
      });

      const res = await request(app).get('/api/effectiveness/latency').expect(500);

      expect(res.body.error).toBe('Failed to get latency details');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/utilization
  // =========================================================================

  describe('GET /api/effectiveness/utilization', () => {
    it('should return empty utilization details when db is null', async () => {
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(null);

      const res = await request(app).get('/api/effectiveness/utilization').expect(200);

      expect(res.body.histogram).toEqual([]);
      expect(res.body.by_method).toEqual([]);
      expect(res.body.pattern_rates).toEqual([]);
      expect(res.body.low_utilization_sessions).toEqual([]);
    });

    it('should return utilization histogram, methods, patterns, and low-util sessions', async () => {
      mockDb.pushResults(
        // histogram
        [
          { bucket: 0, count: 5 },
          { bucket: 5, count: 20 },
          { bucket: 9, count: 10 },
        ],
        // byMethod
        [
          { method: 'ast_diff', median: 0.7, count: 100 },
          { method: 'token_overlap', median: 0.5, count: 50 },
        ],
        // patternRates (top 20)
        [{ pattern_id: 'pat-1', avg_util: 0.85, count: 30 }],
        // lowUtil sessions
        [
          {
            sessionId: 'sess-1',
            utilizationScore: '0.1',
            agentName: 'debug-agent',
            detectionMethod: 'ast_diff',
            createdAt: new Date('2026-02-08T10:00:00Z'),
          },
        ]
      );

      const res = await request(app).get('/api/effectiveness/utilization').expect(200);

      // Histogram
      expect(res.body.histogram).toHaveLength(3);
      expect(res.body.histogram[0].range_start).toBe(0);
      expect(res.body.histogram[0].range_end).toBe(0.1);
      expect(res.body.histogram[0].count).toBe(5);
      // Bucket 9 -> range_start=0.9, range_end=1.0
      expect(res.body.histogram[2].range_start).toBe(0.9);
      expect(res.body.histogram[2].range_end).toBe(1.0);

      // By method
      expect(res.body.by_method).toHaveLength(2);
      expect(res.body.by_method[0].method).toBe('ast_diff');
      expect(res.body.by_method[0].median_score).toBeCloseTo(0.7);

      // Pattern rates
      expect(res.body.pattern_rates).toHaveLength(1);
      expect(res.body.pattern_rates[0].pattern_id).toBe('pat-1');
      expect(res.body.pattern_rates[0].avg_utilization).toBeCloseTo(0.85);

      // Low utilization sessions
      expect(res.body.low_utilization_sessions).toHaveLength(1);
      expect(res.body.low_utilization_sessions[0].session_id).toBe('sess-1');
      expect(res.body.low_utilization_sessions[0].utilization_score).toBeCloseTo(0.1);
      expect(res.body.low_utilization_sessions[0].agent_name).toBe('debug-agent');
    });

    it('should return 500 on database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockDb.select.mockImplementation(() => {
        throw new Error('utilization query boom');
      });

      const res = await request(app).get('/api/effectiveness/utilization').expect(500);

      expect(res.body.error).toBe('Failed to get utilization details');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/ab
  // =========================================================================

  describe('GET /api/effectiveness/ab', () => {
    it('should return empty ab comparison when db is null', async () => {
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(null);

      const res = await request(app).get('/api/effectiveness/ab').expect(200);

      expect(res.body.cohorts).toEqual([]);
      expect(res.body.total_sessions).toBe(0);
    });

    it('should return cohort comparison data', async () => {
      mockDb.pushResults([
        {
          cohort: 'treatment',
          count: 120,
          median_utilization: 0.65,
          avg_accuracy: 0.82,
          success_rate: 0.9,
          avg_latency: 175,
        },
        {
          cohort: 'control',
          count: 80,
          median_utilization: null,
          avg_accuracy: null,
          success_rate: 0.88,
          avg_latency: 160,
        },
      ]);

      const res = await request(app).get('/api/effectiveness/ab').expect(200);

      expect(res.body.total_sessions).toBe(200);
      expect(res.body.cohorts).toHaveLength(2);

      const treatment = res.body.cohorts.find((c: any) => c.cohort === 'treatment');
      expect(treatment.session_count).toBe(120);
      expect(treatment.median_utilization_pct).toBeCloseTo(65); // 0.65 * 100
      expect(treatment.avg_accuracy_pct).toBeCloseTo(82);
      expect(treatment.success_rate_pct).toBeCloseTo(90);
      expect(treatment.avg_latency_ms).toBeCloseTo(175);

      const control = res.body.cohorts.find((c: any) => c.cohort === 'control');
      expect(control.session_count).toBe(80);
      expect(control.median_utilization_pct).toBe(0); // null -> 0
      expect(control.avg_accuracy_pct).toBe(0); // null -> 0
    });

    it('should return 500 on database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockDb.select.mockImplementation(() => {
        throw new Error('ab query failed');
      });

      const res = await request(app).get('/api/effectiveness/ab').expect(500);

      expect(res.body.error).toBe('Failed to get A/B comparison');
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // GET /api/effectiveness/trend
  // =========================================================================

  describe('GET /api/effectiveness/trend', () => {
    it('should return empty trend array when db is null', async () => {
      vi.mocked(tryGetIntelligenceDb).mockReturnValue(null);

      const res = await request(app).get('/api/effectiveness/trend').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return trend data points', async () => {
      mockDb.pushResults(
        // rangeResult (days of data)
        [{ days: 5 }],
        // rows (daily buckets)
        [
          {
            bucket: '2026-02-05 00:00:00',
            injection_rate: 0.75,
            avg_utilization: 0.6,
            avg_accuracy: 0.8,
            avg_latency_delta_ms: 25,
          },
          {
            bucket: '2026-02-06 00:00:00',
            injection_rate: 0.8,
            avg_utilization: 0.65,
            avg_accuracy: 0.82,
            avg_latency_delta_ms: 20,
          },
        ]
      );

      const res = await request(app).get('/api/effectiveness/trend').expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].date).toBe('2026-02-05 00:00:00');
      expect(res.body[0].injection_rate).toBeCloseTo(0.75);
      expect(res.body[0].avg_utilization).toBeCloseTo(0.6);
      expect(res.body[0].avg_accuracy).toBeCloseTo(0.8);
      expect(res.body[0].avg_latency_delta_ms).toBeCloseTo(25);
    });

    it('should use hourly granularity when day span < 3', async () => {
      mockDb.pushResults(
        // rangeResult: less than 3 days
        [{ days: 1.5 }],
        // rows (hourly buckets)
        [
          {
            bucket: '2026-02-08 10:00:00',
            injection_rate: 0.7,
            avg_utilization: 0.55,
            avg_accuracy: 0.78,
            avg_latency_delta_ms: 30,
          },
        ]
      );

      const res = await request(app).get('/api/effectiveness/trend').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].date).toContain('10:00:00');
    });

    it('should filter out rows with null avg_latency_delta_ms', async () => {
      mockDb.pushResults(
        [{ days: 7 }],
        [
          {
            bucket: '2026-02-05 00:00:00',
            injection_rate: 0.7,
            avg_utilization: 0.5,
            avg_accuracy: 0.8,
            avg_latency_delta_ms: null, // should be filtered
          },
          {
            bucket: '2026-02-06 00:00:00',
            injection_rate: 0.75,
            avg_utilization: 0.55,
            avg_accuracy: 0.82,
            avg_latency_delta_ms: 15,
          },
        ]
      );

      const res = await request(app).get('/api/effectiveness/trend').expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].date).toBe('2026-02-06 00:00:00');
    });

    it('should handle empty data gracefully', async () => {
      mockDb.pushResults([{ days: null }], []);

      const res = await request(app).get('/api/effectiveness/trend').expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return 500 on database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockDb.select.mockImplementation(() => {
        throw new Error('trend query failed');
      });

      const res = await request(app).get('/api/effectiveness/trend').expect(500);

      expect(res.body.error).toBe('Failed to get trend');
      consoleErrorSpy.mockRestore();
    });
  });
});
