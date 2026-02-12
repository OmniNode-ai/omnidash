/**
 * E2E-002: Integration test - Pattern storage to dashboard API
 *
 * Tests the full path: PostgreSQL learned_patterns table -> Drizzle ORM ->
 * patterns-routes.ts Express handler -> JSON API response.
 *
 * Requires TEST_DATABASE_URL pointing to a PostgreSQL database whose name
 * ends with _test or -test. The learned_patterns table must already exist.
 *
 * In CI, missing TEST_DATABASE_URL is a hard failure.
 * Outside CI, tests are skipped with a warning.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { InsertLearnedPattern } from '@shared/intelligence-schema';
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
import { resetTableExistenceCache } from '../../pattern-queries';

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
    await assertTableExists('learned_patterns');

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
    await truncatePatterns();
    await closeTestDb();

    // Close the lazy-init pool that storage.ts created when the first
    // supertest request triggered tryGetIntelligenceDb().
    await resetIntelligenceDb();

    // Reset the table-existence cache in pattern-queries so subsequent
    // test runs start with a clean slate (avoids circular dep with storage).
    resetTableExistenceCache();

    // Restore original DATABASE_URL so other test files are unaffected
    vi.unstubAllEnvs();
  });

  // -----------------------------------------------------------------------
  // TC1: Basic query (10 patterns, mixed status)
  // -----------------------------------------------------------------------
  it('TC1: returns all current patterns with correct shape and defaults', async () => {
    const statuses: InsertLearnedPattern['status'][] = [
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

    const patterns = statuses.map((status) => makePattern({ status, isCurrent: true }));
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
      expect(p).toHaveProperty('success_rate_rolling_20');
      expect(p).toHaveProperty('sample_size_rolling_20');
      expect(p).toHaveProperty('created_at');
      expect(p).toHaveProperty('updated_at');

      // confidence and quality_score must be numbers, not strings
      expect(typeof p.confidence).toBe('number');
      expect(typeof p.quality_score).toBe('number');

      // Dates must be ISO strings
      expect(() => new Date(p.created_at).toISOString()).not.toThrow();
      expect(() => new Date(p.updated_at).toISOString()).not.toThrow();
    }
  });

  // -----------------------------------------------------------------------
  // TC2: Status filter
  // -----------------------------------------------------------------------
  it('TC2: filters patterns by status', async () => {
    const validated = Array.from({ length: 5 }, () =>
      makePattern({ status: 'validated', isCurrent: true })
    );
    const candidate = Array.from({ length: 5 }, () =>
      makePattern({ status: 'candidate', isCurrent: true })
    );
    await seedPatterns([...validated, ...candidate]);

    const response = await request(app).get('/api/patterns?status=validated').expect(200);

    expect(response.body.patterns).toHaveLength(5);
    expect(response.body.total).toBe(5);
    for (const p of response.body.patterns) {
      expect(p.status).toBe('validated');
    }
  });

  // -----------------------------------------------------------------------
  // TC3: Confidence filter
  // -----------------------------------------------------------------------
  it('TC3: filters patterns by minimum confidence', async () => {
    const confidences = ['0.300000', '0.500000', '0.700000', '0.900000'];
    const patterns = confidences.map((confidence) => makePattern({ confidence, isCurrent: true }));
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
  it('TC4: paginates results ordered by quality_score descending', async () => {
    // Create 100 patterns with quality scores 0.01 through 1.00
    const baseTime = new Date('2025-01-01T00:00:00Z');
    const patterns = Array.from({ length: 100 }, (_, i) => {
      const qualityScore = ((i + 1) * 0.01).toFixed(6);
      // Sequential timestamps for deterministic secondary sort
      const createdAt = new Date(baseTime.getTime() + i * 1000);
      return makePattern({
        qualityScore,
        isCurrent: true,
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

    // Verify descending order by quality_score
    const scores = response.body.patterns.map((p: { quality_score: number }) => p.quality_score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }

    // The 51st highest quality_score is 0.50 (100 - 50 = 50th index in desc order)
    // Scores descending: 1.00, 0.99, 0.98, ..., 0.51, 0.50, ...
    // offset=50 means skip 50 => first returned is the 51st, which is 0.50
    expect(scores[0]).toBeCloseTo(0.5, 2);

    // The 75th highest is 0.26 (100 - 74 = 26th value)
    // Last in this page is the 75th, which is 0.26
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
  // TC6: success_rate_rolling_20 null handling
  // -----------------------------------------------------------------------
  it('TC6: returns null for success_rate when sample size is 0, and calculates correctly otherwise', async () => {
    const zeroSample = makePattern({
      isCurrent: true,
      injectionCountRolling20: 0,
      successCountRolling20: 0,
      qualityScore: '0.600000',
      patternSignature: 'zero_sample_pattern',
    });
    const nonZeroSample = makePattern({
      isCurrent: true,
      injectionCountRolling20: 10,
      successCountRolling20: 8,
      qualityScore: '0.400000',
      patternSignature: 'nonzero_sample_pattern',
    });
    await seedPatterns([zeroSample, nonZeroSample]);

    const response = await request(app).get('/api/patterns').expect(200);

    expect(response.body.patterns).toHaveLength(2);

    // Patterns are ordered by quality_score desc, so zero_sample (0.6) is first
    const zeroPattern = response.body.patterns.find(
      (p: { signature: string }) => p.signature === 'zero_sample_pattern'
    );
    const nonZeroPattern = response.body.patterns.find(
      (p: { signature: string }) => p.signature === 'nonzero_sample_pattern'
    );

    expect(zeroPattern).toBeDefined();
    expect(nonZeroPattern).toBeDefined();

    expect(zeroPattern.success_rate_rolling_20).toBeNull();
    expect(nonZeroPattern.success_rate_rolling_20).toBe(0.8);
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

  // -----------------------------------------------------------------------
  // TC8: isCurrent filter (superseded patterns excluded)
  // -----------------------------------------------------------------------
  it('TC8: excludes superseded patterns (isCurrent=false)', async () => {
    const current = Array.from({ length: 3 }, () => makePattern({ isCurrent: true }));
    const superseded = Array.from({ length: 2 }, () => makePattern({ isCurrent: false }));
    await seedPatterns([...current, ...superseded]);

    const response = await request(app).get('/api/patterns').expect(200);

    expect(response.body.total).toBe(3);
    expect(response.body.patterns).toHaveLength(3);
  });
});
