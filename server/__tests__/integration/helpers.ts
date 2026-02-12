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
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { learnedPatterns } from '@shared/intelligence-schema';
import type { InsertLearnedPattern } from '@shared/intelligence-schema';
import type { Express } from 'express';
import { vi } from 'vitest';

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
// Express app factory
// ---------------------------------------------------------------------------

/**
 * Build an Express app wired to the test database.
 *
 * Sets `DATABASE_URL` via `vi.stubEnv` before importing so the storage
 * module's lazy singleton connects to the test DB on first use.
 *
 * The caller provides a `registerRoutes` callback to mount whichever
 * route modules the test suite needs.
 *
 * We must keep DATABASE_URL set to the test URL for the ENTIRE suite
 * because storage.ts uses lazy initialization -- the actual pool connection
 * happens on the first `tryGetIntelligenceDb()` call (triggered by the first
 * supertest request), NOT at module import time.
 */
export async function createTestApp(
  registerRoutes: (app: Express) => void | Promise<void>
): Promise<Express> {
  // Point storage.ts at the test database -- kept for the entire suite
  vi.stubEnv('DATABASE_URL', process.env.TEST_DATABASE_URL!);

  const { default: express } = await import('express');
  const app = express();
  app.use(express.json());

  await registerRoutes(app);

  return app;
}

// ---------------------------------------------------------------------------
// Table existence guard
// ---------------------------------------------------------------------------

/**
 * Assert that a table exists in the test database.
 *
 * Throws a descriptive error when the table is missing (PostgreSQL error
 * code 42P01 -- undefined_table) so integration test failures are obvious.
 */
export async function assertTableExists(tableName: string): Promise<void> {
  const testDb = getTestDb();
  try {
    await testDb.execute(sql`SELECT 1 FROM ${sql.raw(tableName)} LIMIT 1`);
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '42P01' || pgErr.message?.includes('does not exist')) {
      throw new Error(
        `The ${tableName} table does not exist in the test database. ` +
          'Run migrations or create the table before running integration tests.'
      );
    }
    throw err;
  }
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
