/**
 * Integration test helpers for patterns API tests.
 *
 * Provides database connection, seeding, truncation, and Express app
 * factory for testing the patterns route against a real PostgreSQL database.
 *
 * SAFETY: Refuses to run against any database whose name does not end
 * with _test or -test.
 */

import { randomUUID } from 'crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { learnedPatterns } from '@shared/intelligence-schema';
import type { InsertLearnedPattern } from '@shared/intelligence-schema';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

let pool: InstanceType<typeof Pool> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

/**
 * Parse database name from a PostgreSQL connection URL.
 * Handles URLs like:
 *   postgresql://user:pass@host:port/dbname
 *   postgresql://user:pass@host:port/dbname?sslmode=require
 */
function parseDatabaseName(url: string): string {
  try {
    const parsed = new URL(url);
    // pathname is "/dbname" — strip leading slash
    return parsed.pathname.replace(/^\//, '');
  } catch {
    // Fallback: grab everything after the last slash, before any query string
    const match = url.match(/\/([^/?]+)(\?|$)/);
    return match?.[1] ?? '';
  }
}

/**
 * Get (or create) a Drizzle instance connected to the test database.
 *
 * Reads `TEST_DATABASE_URL` from the environment. Throws if:
 * - The env var is missing
 * - The target database name does not end with `_test` or `-test`
 */
export function getTestDb(): ReturnType<typeof drizzle> {
  if (db) return db;

  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL environment variable is not set. ' +
        'Set it to a PostgreSQL connection string targeting a database ending with _test or -test.'
    );
  }

  const dbName = parseDatabaseName(url);
  if (!dbName.endsWith('_test') && !dbName.endsWith('-test')) {
    throw new Error(
      `Refusing to run: TEST_DATABASE_URL must target a database ending with _test or -test. Got: "${dbName}"`
    );
  }

  pool = new Pool({ connectionString: url });
  db = drizzle(pool);
  return db;
}

// ---------------------------------------------------------------------------
// Table operations
// ---------------------------------------------------------------------------

/**
 * Delete all rows from the learned_patterns table.
 * Uses DELETE (not TRUNCATE) to avoid permission issues.
 */
export async function truncatePatterns(): Promise<void> {
  const testDb = getTestDb();
  await testDb.delete(learnedPatterns);
}

/**
 * Bulk insert patterns into the learned_patterns table.
 */
export async function seedPatterns(items: InsertLearnedPattern[]): Promise<void> {
  if (items.length === 0) return;
  const testDb = getTestDb();
  await testDb.insert(learnedPatterns).values(items);
}

// ---------------------------------------------------------------------------
// Pattern factory
// ---------------------------------------------------------------------------

/**
 * Create a full InsertLearnedPattern with sensible defaults.
 * Any field can be overridden via the `overrides` parameter.
 */
export function makePattern(overrides: Partial<InsertLearnedPattern> = {}): InsertLearnedPattern {
  return {
    patternSignature: `test_pattern_${randomUUID().slice(0, 8)}`,
    domainId: 'test_domain',
    domainVersion: '1.0.0',
    domainCandidates: [],
    confidence: '0.500000',
    status: 'candidate',
    isCurrent: true,
    signatureHash: randomUUID(),
    qualityScore: '0.500000',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Close the test database pool connection.
 * Call this in afterAll to avoid open handle warnings.
 */
export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
