import { Router } from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SqliteProjectionReader } from './sqlite-projection-reader.js';
import { PostgresProjectionReader } from './postgres-projection-reader.js';
import { loadDataSourceConfig } from './data-source-contract.js';
import { isProducerConnected, publishMessage } from './kafka-producer.js';
import { COMMAND_TOPICS } from '../shared/types/command-topics.js';
import {
  emitRendererCommand,
  RendererEmitterError,
  type RendererCommandInput,
} from './renderer-command-emitter.js';

const router = Router();

const SEA_NODE_GENERATION_EVENT_TYPE = 'omnimarket.node-generation-requested';
const DELEGATE_SKILL_EVENT_TYPE = 'omnimarket.delegate-skill';
const DELEGATE_SKILL_TASK_TYPES = new Set([
  'test',
  'document',
  'research',
  'code_generation',
  'code_review',
  'refactor',
  'reasoning',
  'complex_reasoning',
  'planning',
  'review',
  'summarization',
  'agent_delegation',
  'escalation',
]);

const EVIDENCE_PIPELINE_TOPICS = {
  stages: 'onex.snapshot.projection.evidence_pipeline.stages.v1',
  correlations: 'onex.snapshot.projection.evidence_pipeline.correlations.v1',
  readiness: 'onex.snapshot.projection.evidence_pipeline.readiness.v1',
  live_events: 'onex.snapshot.projection.evidence_pipeline.live_events.v1',
} as const;

const FIXTURES_DIR = resolve(process.env.VITE_FIXTURES_DIR ?? process.env.FIXTURES_DIR ?? './fixtures');

// OMN-10756: data source mode and SQLite DB path now come from contract.yaml
// defaults via loadDataSourceConfig(). OMNIDASH_DATA_SOURCE and
// OMNIDASH_SQLITE_DB_PATH are optional env overrides — not required.
const dsConfig = loadDataSourceConfig();

const sqliteReader = dsConfig.mode === 'sqlite'
  ? new SqliteProjectionReader({ dbPath: dsConfig.sqliteDbPath })
  : null;

// Only instantiate when mode=postgres AND the contract/overlay resolves the
// Postgres connection secret. The route layer must not name env vars directly.
const pgReader = (dsConfig.mode === 'postgres' && dsConfig.postgresDatabaseUrl)
  ? new PostgresProjectionReader({ connectionString: dsConfig.postgresDatabaseUrl })
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
    throw new Error(
      'data_source.postgres_database_url_secret_ref must resolve for postgres mode; refusing fixture fallback',
    );
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

// OMN-12822 (A2): the bespoke `GET /api/delegation/correlation-trace/:id`
// read route is RETIRED. Per OMN-12748, DelegationCorrelationTracePanel reads
// the per-correlation trace through the canonical projection API
// (`/projection/{topic}?correlation_id=<id>`, see fetchCorrelationTrace in
// src/services/delegation-api.ts). The dashboard renders the projection; it
// does not call a hand-written backend endpoint. No bespoke read route remains.

// Delegation trigger: publish the contract-declared delegate-skill command
// envelope consumed by the ONEX runtime.
router.post('/api/delegation/trigger', async (req, res) => {
  const body = req.body as { prompt?: unknown; task_type?: unknown };
  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 4096) : '';
  const taskType = typeof body.task_type === 'string' ? body.task_type.slice(0, 128) : 'reasoning';
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  if (!DELEGATE_SKILL_TASK_TYPES.has(taskType)) {
    res.status(400).json({
      error: 'invalid task_type',
      allowed_task_types: [...DELEGATE_SKILL_TASK_TYPES],
    });
    return;
  }

  const correlationId = randomUUID();

  if (!isProducerConnected()) {
    if (dsConfig.mode === 'file') {
      res.json({ correlation_id: correlationId, accepted: true, message: 'simulated (file data source)' });
      return;
    }
    res.status(503).json({ error: 'kafka_unavailable' });
    return;
  }

  const requestedAt = new Date().toISOString();
  const tenant = req.tenant!;
  const envelope = {
    payload: {
      prompt,
      task_type: taskType,
      source: 'codex',
      wait: true,
      correlation_id: correlationId,
      metadata: {
        requested_by: 'omnidash-ui',
        source_surface: 'delegation-control-plane',
        tenant_id: tenant.tenant_id,
        tenant_slug: tenant.tenant_slug,
        sub: tenant.sub,
      },
    },
    envelope_id: randomUUID(),
    envelope_timestamp: requestedAt,
    correlation_id: correlationId,
    source_tool: 'omnidash-ui',
    tenant_id: tenant.tenant_id,
    tenant_slug: tenant.tenant_slug,
    tenant_sub: tenant.sub,
    event_type: DELEGATE_SKILL_EVENT_TYPE,
    priority: 5,
    retry_count: 0,
  };

  try {
    await publishMessage(COMMAND_TOPICS.delegateSkill, envelope);
    res.json({ correlation_id: correlationId, accepted: true, topic: COMMAND_TOPICS.delegateSkill });
  } catch (err) {
    console.error('[routes] /api/delegation/trigger error:', err);
    res.status(503).json({ error: 'kafka_unavailable', detail: String(err) });
  }
});

