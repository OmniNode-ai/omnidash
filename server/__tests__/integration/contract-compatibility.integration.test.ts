/**
 * Runtime contract compatibility test - Effectiveness API
 *
 * Validates that the JSON shapes returned by the effectiveness API endpoints
 * conform to their zod schemas. This catches drift between the TypeScript
 * types and actual runtime responses.
 *
 * Requires TEST_DATABASE_URL pointing to a PostgreSQL database whose name
 * ends with _test or -test.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
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
} from './helpers';
import { resetIntelligenceDb } from '../../storage';
import { resetTableExistenceCache } from '../../pattern-queries';

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const canRunIntegrationTests = !!TEST_DB_URL;

if (!canRunIntegrationTests) {
  console.warn(
    '\n\u26a0\ufe0f  TEST_DATABASE_URL not set \u2014 skipping contract compatibility tests.\n' +
      '   Set TEST_DATABASE_URL=postgresql://.../<dbname>_test to enable.\n'
  );
}

// ---------------------------------------------------------------------------
// Zod Schemas (contract definitions)
// ---------------------------------------------------------------------------

const EffectivenessSummarySchema = z.object({
  injection_rate: z.number(),
  injection_rate_target: z.number(),
  median_utilization: z.number(),
  utilization_target: z.number(),
  mean_agent_accuracy: z.number(),
  accuracy_target: z.number(),
  latency_delta_p95_ms: z.number(),
  latency_delta_target_ms: z.number(),
  total_sessions: z.number(),
  treatment_sessions: z.number(),
  control_sessions: z.number(),
  throttle_active: z.boolean(),
  throttle_reason: z.string().nullable(),
});

const ThrottleStatusSchema = z.object({
  active: z.boolean(),
  reason: z.string().nullable(),
  latency_delta_p95_1h: z.number().nullable(),
  median_utilization_1h: z.number().nullable(),
  injected_sessions_1h: z.number(),
  window_start: z.string().nullable(),
});

const LatencyDetailsSchema = z.object({
  breakdowns: z.array(
    z.object({
      cohort: z.string(),
      p50_ms: z.number(),
      p95_ms: z.number(),
      p99_ms: z.number(),
      routing_avg_ms: z.number(),
      retrieval_avg_ms: z.number(),
      injection_avg_ms: z.number(),
      sample_count: z.number(),
    })
  ),
  trend: z.array(
    z.object({
      date: z.string(),
      treatment_p50: z.number(),
      treatment_p95: z.number(),
      control_p50: z.number(),
      control_p95: z.number(),
      delta_p95: z.number(),
    })
  ),
  cache: z.object({
    hit_rate: z.number(),
    total_hits: z.number(),
    total_misses: z.number(),
  }),
});

const UtilizationDetailsSchema = z.object({
  histogram: z.array(
    z.object({
      range_start: z.number(),
      range_end: z.number(),
      count: z.number(),
    })
  ),
  by_method: z.array(
    z.object({
      method: z.string(),
      median_score: z.number(),
      session_count: z.number(),
    })
  ),
  pattern_rates: z.array(
    z.object({
      pattern_id: z.string(),
      avg_utilization: z.number(),
      session_count: z.number(),
    })
  ),
  low_utilization_sessions: z.array(
    z.object({
      session_id: z.string(),
      utilization_score: z.number(),
      agent_name: z.string().nullable(),
      detection_method: z.string().nullable(),
      created_at: z.string(),
    })
  ),
});

const ABComparisonSchema = z.object({
  cohorts: z.array(
    z.object({
      cohort: z.string(),
      session_count: z.number(),
      median_utilization_pct: z.number(),
      avg_accuracy_pct: z.number(),
      success_rate_pct: z.number(),
      avg_latency_ms: z.number(),
    })
  ),
  total_sessions: z.number(),
});

const EffectivenessTrendSchema = z.array(
  z.object({
    date: z.string(),
    injection_rate: z.number(),
    avg_utilization: z.number(),
    avg_accuracy: z.number(),
    avg_latency_delta_ms: z.number(),
  })
);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!canRunIntegrationTests)('Contract Compatibility Tests - Effectiveness API', () => {
  let app: Express;

  beforeAll(async () => {
    if (process.env.CI && !TEST_DB_URL) {
      throw new Error(
        'TEST_DATABASE_URL is required in CI. Set it to a PostgreSQL database ending with _test.'
      );
    }

    getTestDb();
    await assertTableExists('injection_effectiveness');
    await assertTableExists('latency_breakdowns');
    await assertTableExists('pattern_hit_rates');

    app = await createTestApp(async (expressApp) => {
      const { default: effectivenessRoutes } = await import('../../effectiveness-routes');
      expressApp.use('/api/effectiveness', effectivenessRoutes);
    });
  });

  beforeEach(async () => {
    await truncateEffectiveness();
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

  // ---------------------------------------------------------------------
  // TC1: Seeded data passes zod validation on all endpoints
  // ---------------------------------------------------------------------
  it('TC1: seeded data produces responses that pass zod schema validation', async () => {
    // Seed realistic data across all three tables
    const now = Date.now();
    const treatmentRows = Array.from({ length: 5 }, (_, i) =>
      makeEffectivenessRow({
        cohort: 'treatment',
        injectionOccurred: true,
        utilizationScore: (0.5 + i * 0.1).toFixed(6),
        agentMatchScore: (0.7 + i * 0.05).toFixed(6),
        userVisibleLatencyMs: 100 + i * 20,
        sessionOutcome: 'success',
        utilizationMethod: 'tool_call_match',
        detectionMethod: 'exact_match',
        createdAt: new Date(now - i * 60 * 60 * 1000),
      })
    );
    const controlRows = Array.from({ length: 3 }, (_, i) =>
      makeEffectivenessRow({
        cohort: 'control',
        injectionOccurred: false,
        utilizationScore: '0.000000',
        agentMatchScore: '0.000000',
        userVisibleLatencyMs: 80 + i * 10,
        sessionOutcome: 'success',
        createdAt: new Date(now - i * 60 * 60 * 1000),
      })
    );
    await seedEffectiveness([...treatmentRows, ...controlRows]);

    // Seed latency breakdowns
    const treatmentBreakdowns = Array.from({ length: 4 }, () =>
      makeLatencyBreakdownRow({
        cohort: 'treatment',
        userVisibleLatencyMs: 120,
        cacheHit: false,
      })
    );
    const controlBreakdowns = Array.from({ length: 3 }, () =>
      makeLatencyBreakdownRow({
        cohort: 'control',
        userVisibleLatencyMs: 85,
        cacheHit: true,
      })
    );
    await seedLatencyBreakdowns([...treatmentBreakdowns, ...controlBreakdowns]);

    // Seed pattern hit rates
    const hitRates = Array.from({ length: 3 }, () => makePatternHitRateRow());
    await seedPatternHitRates(hitRates);

    // Validate /summary
    const summaryRes = await request(app).get('/api/effectiveness/summary').expect(200);
    expect(() => EffectivenessSummarySchema.parse(summaryRes.body)).not.toThrow();

    // Validate /throttle
    const throttleRes = await request(app).get('/api/effectiveness/throttle').expect(200);
    expect(() => ThrottleStatusSchema.parse(throttleRes.body)).not.toThrow();

    // Validate /latency
    const latencyRes = await request(app).get('/api/effectiveness/latency').expect(200);
    expect(() => LatencyDetailsSchema.parse(latencyRes.body)).not.toThrow();

    // Validate /utilization
    const utilRes = await request(app).get('/api/effectiveness/utilization').expect(200);
    expect(() => UtilizationDetailsSchema.parse(utilRes.body)).not.toThrow();

    // Validate /ab
    const abRes = await request(app).get('/api/effectiveness/ab').expect(200);
    expect(() => ABComparisonSchema.parse(abRes.body)).not.toThrow();

    // Validate /trend
    const trendRes = await request(app).get('/api/effectiveness/trend').expect(200);
    expect(() => EffectivenessTrendSchema.parse(trendRes.body)).not.toThrow();
  });

  // ---------------------------------------------------------------------
  // TC2: Empty tables produce responses that pass zod validation
  // ---------------------------------------------------------------------
  it('TC2: empty tables produce responses that pass zod schema validation', async () => {
    // No seeding -- tables are already truncated by beforeEach

    // Validate /summary (graceful defaults must still be valid)
    const summaryRes = await request(app).get('/api/effectiveness/summary').expect(200);
    expect(() => EffectivenessSummarySchema.parse(summaryRes.body)).not.toThrow();

    // Validate /throttle
    const throttleRes = await request(app).get('/api/effectiveness/throttle').expect(200);
    expect(() => ThrottleStatusSchema.parse(throttleRes.body)).not.toThrow();

    // Validate /latency
    const latencyRes = await request(app).get('/api/effectiveness/latency').expect(200);
    expect(() => LatencyDetailsSchema.parse(latencyRes.body)).not.toThrow();

    // Validate /utilization
    const utilRes = await request(app).get('/api/effectiveness/utilization').expect(200);
    expect(() => UtilizationDetailsSchema.parse(utilRes.body)).not.toThrow();

    // Validate /ab
    const abRes = await request(app).get('/api/effectiveness/ab').expect(200);
    expect(() => ABComparisonSchema.parse(abRes.body)).not.toThrow();

    // Validate /trend
    const trendRes = await request(app).get('/api/effectiveness/trend').expect(200);
    expect(() => EffectivenessTrendSchema.parse(trendRes.body)).not.toThrow();
  });
});
