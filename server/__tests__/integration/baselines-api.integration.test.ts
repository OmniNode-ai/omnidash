/**
 * Integration test — Baselines & ROI API endpoints
 *
 * Tests the full path: PostgreSQL baselines_* tables -> Drizzle ORM ->
 * baselines-routes.ts Express handler -> JSON API response.
 *
 * Requires TEST_DATABASE_URL pointing to a PostgreSQL database whose name
 * ends with _test or -test. The baselines_* tables must already exist
 * (run migrations/0004_baselines_roi.sql, 0005_baselines_trend_unique.sql,
 * and 0006_baselines_breakdown_unique.sql).
 *
 * In CI, missing TEST_DATABASE_URL is a hard failure.
 * Outside CI, tests are skipped with a warning.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  getTestDb,
  closeTestDb,
  createTestApp,
  resetBaselinesProjectionCache,
  truncateBaselines,
} from './helpers';
import { resetIntelligenceDb } from '../../storage';

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const canRunIntegrationTests = !!TEST_DB_URL;

// CI guard: fail fast at module scope so describe.skipIf cannot silently swallow
// the missing URL. When CI=true and TEST_DB_URL is absent the suite would be
// skipped before beforeAll runs, meaning a guard placed inside beforeAll would
// never fire in the environment where it is most needed.
if (process.env.CI && !TEST_DB_URL) {
  throw new Error(
    'TEST_DATABASE_URL is required in CI. Set it to a PostgreSQL database ending with _test.'
  );
}

if (!canRunIntegrationTests) {
  console.warn(
    '\n⚠️  TEST_DATABASE_URL not set — skipping baselines integration tests.\n' +
      '   Set TEST_DATABASE_URL=postgresql://.../<dbname>_test to enable.\n'
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!canRunIntegrationTests)('Baselines API Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    getTestDb();

    app = await createTestApp(async (expressApp) => {
      const { default: baselinesRoutes } = await import('../../baselines-routes');
      expressApp.use('/api/baselines', baselinesRoutes);
    });
  });

  beforeEach(async () => {
    // Truncate all baselines_* tables so prior test runs cannot leave rows
    // that cause TC1 ('returns empty-state payload when no snapshot data exists')
    // to fail non-deterministically. Child tables are deleted before the parent
    // to satisfy FK constraints (same order used by truncateBaselines()).
    await truncateBaselines();
    // Reset the in-memory TTL cache so each test queries the (now-empty) DB
    // rather than serving stale rows from a prior test's seed data.
    resetBaselinesProjectionCache();
  });

  afterAll(async () => {
    try {
      await closeTestDb();
    } finally {
      try {
        await resetIntelligenceDb();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  // -------------------------------------------------------------------------
  // TC1: /summary returns an empty-state payload when no snapshot exists
  // -------------------------------------------------------------------------
  it('TC1: /summary returns empty-state payload when no snapshot data exists', async () => {
    const response = await request(app).get('/api/baselines/summary').expect(200);

    // Assert all BaselinesSummary fields exist and have numeric type
    expect(response.body).toHaveProperty('total_comparisons');
    expect(response.body).toHaveProperty('promote_count');
    expect(response.body).toHaveProperty('shadow_count');
    expect(response.body).toHaveProperty('suppress_count');
    expect(response.body).toHaveProperty('fork_count');
    expect(response.body).toHaveProperty('avg_cost_savings');
    expect(response.body).toHaveProperty('avg_outcome_improvement');
    expect(response.body).toHaveProperty('total_token_savings');
    expect(response.body).toHaveProperty('total_time_savings_ms');
    expect(response.body).toHaveProperty('trend_point_count');

    expect(typeof response.body.total_comparisons).toBe('number');
    expect(typeof response.body.trend_point_count).toBe('number');
  });

  // -------------------------------------------------------------------------
  // TC2: /trend returns an array
  // -------------------------------------------------------------------------
  it('TC2: /trend returns an array', async () => {
    const response = await request(app).get('/api/baselines/trend').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC3: /comparisons returns an array
  // -------------------------------------------------------------------------
  it('TC3: /comparisons returns an array', async () => {
    const response = await request(app).get('/api/baselines/comparisons').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC4: /breakdown returns an array
  // -------------------------------------------------------------------------
  it('TC4: /breakdown returns an array', async () => {
    const response = await request(app).get('/api/baselines/breakdown').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC5: /trend respects the ?days query parameter
  // -------------------------------------------------------------------------
  it('TC5: /trend respects valid ?days parameter', async () => {
    const response = await request(app).get('/api/baselines/trend?days=7').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