// OMN-13131 (W2): renderer bus-native command emit path. Every UI action is
// emitted as a canonical onex.cmd.* command envelope onto the bus through the
// thin producer in renderer-command-emitter.ts. This route is the bus-native
// emit path that runs ALONGSIDE the action-specific routes (e.g.
// /api/delegation/trigger). It is transport-only: it builds the identity-bearing
// envelope and publishes verbatim to the single declared topic. It does NOT
// choose a workflow, rewrite intent, or dispatch on action type — the
// capability-driven dispatcher (W4) owns routing.
router.post('/api/renderer/emit', async (req, res) => {
  const body = req.body as {
    renderer_id?: unknown;
    action_contract_id?: unknown;
    contract_version?: unknown;
    correlation_id?: unknown;
    causation_id?: unknown;
    payload?: unknown;
  };

  // Shape validation only — no inspection of payload contents for routing.
  if (typeof body.renderer_id !== 'string' || !body.renderer_id) {
    res.status(400).json({ error: 'renderer_id is required' });
    return;
  }
  if (typeof body.action_contract_id !== 'string' || !body.action_contract_id) {
    res.status(400).json({ error: 'action_contract_id is required' });
    return;
  }
  if (typeof body.contract_version !== 'string' || !body.contract_version) {
    res.status(400).json({ error: 'contract_version is required' });
    return;
  }
  if (
    body.payload === undefined ||
    body.payload === null ||
    typeof body.payload !== 'object' ||
    Array.isArray(body.payload)
  ) {
    res.status(400).json({ error: 'payload is required and must be an object' });
    return;
  }

  const input: RendererCommandInput = {
    rendererId: body.renderer_id,
    actionContractId: body.action_contract_id,
    contractVersion: body.contract_version,
    payload: body.payload as Record<string, unknown>,
    tenantContext: req.tenant
      ? { tenant_id: req.tenant.tenant_id, tenant_slug: req.tenant.tenant_slug, sub: req.tenant.sub }
      : undefined,
  };
  if (typeof body.correlation_id === 'string') {
    input.correlationId = body.correlation_id;
  }
  if (typeof body.causation_id === 'string') {
    input.causationId = body.causation_id;
  }

  if (!isProducerConnected()) {
    res.status(503).json({ error: 'kafka_unavailable' });
    return;
  }

  try {
    const envelope = await emitRendererCommand(input);
    res.json({
      accepted: true,
      correlation_id: envelope.correlation_id,
      causation_id: envelope.causation_id,
      envelope_id: envelope.envelope_id,
      topic: envelope.transport.topic,
    });
  } catch (err) {
    if (err instanceof RendererEmitterError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('[routes] /api/renderer/emit error:', err);
    res.status(503).json({ error: 'kafka_unavailable', detail: String(err) });
  }
});

// OMN-12775: SEA generation trigger — thin publisher for node_generation_consumer.
// Publishes the canonical node-generation-requested command envelope; no business logic.
// Envelope shape mirrors node_generation_consumer contract.yaml inputs:
//   payload.task_description (str, required), payload.correlation_id (uuid, required).
router.post('/api/sea/generate', async (req, res) => {
  const body = req.body as { task_description?: unknown };
  const taskDescription =
    typeof body.task_description === 'string' ? body.task_description.slice(0, 4096) : '';
  if (!taskDescription) {
    res.status(400).json({ error: 'task_description is required' });
    return;
  }

  const correlationId = randomUUID();

  if (!isProducerConnected()) {
    if (dsConfig.mode === 'file') {
      res.json({
        correlation_id: correlationId,
        accepted: true,
        message: 'simulated (file data source)',
      });
      return;
    }
    res.status(503).json({ error: 'kafka_unavailable' });
    return;
  }

  const requestedAt = new Date().toISOString();
  const seaTenant = req.tenant!;
  const envelope = {
    payload: {
      task_description: taskDescription,
      correlation_id: correlationId,
    },
    envelope_id: randomUUID(),
    envelope_timestamp: requestedAt,
    correlation_id: correlationId,
    source_tool: 'omnidash-ui',
    tenant_id: seaTenant.tenant_id,
    tenant_slug: seaTenant.tenant_slug,
    tenant_sub: seaTenant.sub,
    event_type: SEA_NODE_GENERATION_EVENT_TYPE,
    priority: 5,
    retry_count: 0,
  };

  try {
    await publishMessage(COMMAND_TOPICS.nodeGenerationRequested, envelope);
    res.json({
      correlation_id: correlationId,
      accepted: true,
      topic: COMMAND_TOPICS.nodeGenerationRequested,
    });
  } catch (err) {
    console.error('[routes] /api/sea/generate error:', err);
    res.status(503).json({ error: 'kafka_unavailable', detail: String(err) });
  }
});

// Swarm runs: paginated list from swarm_runs table, newest first.
router.get('/api/swarm-runs', async (req, res) => {
  if (!pgReader) {
    res.status(503).json({ error: 'postgres data source not configured' });
    return;
  }
  try {
    const rows = await pgReader.readProjection('onex.snapshot.projection.swarm.runs.v1');
    res.json({ rows: rows.rows });
  } catch (err) {
    console.error('[routes] /api/swarm-runs error:', err);
    res.status(500).json({ error: 'swarm runs read failed' });
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

router.get('/api/runtime-config', (_req, res) => {
  res.json({
    data_source: {
      mode: dsConfig.mode,
      url: dsConfig.url,
      ws_url: dsConfig.wsUrl,
      postgres_database_url_secret_ref: dsConfig.postgresDatabaseUrlSecretRef,
      postgres_database_url_configured: dsConfig.postgresDatabaseUrl !== null,
    },
    projection_api: {
      base_path: '/projection',
      evidence_pipeline_topics: EVIDENCE_PIPELINE_TOPICS,
    },
  });
});

// OMN-12133: projection query endpoints for log entries and traces.
// Both require postgres mode with a contract/overlay-resolved database secret.

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

// OMN-12809: /api/dispatch removed — was the generic router-hop anti-pattern.
// Callers (DispatchButton, CommandPalette) now use /api/renderer/emit directly.
export default router;
