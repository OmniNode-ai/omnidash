/**
 * E2E-002: Integration test - Pattern storage to dashboard API (OMN-2924)
 *
 * Tests the full path: PostgreSQL pattern_learning_artifacts table -> Drizzle ORM ->
 * patterns-routes.ts Express handler -> JSON API response.
 *
 * Requires TEST_DATABASE_URL pointing to a PostgreSQL database whose name
 * ends with _test or -test. The pattern_learning_artifacts table must already exist.
 *
 * In CI, missing TEST_DATABASE_URL is a hard failure.
 * Outside CI, tests are skipped with a warning.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  getTestDb,
  truncatePatterns,
  seedPatterns,
  makePattern,
  closeTestDb,
  createTestApp,
  assertTableExists,
} from './helpers';
import { resetIntelligenceDb } from '../../storage';

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const canRunIntegrationTests = !!TEST_DB_URL;

// Outside CI, skip with loud warning (no throw — let describe.skipIf handle it)
if (!canRunIntegrationTests) {
  console.warn(
    '\n\u26a0\ufe0f  TEST_DATABASE_URL not set \u2014 skipping integration tests.\n' +
      '   Set TEST_DATABASE_URL=postgresql://.../<dbname>_test to enable.\n'
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!canRunIntegrationTests)('Patterns API Integration Tests (E2E-002)', () => {
  let app: Express;

  beforeAll(async () => {
    // In CI, missing TEST_DATABASE_URL is a hard failure
    if (process.env.CI && !TEST_DB_URL) {
      throw new Error(
        'TEST_DATABASE_URL is required in CI. Set it to a PostgreSQL database ending with _test.'
      );
    }

    // Validate test database name (safety guard) and verify table exists
    getTestDb();
    await assertTableExists('pattern_learning_artifacts');

    // Build the Express app (once for the suite -- routes are stateless)
    app = await createTestApp(async (expressApp) => {
      const { default: patternsRoutes } = await import('../../patterns-routes');
      expressApp.use('/api/patterns', patternsRoutes);
    });
  });

  beforeEach(async () => {
    await truncatePatterns();
  });

  afterAll(async () => {
    try {
      await truncatePatterns();
    } finally {
      try {
        await closeTestDb();
      } finally {
        try {
          // Close the lazy-init pool that storage.ts created when the first
          // supertest request triggered tryGetIntelligenceDb().
          await resetIntelligenceDb();
        } finally {
          // Restore original DATABASE_URL so other test files are unaffected
          vi.unstubAllEnvs();
        }
      }
    }
  });

  // -----------------------------------------------------------------------
  // TC1: Basic query (10 patterns, mixed status)
  // -----------------------------------------------------------------------
  it('TC1: returns all patterns with correct shape and defaults', async () => {
    const statuses = [
      'validated',
      'validated',
      'validated',
      'candidate',
      'candidate',
      'candidate',
      'provisional',
      'provisional',
      'deprecated',
      'deprecated',
    ];

    const patterns = statuses.map((status) => makePattern({ lifecycleState: status }));
    await seedPatterns(patterns);

    const response = await request(app).get('/api/patterns').expect(200);

    expect(response.body.patterns).toHaveLength(10);
    expect(response.body.total).toBe(10);
    expect(response.body.limit).toBe(50);
    expect(response.body.offset).toBe(0);

    // Verify each pattern has all required fields with correct types
    for (const p of response.body.patterns) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('signature');
      expect(p).toHaveProperty('status');
      expect(p).toHaveProperty('confidence');
      expect(p).toHaveProperty('quality_score');
      expect(p).toHaveProperty('usage_count_rolling_20');

      // confidence and quality_score must be numbers, not strings
      expect(typeof p.confidence).toBe('number');
      expect(typeof p.quality_score).toBe('number');
    }
  });

  // -----------------------------------------------------------------------
  // TC2: Status filter
  // -----------------------------------------------------------------------
  it('TC2: filters patterns by lifecycle_state', async () => {
    const validated = Array.from({ length: 5 }, () => makePattern({ lifecycleState: 'validated' }));
    const candidate = Array.from({ length: 5 }, () => makePattern({ lifecycleState: 'candidate' }));
    await seedPatterns([...validated, ...candidate]);

    const response = await request(app).get('/api/patterns?status=validated').expect(200);

    expect(response.body.patterns).toHaveLength(5);
    expect(response.body.total).toBe(5);
    for (const p of response.body.patterns) {
      expect(p.status).toBe('validated');
    }
  });

  // -----------------------------------------------------------------------
  // TC3: Confidence filter (maps to composite_score)
  // -----------------------------------------------------------------------
  it('TC3: filters patterns by minimum composite_score', async () => {
    const scores = ['0.300000', '0.500000', '0.700000', '0.900000'];
    const patterns = scores.map((compositeScore) => makePattern({ compositeScore }));
    await seedPatterns(patterns);

    const response = await request(app).get('/api/patterns?min_confidence=0.6').expect(200);

    expect(response.body.patterns).toHaveLength(2);
    expect(response.body.total).toBe(2);
    for (const p of response.body.patterns) {
      expect(p.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });

  // -----------------------------------------------------------------------
  // TC4: Pagination (deterministic ordering)
  // -----------------------------------------------------------------------
  it('TC4: paginates results ordered by composite_score descending', async () => {
    // Create 100 patterns with composite scores 0.01 through 1.00
    const baseTime = new Date('2025-01-01T00:00:00Z');
    const patterns = Array.from({ length: 100 }, (_, i) => {
      const compositeScore = ((i + 1) * 0.01).toFixed(6);
      const createdAt = new Date(baseTime.getTime() + i * 1000);
      return makePattern({
        compositeScore,
        createdAt,
        updatedAt: createdAt,
      });
    });
    await seedPatterns(patterns);

    const response = await request(app).get('/api/patterns?limit=25&offset=50').expect(200);

    expect(response.body.patterns).toHaveLength(25);
    expect(response.body.total).toBe(100);
    expect(response.body.limit).toBe(25);
    expect(response.body.offset).toBe(50);

    // Verify descending order by composite_score (mapped to confidence)
    const scores = response.body.patterns.map((p: { confidence: number }) => p.confidence);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }

    // The 51st highest composite_score is 0.50
    expect(scores[0]).toBeCloseTo(0.5, 2);

    // The 75th highest is 0.26
    expect(scores[scores.length - 1]).toBeCloseTo(0.26, 2);
  });

  // -----------------------------------------------------------------------
  // TC5: Empty results
  // -----------------------------------------------------------------------
  it('TC5: returns empty array when no patterns exist', async () => {
    // Table already truncated by beforeEach
    const response = await request(app).get('/api/patterns').expect(200);

    expect(response.body.patterns).toHaveLength(0);
    expect(response.body.total).toBe(0);
    expect(Array.isArray(response.body.patterns)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // TC7: Invalid parameters
  // -----------------------------------------------------------------------
  it('TC7: returns 400 for invalid status', async () => {
    const response = await request(app).get('/api/patterns?status=invalid_status').expect(400);

    expect(response.body).toHaveProperty('error', 'Invalid query parameters');
  });

  it('TC7: returns 400 for min_confidence > 1.0', async () => {
    const response = await request(app).get('/api/patterns?min_confidence=1.5').expect(400);

    expect(response.body).toHaveProperty('error', 'Invalid query parameters');
  });

  it('TC7: returns 400 for negative min_confidence', async () => {
    const response = await request(app).get('/api/patterns?min_confidence=-0.1').expect(400);

    expect(response.body).toHaveProperty('error', 'Invalid query parameters');
  });
});
