import { Router } from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
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

// Correlation trace: returns all delegation_events rows for a given correlation_id.
// Used by DelegationCorrelationTracePanel to render the full per-event chain.
router.get('/api/delegation/correlation-trace/:correlationId', async (req, res) => {
  const { correlationId } = req.params;
  if (!pgReader) {
    res.status(503).json({ error: 'postgres data source not configured' });
    return;
  }
  try {
    const rows = await pgReader.readCorrelationTrace(correlationId);
    res.json({ correlation_id: correlationId, rows });
  } catch (err) {
    console.error('[routes] /api/delegation/correlation-trace/:correlationId error:', err);
    res.status(500).json({ error: 'correlation trace read failed' });
  }
});

// Delegation trigger: publish a delegation command to the ONEX runtime.
// Forwards to OMNIDASH_RUNTIME_EFFECTS_URL when set; otherwise returns
// a simulated accepted response so the UI can be tested without infra.
router.post('/api/delegation/trigger', async (req, res) => {
  const body = req.body as { prompt?: unknown; task_type?: unknown };
  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 4096) : '';
  const taskType = typeof body.task_type === 'string' ? body.task_type.slice(0, 128) : 'general';
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  const correlationId = randomUUID();
  const runtimeUrl = process.env.OMNIDASH_RUNTIME_EFFECTS_URL;

  if (!runtimeUrl) {
    // No runtime configured — return an accepted response so the UI works
    // in dev/file mode. The correlation_id can be searched in the trace view
    // once real events are materialized.
    res.json({ correlation_id: correlationId, accepted: true, message: 'simulated (no OMNIDASH_RUNTIME_EFFECTS_URL set)' });
    return;
  }

  try {
    const upstream = await fetch(`${runtimeUrl}/v1/effects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'onex.cmd.omnimarket.delegate-skill.v1',
        correlation_id: correlationId,
        payload: { prompt, task_type: taskType, source: 'delegation-dashboard' },
      }),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      res.status(502).json({ error: `runtime returned ${upstream.status}`, detail: text });
      return;
    }
    res.json({ correlation_id: correlationId, accepted: true });
  } catch (err) {
    console.error('[routes] /api/delegation/trigger error:', err);
    res.status(503).json({ error: 'runtime unreachable', detail: String(err) });
  }
});

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

// Feature flag patterns: env vars whose names begin with these prefixes
// are considered ONEX feature flags visible in the dashboard.
const FLAG_PREFIXES = ['ENABLE_', 'USE_', 'ENFORCEMENT_'];

// Migration flags that control gradual rollout paths rather than on/off toggles.
const MIGRATION_FLAGS = new Set([
  'ARCHON_ENABLE_EXTERNAL_GATEWAY',
  'OMNIDASH_READ_MODEL_USE_CATALOG',
  'DUAL_PUBLISH_LEGACY_TOPICS',
]);

const OMNIDASH_FLAG_DESCRIPTIONS: Record<string, string> = {
  ENABLE_EVENT_INTELLIGENCE: 'Enables event intelligence processing pipeline',
  ENABLE_KAFKA_LOGGING: 'Routes structured logs through Kafka',
  ENABLE_REAL_TIME_EVENTS: 'Opens WebSocket channel for live event stream',
  ENABLE_PATTERN_ENFORCEMENT: 'Enforces pattern quality filters on incoming events',
  ENABLE_EVENT_PRELOAD: 'Pre-fetches events on dashboard mount',
  ENABLE_RESPONSE_CACHE: 'Enables response-level projection cache',
  ARCHON_ENABLE_EXTERNAL_GATEWAY: 'Routes inference through external Archon gateway',
  VITE_USE_MOCK_DATA: 'Forces fixture data in place of live projections',
  OMNIDASH_READ_MODEL_USE_CATALOG: 'Switches read model to catalog-based source',
};

const OMNICLAUDE_FLAG_DESCRIPTIONS: Record<string, string> = {
  ENABLE_POSTGRES: 'Enables Postgres-backed session and pattern storage',
  ENABLE_QDRANT: 'Enables Qdrant vector store for semantic pattern retrieval',
  ENABLE_INTELLIGENCE_CACHE: 'Caches intelligence node results to reduce LLM calls',
  USE_EVENT_ROUTING: 'Routes commands/events through the ONEX event bus',
  DUAL_PUBLISH_LEGACY_TOPICS: 'Publishes to both new and legacy topic names during migration',
  USE_ONEX_ROUTING_NODES: 'Routes LLM calls through ONEX routing node graph',
  ENABLE_PATTERN_QUALITY_FILTER: 'Filters patterns below quality threshold before storage',
  ENABLE_DISABLED_PATTERN_FILTER: 'Excludes disabled patterns from retrieval results',
  ENABLE_PHASE_1_VALIDATION: 'Phase 1 validation gate: structural contract checks',
  ENABLE_PHASE_2_SEMANTIC: 'Phase 2 validation gate: semantic consistency checks',
  ENABLE_PHASE_3_INTEGRATION: 'Phase 3 validation gate: cross-service integration checks',
  ENABLE_PHASE_4_AI_QUORUM: 'Phase 4 validation gate: multi-model AI quorum review',
  ENABLE_LOCAL_INFERENCE_PIPELINE: 'Routes inference to local GPU endpoints first',
  ENABLE_PATTERN_ENFORCEMENT: 'Enforces pattern schema and lifecycle rules',
  USE_LLM_ROUTING: 'Enables dynamic LLM routing via contract model_routing config',
};

const KNOWN_OMNIDASH_FLAGS = Object.keys(OMNIDASH_FLAG_DESCRIPTIONS);
const KNOWN_OMNICLAUDE_FLAGS = Object.keys(OMNICLAUDE_FLAG_DESCRIPTIONS);

interface FeatureFlagEntry {
  name: string;
  value: string | null;
  state: 'on' | 'off' | 'migration';
  service: 'omniclaude' | 'omnidash';
  description: string;
}

function resolveState(value: string | null, name: string): 'on' | 'off' | 'migration' {
  if (MIGRATION_FLAGS.has(name)) return 'migration';
  if (value === null || value === '' || value === '0' || value.toLowerCase() === 'false') return 'off';
  return 'on';
}

function isFeatureFlag(name: string): boolean {
  return FLAG_PREFIXES.some((p) => name.startsWith(p));
}

router.get('/api/settings/feature-flags', (_req, res) => {
  const env = process.env;

  // Collect omnidash flags: known list + any matching env vars not already listed.
  const omnidashNames = new Set(KNOWN_OMNIDASH_FLAGS);
  for (const key of Object.keys(env)) {
    if (isFeatureFlag(key)) omnidashNames.add(key);
  }

  const omnidashFlags: FeatureFlagEntry[] = [...omnidashNames].map((name) => ({
    name,
    value: env[name] ?? null,
    state: resolveState(env[name] ?? null, name),
    service: 'omnidash',
    description: OMNIDASH_FLAG_DESCRIPTIONS[name] ?? '',
  }));

  // omniclaude flags: known list only (their env vars are on a separate service).
  const omniclaudeFlags: FeatureFlagEntry[] = KNOWN_OMNICLAUDE_FLAGS.map((name) => ({
    name,
    value: env[name] ?? null,
    state: resolveState(env[name] ?? null, name),
    service: 'omniclaude',
    description: OMNICLAUDE_FLAG_DESCRIPTIONS[name] ?? '',
  }));

  res.json({
    flags: [...omnidashFlags, ...omniclaudeFlags],
    fetchedAt: new Date().toISOString(),
  });
});

// OMN-12133: projection query endpoints for log entries and traces.
// Both require postgres mode with OMNIDASH_ANALYTICS_DB_URL set.

router.get('/api/projections/log-entries', async (req, res) => {
  if (!pgReader) {
    res.status(503).json({ error: 'postgres data source not configured' });
    return;
  }
  try {
    const limit = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : 100;
    const entries = await pgReader.queryLogEntries({
      correlation_id: req.query.correlation_id ? String(req.query.correlation_id) : undefined,
      node_name: req.query.node_name ? String(req.query.node_name) : undefined,
      level: req.query.level ? String(req.query.level) : undefined,
      since: req.query.since ? String(req.query.since) : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
    });
    res.json(entries);
  } catch (err) {
    console.error('[routes] /api/projections/log-entries error:', err);
    res.status(500).json({ error: 'log entries query failed' });
  }
});

router.get('/api/projections/traces', async (req, res) => {
  if (!pgReader) {
    res.status(503).json({ error: 'postgres data source not configured' });
    return;
  }
  try {
    const limit = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : 50;
    const running_only = req.query.running_only === 'true' || req.query.running_only === '1';
    const traces = await pgReader.queryTraces({
      since: req.query.since ? String(req.query.since) : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
      running_only,
    });
    res.json(traces);
  } catch (err) {
    console.error('[routes] /api/projections/traces error:', err);
    res.status(500).json({ error: 'traces query failed' });
  }
});

export default router;
