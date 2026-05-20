import { Router } from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SqliteProjectionReader } from './sqlite-projection-reader.js';
import { PostgresProjectionReader } from './postgres-projection-reader.js';
import { loadDataSourceConfig } from './data-source-contract.js';

const router = Router();

const FIXTURES_DIR = resolve(process.env.VITE_FIXTURES_DIR ?? process.env.FIXTURES_DIR ?? './fixtures');

// OMN-10756: data source mode and SQLite DB path now come from contract.yaml
// defaults via loadDataSourceConfig(). OMNIDASH_DATA_SOURCE and
// OMNIDASH_SQLITE_DB_PATH are optional env overrides — not required.
const dsConfig = loadDataSourceConfig();

const sqliteReader = dsConfig.mode === 'sqlite'
  ? new SqliteProjectionReader({ dbPath: dsConfig.sqliteDbPath })
  : null;

// Only instantiate when mode=postgres AND a connection string is available.
const pgReader = (dsConfig.mode === 'postgres' && process.env.OMNIDASH_ANALYTICS_DB_URL)
  ? new PostgresProjectionReader({ connectionString: process.env.OMNIDASH_ANALYTICS_DB_URL })
  : null;

async function readJson(path: string): Promise<unknown> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as unknown;
}

async function readProjection(topic: string): Promise<unknown> {
  if (pgReader) {
    return pgReader.readProjection(topic);
  }

  if (sqliteReader) {
    return sqliteReader.readProjection(topic);
  }

  if (dsConfig.mode === 'postgres') {
    throw new Error('OMNIDASH_ANALYTICS_DB_URL is required for postgres data source; refusing fixture fallback');
  }

  if (dsConfig.mode !== 'file') {
    return [];
  }

  const topicDir = resolve(FIXTURES_DIR, encodeURIComponent(topic));
  if (!topicDir.startsWith(`${FIXTURES_DIR}/`) && topicDir !== FIXTURES_DIR) {
    throw new Error(`Invalid projection topic path: ${topic}`);
  }

  let files: unknown;
  try {
    files = await readJson(resolve(topicDir, 'index.json'));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      files = (await readdir(topicDir))
        .filter((filename) => filename.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b));
    } catch (dirError: unknown) {
      if ((dirError as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw dirError;
    }
  }

  if (!Array.isArray(files)) return [];

  const records: unknown[] = [];
  for (const filename of files) {
    if (typeof filename !== 'string') continue;
    const snapshotPath = resolve(topicDir, filename);
    if (!snapshotPath.startsWith(`${topicDir}/`) ) continue;
    try {
      records.push(await readJson(snapshotPath));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return records;
}

// HTTP adapter for src/data-source/http-snapshot-source.ts. Dashboard-v2 reads
// projection-topic snapshots; it must not query Postgres directly.
router.get('/projection/:topic', async (req, res) => {
  try {
    res.json(await readProjection(req.params.topic));
  } catch (err) {
    console.error('[routes] /projection/:topic error:', err);
    res.status(500).json({ error: 'projection read failed' });
  }
});

export default router;
