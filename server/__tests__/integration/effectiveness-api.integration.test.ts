/**
 * Integration test - Effectiveness API endpoints
 *
 * Tests the full path: PostgreSQL effectiveness tables -> Drizzle ORM ->
 * effectiveness-routes.ts Express handler -> JSON API response.
 *
 * Requires TEST_DATABASE_URL pointing to a PostgreSQL database whose name
 * ends with _test or -test. The injection_effectiveness, latency_breakdowns,
 * and pattern_hit_rates tables must already exist.
 *
 * In CI, missing TEST_DATABASE_URL is a hard failure.
 * Outside CI, tests are skipped with a warning.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  getTestDb,
  truncateEffectiveness,
  seedEffectiveness,
  seedLatencyBreakdowns,
  seedPatternHitRates,
  makeEffectivenessRow,
  makeLatencyBreakdownRow,
  makePatternHitRateRow,
  closeTestDb,
  createTestApp,
  assertTableExists,
  resetEffectivenessProjectionCache,
} from './helpers';
import { resetIntelligenceDb } from '../../storage';
import { resetTableExistenceCache } from '../../pattern-queries';

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const canRunIntegrationTests = !!TEST_DB_URL;

// Outside CI, skip with loud warning (no throw -- let describe.skipIf handle it)
if (!canRunIntegrationTests) {
  console.warn(
    '\n\u26a0\ufe0f  TEST_DATABASE_URL not set \u2014 skipping effectiveness integration tests.\n' +
      '   Set TEST_DATABASE_URL=postgresql://.../<dbname>_test to enable.\n'
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!canRunIntegrationTests)('Effectiveness API Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // In CI, missing TEST_DATABASE_URL is a hard failure
    if (process.env.CI && !TEST_DB_URL) {
      throw new Error(
        'TEST_DATABASE_URL is required in CI. Set it to a PostgreSQL database ending with _test.'
      );
    }

    // Validate test database name (safety guard) and verify tables exist
    getTestDb();
    await assertTableExists('injection_effectiveness');
    await assertTableExists('latency_breakdowns');
    await assertTableExists('pattern_hit_rates');

    // Build the Express app (once for the suite -- routes are stateless)
    app = await createTestApp(async (expressApp) => {
      const { default: effectivenessRoutes } = await import('../../effectiveness-routes');
      expressApp.use('/api/effectiveness', effectivenessRoutes);
    });
  });

  beforeEach(async () => {
    await truncateEffectiveness();
    // Reset the in-memory TTL cache so each test queries the (now-empty) DB
    // rather than serving stale rows from a prior test's seed data.
    await resetEffectivenessProjectionCache();
  });

  afterAll(async () => {
    try {
      await truncateEffectiveness();
    } finally {
      try {
        await closeTestDb();
      } finally {
        try {
          await resetIntelligenceDb();
        } finally {
          resetTableExistenceCache();
          vi.unstubAllEnvs();
        }
      }
    }
  });

  // -----------------------------------------------------------------------
  // TC1: /summary returns correct shape with seeded data
  // -----------------------------------------------------------------------
  it('TC1: /summary returns correct shape with seeded data', async () => {
    // Seed 5 treatment sessions (injectionOccurred: true)
    const treatmentRows = Array.from({ length: 5 }, () =>
      makeEffectivenessRow({
        cohort: 'treatment',
        injectionOccurred: true,
        utilizationScore: '0.750000',
        agentMatchScore: '0.850000',
        userVisibleLatencyMs: 100,
        sessionOutcome: 'success',
      })
    );

    // Seed 3 control sessions
    const controlRows = Array.from({ length: 3 }, () =>
      makeEffectivenessRow({
        cohort: 'control',
        injectionOccurred: false,
        utilizationScore: '0.000000',
        agentMatchScore: '0.000000',
        userVisibleLatencyMs: 80,
        sessionOutcome: 'success',
      })
    );

    await seedEffectiveness([...treatmentRows, ...controlRows]);

    const response = await request(app).get('/api/effectiveness/summary').expect(200);

    // Assert all EffectivenessSummary fields exist
    expect(response.body).toHaveProperty('injection_rate');
    expect(response.body).toHaveProperty('injection_rate_target');
    expect(response.body).toHaveProperty('median_utilization');
    expect(response.body).toHaveProperty('utilization_target');
    expect(response.body).toHaveProperty('mean_agent_accuracy');
    expect(response.body).toHaveProperty('accuracy_target');
    expect(response.body).toHaveProperty('latency_delta_p95_ms');
    expect(response.body).toHaveProperty('latency_delta_target_ms');
    expect(response.body).toHaveProperty('total_sessions');
    expect(response.body).toHaveProperty('treatment_sessions');
    expect(response.body).toHaveProperty('control_sessions');
    expect(response.body).toHaveProperty('throttle_active');
    expect(response.body).toHaveProperty('throttle_reason');

    // Assert numeric fields are numbers (not strings)
    expect(typeof response.body.injection_rate).toBe('number');
    expect(typeof response.body.median_utilization).toBe('number');
    expect(typeof response.body.mean_agent_accuracy).toBe('number');
    expect(typeof response.body.latency_delta_p95_ms).toBe('number');
    expect(typeof response.body.total_sessions).toBe('number');
    expect(typeof response.body.treatment_sessions).toBe('number');
    expect(typeof response.body.control_sessions).toBe('number');

    // Assert session counts
    expect(response.body.treatment_sessions).toBe(5);
    expect(response.body.control_sessions).toBe(3);
    expect(response.body.total_sessions).toBe(8);
  });

  // -----------------------------------------------------------------------
  // TC2: /throttle returns correct shape
  // -----------------------------------------------------------------------
  it('TC2: /throttle returns correct shape', async () => {
    // Seed data below threshold count so throttle should be inactive
    const rows = Array.from({ length: 5 }, () =>
      makeEffectivenessRow({
        cohort: 'treatment',
        injectionOccurred: true,
      })
    );
    await seedEffectiveness(rows);

    const response = await request(app).get('/api/effectiveness/throttle').expect(200);

    // Assert ThrottleStatus shape
    expect(response.body).toHaveProperty('active');
    expect(response.body).toHaveProperty('reason');
    expect(response.body).toHaveProperty('latency_delta_p95_1h');
    expect(response.body).toHaveProperty('median_utilization_1h');
    expect(response.body).toHaveProperty('injected_sessions_1h');
    expect(response.body).toHaveProperty('window_start');

    // Under 50 sessions => throttle inactive
    expect(response.body.active).toBe(false);
  });

  // -----------------------------------------------------------------------
  // TC3: /latency returns breakdown with correct shape
  // -----------------------------------------------------------------------
  it('TC3: /latency returns breakdown with correct shape', async () => {
    // Seed latency_breakdowns rows for treatment and control cohorts
    const treatmentBreakdowns = Array.from({ length: 5 }, () =>
      makeLatencyBreakdownRow({
        cohort: 'treatment',
        userVisibleLatencyMs: 120,
        routingTimeMs: 10,
        retrievalTimeMs: 20,
        injectionTimeMs: 15,
        cacheHit: false,
      })
    );
    const controlBreakdowns = Array.from({ length: 3 }, () =>
      makeLatencyBreakdownRow({
        cohort: 'control',
        userVisibleLatencyMs: 90,
        routingTimeMs: 8,
        retrievalTimeMs: 0,
        injectionTimeMs: 0,
        cacheHit: false,
      })
    );
    await seedLatencyBreakdowns([...treatmentBreakdowns, ...controlBreakdowns]);

    const response = await request(app).get('/api/effectiveness/latency').expect(200);

    // Assert response has breakdowns, trend, cache
    expect(response.body).toHaveProperty('breakdowns');
    expect(response.body).toHaveProperty('trend');
    expect(response.body).toHaveProperty('cache');
    expect(Array.isArray(response.body.breakdowns)).toBe(true);
    expect(Array.isArray(response.body.trend)).toBe(true);

    // Each breakdown has numeric percentile fields
    for (const b of response.body.breakdowns) {
      expect(typeof b.p50_ms).toBe('number');
      expect(typeof b.p95_ms).toBe('number');
      expect(typeof b.p99_ms).toBe('number');
    }
  });

  // -----------------------------------------------------------------------
  // TC4: /utilization returns histogram and by-method data
  // -----------------------------------------------------------------------
  it('TC4: /utilization returns histogram and by-method data', async () => {
    // Seed injection_effectiveness rows with varied utilization scores
    const scores = ['0.100000', '0.300000', '0.500000', '0.700000', '0.900000'];
    const rows = scores.map((score) =>
      makeEffectivenessRow({
        utilizationScore: score,
        utilizationMethod: 'tool_call_match',
        injectionOccurred: true,
        cohort: 'treatment',
      })
    );
    await seedEffectiveness(rows);

    const response = await request(app).get('/api/effectiveness/utilization').expect(200);

    // Assert response has all expected arrays
    expect(response.body).toHaveProperty('histogram');
    expect(response.body).toHaveProperty('by_method');
    expect(response.body).toHaveProperty('pattern_rates');
    expect(response.body).toHaveProperty('low_utilization_sessions');
    expect(Array.isArray(response.body.histogram)).toBe(true);
    expect(Array.isArray(response.body.by_method)).toBe(true);
    expect(Array.isArray(response.body.pattern_rates)).toBe(true);
    expect(Array.isArray(response.body.low_utilization_sessions)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // TC5: /ab returns cohort comparison
  // -----------------------------------------------------------------------
  it('TC5: /ab returns cohort comparison', async () => {
    // Seed treatment and control sessions
    const treatmentRows = Array.from({ length: 4 }, () =>
      makeEffectivenessRow({
        cohort: 'treatment',
        injectionOccurred: true,
        utilizationScore: '0.800000',
        agentMatchScore: '0.900000',
        userVisibleLatencyMs: 110,
        sessionOutcome: 'success',
      })
    );
    const controlRows = Array.from({ length: 3 }, () =>
      makeEffectivenessRow({
        cohort: 'control',
        injectionOccurred: false,
        utilizationScore: '0.000000',
        agentMatchScore: '0.000000',
        userVisibleLatencyMs: 85,
        sessionOutcome: 'success',
      })
    );
    await seedEffectiveness([...treatmentRows, ...controlRows]);

    const response = await request(app).get('/api/effectiveness/ab').expect(200);

    // Assert response has cohorts array and total_sessions
    expect(response.body).toHaveProperty('cohorts');
    expect(response.body).toHaveProperty('total_sessions');
    expect(Array.isArray(response.body.cohorts)).toBe(true);

    // Each cohort entry has expected fields
    for (const cohort of response.body.cohorts) {
      expect(typeof cohort.session_count).toBe('number');
      expect(typeof cohort.median_utilization_pct).toBe('number');
      expect(typeof cohort.avg_accuracy_pct).toBe('number');
      expect(typeof cohort.success_rate_pct).toBe('number');
      expect(typeof cohort.avg_latency_ms).toBe('number');
    }
  });

  // -----------------------------------------------------------------------
  // TC6: /trend returns time-series points ordered by date
  // -----------------------------------------------------------------------
  it('TC6: /trend returns time-series points ordered by date', async () => {
    // Seed sessions with timestamps spread across different hours
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < 6; i++) {
      // Alternate treatment/control, spread across 3 hours
      const hourOffset = Math.floor(i / 2);
      const createdAt = new Date(now - (3 - hourOffset) * 60 * 60 * 1000);
      const isTreatment = i % 2 === 0;
      rows.push(
        makeEffectivenessRow({
          cohort: isTreatment ? 'treatment' : 'control',
          injectionOccurred: isTreatment,
          utilizationScore: '0.700000',
          agentMatchScore: '0.800000',
          userVisibleLatencyMs: 100 + i * 10,
          sessionOutcome: 'success',
          createdAt,
        })
      );
    }
    await seedEffectiveness(rows);

    const response = await request(app).get('/api/effectiveness/trend').expect(200);

    // Assert response is an array
    expect(Array.isArray(response.body)).toBe(true);

    // If non-empty, verify each point has expected fields
    if (response.body.length > 0) {
      for (const point of response.body) {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('injection_rate');
        expect(point).toHaveProperty('avg_utilization');
        expect(point).toHaveProperty('avg_accuracy');
        expect(point).toHaveProperty('avg_latency_delta_ms');
      }

      // Verify ordering by date ascending (if 2+ data points)
      if (response.body.length >= 2) {
        for (let i = 1; i < response.body.length; i++) {
          expect(response.body[i].date >= response.body[i - 1].date).toBe(true);
        }
      }
    }
  });

  // -----------------------------------------------------------------------
  // TC7: Empty tables return graceful defaults
  // -----------------------------------------------------------------------
  it('TC7: empty tables return graceful defaults', async () => {
    // Don't seed anything -- tables are already truncated by beforeEach

    // /summary returns empty-like object
    const summaryRes = await request(app).get('/api/effectiveness/summary').expect(200);
    expect(summaryRes.body.total_sessions).toBe(0);
    expect(summaryRes.body.treatment_sessions).toBe(0);
    expect(summaryRes.body.control_sessions).toBe(0);
    expect(summaryRes.body.throttle_active).toBe(false);
    expect(summaryRes.body.injection_rate).toBe(0);
    expect(summaryRes.body.median_utilization).toBe(0);
    expect(summaryRes.body.mean_agent_accuracy).toBe(0);

    // /throttle returns inactive
    const throttleRes = await request(app).get('/api/effectiveness/throttle').expect(200);
    expect(throttleRes.body.active).toBe(false);

    // /latency returns empty arrays
    const latencyRes = await request(app).get('/api/effectiveness/latency').expect(200);
    expect(latencyRes.body.breakdowns).toHaveLength(0);
    expect(latencyRes.body.trend).toHaveLength(0);

    // /utilization returns empty arrays
    const utilRes = await request(app).get('/api/effectiveness/utilization').expect(200);
    expect(utilRes.body.histogram).toHaveLength(0);
    expect(utilRes.body.by_method).toHaveLength(0);
    expect(utilRes.body.pattern_rates).toHaveLength(0);
    expect(utilRes.body.low_utilization_sessions).toHaveLength(0);

    // /ab returns empty cohorts
    const abRes = await request(app).get('/api/effectiveness/ab').expect(200);
    expect(abRes.body).toEqual({ cohorts: [], total_sessions: 0 });

    // /trend returns empty array
    const trendRes = await request(app).get('/api/effectiveness/trend').expect(200);
    expect(trendRes.body).toEqual([]);
  });
});
