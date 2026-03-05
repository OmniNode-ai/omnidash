/* eslint-disable no-console */
/**
 * Migration Parity CLI (OMN-3747).
 *
 * Compares SQL migration files on disk with the schema_migrations tracking
 * table in the omnidash_analytics database. Exits 0 when both sides agree,
 * exits 1 when there is a mismatch.
 *
 * Usage:
 *   npx tsx scripts/check-migration-parity.ts
 *   # or via npm script:
 *   npm run db:check-parity
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
  if (process.env.OMNIDASH_ANALYTICS_DB_URL) {
    return process.env.OMNIDASH_ANALYTICS_DB_URL;
  }
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
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
  const safeUrl = connectionString.replace(/:([^@]+)@/, ':****@');

  const pool = new Pool({ connectionString });

  try {
    // 1. Read all .sql filenames from migrations/ directory, sorted lexicographically
    const scriptDir = import.meta.dirname;
    const migrationsDir = path.resolve(scriptDir, '..', 'migrations');
    const filesOnDisk = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    // 2. Query schema_migrations for tracked filenames
    const result = await pool.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const filesInDb = result.rows.map((r) => r.filename);

    // 3. Compute diff
    const diskSet = new Set(filesOnDisk);
    const dbSet = new Set(filesInDb);

    const missingInDb = filesOnDisk.filter((f) => !dbSet.has(f));
    const missingOnDisk = filesInDb.filter((f) => !diskSet.has(f));

    // 4. Report
    console.log(`[parity] Database: ${safeUrl}`);
    console.log(`[parity] Files on disk: ${filesOnDisk.length}`);
    console.log(`[parity] Files in DB:   ${filesInDb.length}`);

    if (missingInDb.length === 0 && missingOnDisk.length === 0) {
      console.log('[parity] OK: migration state is in parity.');
      process.exit(0);
    }

    console.log('');
    if (missingInDb.length > 0) {
      console.log('[parity] MISMATCH: migrations on disk but NOT in schema_migrations:');
      for (const f of missingInDb) {
        console.log(`  - ${f}`);
      }
    }

    if (missingOnDisk.length > 0) {
      console.log('[parity] MISMATCH: migrations in schema_migrations but NOT on disk:');
      for (const f of missingOnDisk) {
        console.log(`  - ${f}`);
      }
    }

    console.log('');
    console.log('[parity] FAILED: migration state is NOT in parity.');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[parity] Fatal error:', err);
  process.exit(1);
});
