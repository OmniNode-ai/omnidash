/* eslint-disable no-console */
/**
 * Vitest globalSetup: ensure omnidash_analytics_test DB exists and is migrated
 * before any test file runs. Failures here are non-fatal — tests that need the
 * DB will skip gracefully (same as before this setup existed).
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

export async function setup(): Promise<void> {
  const params = getConnectionParams();

  // 1. Create database if it does not exist.
  const adminPool = new Pool({ ...params, database: 'postgres', connectionTimeoutMillis: 3000 });
  try {
    const { rows } = await adminPool.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME]
    );
    if (rows.length === 0) {
      console.log(`[vitest-setup] Creating database: ${TEST_DB_NAME}`);
      await adminPool.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    }
  } catch (err) {
    // Non-fatal — postgres may not be running.
    console.warn(
      `[vitest-setup] Could not ensure test DB exists (postgres may be unavailable): ${
        err instanceof Error ? err.message : err
      }`
    );
    return;
  } finally {
    await adminPool.end();
  }

  // 2. Run migrations against the test database.
  const testPool = new Pool({ ...params, database: TEST_DB_NAME, connectionTimeoutMillis: 3000 });
  try {
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.resolve(import.meta.dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rowCount } = await testPool.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rowCount && rowCount > 0) continue;

      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      try {
        await testPool.query('BEGIN');
        await testPool.query(sqlContent);
        await testPool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await testPool.query('COMMIT');
        console.log(`[vitest-setup] Applied migration: ${file}`);
      } catch (err) {
        await testPool.query('ROLLBACK').catch(() => {});
        console.warn(
          `[vitest-setup] Migration failed (non-fatal): ${file} — ${
            err instanceof Error ? err.message : err
          }`
        );
        // Stop running further migrations if one fails — schema may be inconsistent.
        break;
      }
    }
  } finally {
    await testPool.end();
  }
}
