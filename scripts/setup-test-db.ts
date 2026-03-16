/* eslint-disable no-console */
/**
 * Create and migrate the omnidash_analytics_test database (OMN-4820).
 *
 * Without this script, connecting to omnidash_analytics_test causes a FATAL
 * log in PostgreSQL because the database does not exist. Tests skip gracefully
 * but the noise is undesirable.
 *
 * This script:
 *   1. Connects to the default "postgres" maintenance database.
 *   2. Creates omnidash_analytics_test if it does not already exist.
 *   3. Runs every SQL migration from migrations/ against the test database.
 *
 * Usage:
 *   npm run db:test:setup
 *   # or directly:
 *   tsx scripts/setup-test-db.ts
 *
 * Environment:
 *   POSTGRES_HOST     (default: localhost)
 *   POSTGRES_PORT     (default: 5436 — external Docker port)
 *   POSTGRES_USER     (default: postgres)
 *   POSTGRES_PASSWORD (required — source ~/.omnibase/.env)
 */

import { config } from 'dotenv';
config();

import fs from 'node:fs';
import path from 'node:path';
import pkg from 'pg';
const { Pool } = pkg;

const TEST_DB_NAME = 'omnidash_analytics_test';

function getConnectionParams() {
  return {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? '5436'),
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  };
}

async function ensureDatabaseExists(): Promise<void> {
  const params = getConnectionParams();
  // Connect to the maintenance database to run CREATE DATABASE.
  const pool = new Pool({ ...params, database: 'postgres' });

  try {
    const { rows } = await pool.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME]
    );

    if (rows.length === 0) {
      console.log(`[test-db] Creating database: ${TEST_DB_NAME}`);
      // CREATE DATABASE cannot be parameterised — the name is a constant above,
      // so SQL injection is not a concern.
      await pool.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
      console.log(`[test-db] Database created`);
    } else {
      console.log(`[test-db] Database already exists: ${TEST_DB_NAME}`);
    }
  } finally {
    await pool.end();
  }
}

async function runMigrations(): Promise<void> {
  const params = getConnectionParams();
  const pool = new Pool({ ...params, database: TEST_DB_NAME });

  try {
    const client = await pool.connect();
    console.log(`[test-db] Connected to ${TEST_DB_NAME}`);
    client.release();

    const scriptDir = import.meta.dirname;
    const migrationsDir = path.resolve(scriptDir, '..', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    console.log(`[test-db] Found ${files.length} migration files`);

    // Bootstrap migration tracking table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const { rowCount } = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [
        file,
      ]);
      if (rowCount && rowCount > 0) {
        console.log(`[test-db] Skipping (already applied): ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      console.log(`[test-db] Running: ${file}`);
      try {
        await pool.query('BEGIN');
        await pool.query(sqlContent);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`[test-db] OK: ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error(`[test-db] FAILED: ${file}`, err instanceof Error ? err.message : err);
        throw err;
      }
    }

    console.log('[test-db] All migrations completed successfully');
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  await ensureDatabaseExists();
  await runMigrations();
}

main().catch((err) => {
  console.error('[test-db] Fatal error:', err);
  process.exit(1);
});
