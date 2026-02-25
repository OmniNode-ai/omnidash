/* eslint-disable no-console */
/**
 * Run omnidash_analytics read-model migrations (OMN-2061).
 *
 * Executes SQL migration files from migrations/ directory against
 * the omnidash_analytics database. Migrations are idempotent
 * (all use IF NOT EXISTS).
 *
 * Usage:
 *   npm run db:migrate
 *   # or directly:
 *   tsx scripts/run-migrations.ts
 *
 * Environment:
 *   OMNIDASH_ANALYTICS_DB_URL or DATABASE_URL or POSTGRES_* vars
 */

import { config } from 'dotenv';
config();

import fs from 'node:fs';
import path from 'node:path';
import pkg from 'pg';
const { Pool } = pkg;

async function getConnectionString(): Promise<string> {
  // Priority 1: OMNIDASH_ANALYTICS_DB_URL
  if (process.env.OMNIDASH_ANALYTICS_DB_URL) {
    return process.env.OMNIDASH_ANALYTICS_DB_URL;
  }

  // Priority 2: DATABASE_URL
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Priority 3: Individual vars
  const { POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD } =
    process.env;

  if (
    !POSTGRES_HOST ||
    !POSTGRES_PORT ||
    !POSTGRES_DATABASE ||
    !POSTGRES_USER ||
    !POSTGRES_PASSWORD
  ) {
    throw new Error(
      'Database not configured. Set OMNIDASH_ANALYTICS_DB_URL, DATABASE_URL, or individual POSTGRES_* vars.'
    );
  }

  return `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}`;
}

async function main(): Promise<void> {
  const connectionString = await getConnectionString();

  // Mask password in log output
  const safeUrl = connectionString.replace(/:([^@]+)@/, ':****@');
  console.log(`[migrate] Connecting to: ${safeUrl}`);

  const pool = new Pool({ connectionString });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('[migrate] Connected successfully');
    client.release();

    // Read and execute migration files in order
    const scriptDir = import.meta.dirname;
    const migrationsDir = path.resolve(scriptDir, '..', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    console.log(`[migrate] Found ${files.length} migration files`);

    // Bootstrap migration tracking table outside any file transaction.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[migrate] schema_migrations tracking table ready');

    for (const file of files) {
      // Check if this migration has already been applied.
      const { rowCount } = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [
        file,
      ]);
      if (rowCount && rowCount > 0) {
        console.log(`[migrate] Skipping (already applied): ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      console.log(`[migrate] Running: ${file}`);
      // Known limitation: Each migration file is wrapped in a transaction.
      // CREATE EXTENSION cannot run inside a transaction on some PostgreSQL
      // configurations (e.g., Amazon RDS, Azure). If a migration containing
      // CREATE EXTENSION fails, it may need to be run outside of a transaction
      // or the extension must be pre-installed by a superuser.
      try {
        await pool.query('BEGIN');
        await pool.query(sqlContent);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`[migrate] OK: ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK').catch(() => {
          // ROLLBACK itself may fail if connection is broken; ignore.
        });
        console.error(`[migrate] FAILED: ${file}`, err instanceof Error ? err.message : err);
        throw err;
      }
    }

    console.log('[migrate] All migrations completed successfully');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
