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

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      console.log(`[migrate] Running: ${file}`);
      try {
        await pool.query(sqlContent);
        console.log(`[migrate] OK: ${file}`);
      } catch (err) {
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
