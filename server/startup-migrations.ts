// no-migration: startup wiring only, no schema change
/**
 * Startup Migrations (OMN-8643)
 *
 * Runs all pending SQL migrations against omnidash_analytics at server startup.
 * Idempotent: already-applied migrations are skipped via schema_migrations table.
 *
 * Called once before the server begins accepting requests so that every deploy
 * automatically applies any migrations that are on disk but not yet in the DB.
 * No manual `npm run db:migrate` step is needed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getConnectionString(): Promise<string | null> {
  if (process.env.OMNIDASH_ANALYTICS_DB_URL) return process.env.OMNIDASH_ANALYTICS_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD } =
    process.env;
  if (POSTGRES_HOST && POSTGRES_PORT && POSTGRES_DATABASE && POSTGRES_USER && POSTGRES_PASSWORD) {
    const url = new URL(
      `postgresql://${POSTGRES_HOST}:${POSTGRES_PORT}/${encodeURIComponent(POSTGRES_DATABASE)}`
    );
    url.username = POSTGRES_USER;
    url.password = POSTGRES_PASSWORD;
    return url.toString();
  }
  return null;
}

/**
 * Apply all pending migrations from migrations/ to omnidash_analytics.
 * Logs progress to stdout. Non-fatal if DB is unavailable — warns and returns.
 */
export async function runStartupMigrations(): Promise<void> {
  const connectionString = await getConnectionString();
  if (!connectionString) {
    console.warn(
      '[startup-migrations] No DB connection string configured — skipping auto-migration'
    );
    return;
  }

  const safeUrl = connectionString.replace(/:([^@]+)@/, ':****@');
  console.log(`[startup-migrations] Connecting to: ${safeUrl}`);

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });

  try {
    await pool.query('SELECT 1');
    console.log('[startup-migrations] Connected successfully');
  } catch (err) {
    console.warn(
      '[startup-migrations] DB not reachable — skipping auto-migration:',
      err instanceof Error ? err.message : err
    );
    await pool.end().catch(() => {});
    return;
  }

  try {
    // Bootstrap tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.resolve(__dirname, '..', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.warn('[startup-migrations] migrations/ directory not found — skipping');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`[startup-migrations] Found ${files.length} migration files`);
    let applied = 0;

    for (const file of files) {
      const { rowCount } = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [
        file,
      ]);
      if (rowCount && rowCount > 0) continue;

      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`[startup-migrations] Applying: ${file}`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sqlContent);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[startup-migrations] OK: ${file}`);
        applied++;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(
          `[startup-migrations] FAILED: ${file}`,
          err instanceof Error ? err.message : err
        );
        throw err;
      } finally {
        client.release();
      }
    }

    if (applied === 0) {
      console.log('[startup-migrations] Schema is up to date — no migrations needed');
    } else {
      console.log(`[startup-migrations] Applied ${applied} migration(s) successfully`);
    }
  } finally {
    await pool.end();
  }
}
