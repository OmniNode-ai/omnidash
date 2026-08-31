import { Router } from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SqliteProjectionReader } from './sqlite-projection-reader.js';
import { PostgresProjectionReader } from './postgres-projection-reader.js';
import { loadDataSourceConfig } from './data-source-contract.js';
import {
  invokeRuntimeCommand,
  RuntimeEdgeError,
} from './runtime-skill-client.js';
import { sanitizeForLog, describeError } from './projection-utils.js';
import delegateSkillTaskTypeContract from '../shared/contracts/delegation-task-types.json';

const router = Router();

const DELEGATE_SKILL_TASK_TYPES = Object.freeze(
  delegateSkillTaskTypeContract.task_types.map((taskType) => taskType.id),
);
const DELEGATE_SKILL_TASK_TYPE_SET = new Set<string>(DELEGATE_SKILL_TASK_TYPES);

// OMN-16840: the routing authority declares which task classes it cannot
// serve — `routing_availability` in omnimarket's task_class_contracts.v1.yaml,
// mirrored into the shared task-type contract this file already reads. Admit
// on that declaration: publishing an envelope for a class no tier can execute
// only buys the caller a dispatch_timeout at the end of the full ingress
// budget, for an ONEX_CORE_041 that was knowable before dispatch.
//
// Undeclared availability is availability — the authority writes this block
// only when it knows a class is unserved, so the other classes are untouched.
// The browser half of this same reading lives in
// `shared/types/delegation-task-availability.ts`. The two cannot be one module:
// `shared/types/*` files consumed by the server belong to the composite
// `tsconfig.node.json` project and are excluded from the root project, so a
// single module cannot be typechecked by both. The contract JSON above is the
// shared authority, and `refuses exactly the classes the contract declares
// unavailable` in server/__tests__/dispatch.test.ts pins this half to it.
type RoutingAvailability = {
  status: string;
  missing_capability?: string;
  tracking?: string;
  reason?: string;
};
const DELEGATE_SKILL_UNROUTABLE_TASK_TYPES = new Map<string, RoutingAvailability>(
  delegateSkillTaskTypeContract.task_types
    .flatMap((taskType) => {
      const declared = (taskType as { routing_availability?: RoutingAvailability }).routing_availability;
      if (!declared || declared.status === 'available') return [];
      return [[taskType.id, declared] as const];
    }),
);

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

// OMN-14152 / OMN-14642 / OMN-14754: 'http' mode holds no local reader (no
// pgReader, no sqliteReader) — the projection data lives behind a separate
// projection-api HTTP service that OWNS the database (dsConfig.url). The bridge
// proxies the read verbatim (GET only) so the browser stays same-origin; it
// forwards NO writes/commands and holds NO direct DB connection or credential.
// This is the canonical re-route that keeps a pg.Pool and raw SQL out of the
// serving path (operator position 2026-07-15). Restored here after PR #255
// (multitenant auth) dropped the OMN-14152 http-proxy path.
function projectionApiBase(): string {
  const base = dsConfig.url.replace(/\/$/, '');
  if (!base) {
    throw new Error(
      'http data source requires data_source.url (the projection-api base URL); '
      + 'set it in contract.local.yaml (data_source.url) or OMNIDASH_BRIDGE_URL',
    );
  }
  return base;
}

// Forward only scalar (string / string[]) query params to the projection-api.
// Express parses repeated keys into arrays; nested/object params are dropped —
// these read endpoints take flat scalar filters only.
function buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      params.append(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') params.append(key, item);
      }
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

// Generic GET proxy to the projection-api (http mode). `path` is an absolute
// path on the projection-api origin (e.g. '/projection/<topic>' or
// '/api/projections/log-entries'); `query` is forwarded verbatim as the query
// string. GET only — the bridge never forwards writes/commands.
async function readViaHttp(path: string, query?: Record<string, unknown>): Promise<unknown> {
  const qs = query ? buildQueryString(query) : '';
  const url = `${projectionApiBase()}${path}${qs}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`http data source GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function readProjectionViaHttp(topic: string): Promise<unknown> {
  return readViaHttp(`/projection/${encodeURIComponent(topic)}`);
}

// Normalize a projection read result to a plain row array. The projection-api
// returns a projection envelope ({ topic, source, ..., rows: [...] }) in
// postgres mode; file mode returns a bare array. Either is accepted.
function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
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

  if (dsConfig.mode === 'http') {
    return readProjectionViaHttp(topic);
  }

  if (dsConfig.mode !== 'file') {
    return [];
  }

  const topicDir = resolve(FIXTURES_DIR, encodeURIComponent(topic));
  if (!topicDir.startsWith(`${FIXTURES_DIR}/`) && topicDir !== FIXTURES_DIR) {
    // OMN-17188: sanitize at the throw site too. This message is the one place
    // a raw caller-supplied topic entered an Error, making `err` itself a taint
    // carrier for every downstream `console.error(..., err)` (CodeQL #10).
    throw new Error(`Invalid projection topic path: ${sanitizeForLog(topic)}`);
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
  if (!DELEGATE_SKILL_TASK_TYPE_SET.has(taskType)) {
    res.status(400).json({
      error: 'invalid task_type',
      allowed_task_types: [...DELEGATE_SKILL_TASK_TYPES],
    });
    return;
  }
  const unroutable = DELEGATE_SKILL_UNROUTABLE_TASK_TYPES.get(taskType);
  if (unroutable) {
    res.status(409).json({
      error: 'task_type_unavailable',
      task_type: taskType,
      status: unroutable.status,
      missing_capability: unroutable.missing_capability,
      tracking: unroutable.tracking,
      reason: unroutable.reason,
      retryable: false,
    });
    return;
  }

  const correlationId = randomUUID();

  if (dsConfig.mode === 'file') {
    res.json({ correlation_id: correlationId, accepted: true, message: 'simulated (file data source)' });
    return;
  }

  const metadata: Record<string, string> = {
    requested_by: 'omnidash-ui',
    source_surface: 'delegation-control-plane',
  };
  if (req.tenant) {
    metadata.tenant_id = req.tenant.tenant_id;
    metadata.tenant_slug = req.tenant.tenant_slug;
    metadata.sub = req.tenant.sub;
  }
  const payload: Record<string, unknown> = {
    prompt,
    task_type: taskType,
    source: 'external-client',
    wait: true,
    correlation_id: correlationId,
    metadata,
  };
  if (req.tenant) payload.tenant_id = req.tenant.tenant_id;

  try {
    const result = await invokeRuntimeCommand({
      commandName: 'node_delegate_skill_orchestrator',
      payload,
      correlationId,
    });
    res.json({
      correlation_id: result.correlation_id ?? correlationId,
      accepted: true,
      completed: true,
      topic: result.command_topic,
      terminal_event: result.terminal_event,
      output_payloads: result.output_payloads ?? [],
    });
  } catch (err) {
    console.error('[routes] /api/delegation/trigger error:', err);
    const runtimeError = err instanceof RuntimeEdgeError ? err : null;
    res.status(runtimeError?.status ?? 503).json({
      error: runtimeError?.code ?? 'runtime_unavailable',
      detail: runtimeError?.message ?? String(err),
      retryable: runtimeError?.retryable ?? false,
    });
  }
});

// OMN-13131 / OMN-14974: generic renderer action ingress. The declared topic has
// no runtime consumer today, so this endpoint validates shape and fails closed.
// Action-specific routes use the contract-driven /skill runtime edge above.
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

  // The renderer-action topic has no contract-declared consumer in the current
  // runtime package set. Refuse the request instead of false-accepting a record
  // that no workflow can process. Action-specific routes below use /skill.
  res.status(503).json({
    error: 'renderer_action_dispatcher_unavailable',
    detail: 'No contract-declared runtime handler consumes renderer actions',
  });
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

  if (dsConfig.mode === 'file') {
    res.json({
      correlation_id: correlationId,
      accepted: true,
      message: 'simulated (file data source)',
    });
    return;
  }

  try {
    const result = await invokeRuntimeCommand({
      commandName: 'node_generation_consumer',
      payload: {
        task_description: taskDescription,
        correlation_id: correlationId,
      },
      correlationId,
    });
    res.json({
      correlation_id: result.correlation_id ?? correlationId,
      accepted: true,
      completed: true,
      topic: result.command_topic,
      terminal_event: result.terminal_event,
      output_payloads: result.output_payloads ?? [],
    });
  } catch (err) {
    console.error('[routes] /api/sea/generate error:', err);
    const runtimeError = err instanceof RuntimeEdgeError ? err : null;
    res.status(runtimeError?.status ?? 503).json({
      error: runtimeError?.code ?? 'runtime_unavailable',
      detail: runtimeError?.message ?? String(err),
      retryable: runtimeError?.retryable ?? false,
    });
  }
});

// Swarm runs: newest-first list from the swarm_runs projection topic.
// OMN-14754: routed through the mode-agnostic readProjection() — the SAME
// pg/sqlite/http/file seam the primary /projection/:topic read uses — so the
// deployed http default proxies to the projection-api instead of 503-ing on the
// null pgReader. extractRows() unwraps the projection envelope ({...,rows}) that
// postgres/http modes return and the bare array that file mode returns.
router.get('/api/swarm-runs', async (_req, res) => {
  try {
    const result = await readProjection('onex.snapshot.projection.swarm.runs.v1');
    res.json({ rows: extractRows(result) });
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
    // OMN-17188 (CodeQL #10 js/log-injection): the format string here was
    // already constant, but `err` is the taint carrier -- errors raised below
    // this layer can embed the caller-supplied topic in their message. Render
    // the error through a single-line, control-character-stripped projection
    // rather than handing the raw object to console.error.
    console.error('[routes] /projection/:topic error:', describeError(err));
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

// OMN-12133: projection query endpoints for log entries and traces — these are
// parametrized queries (filters + aggregation), not plain topic snapshots, so
// they have no /projection/:topic equivalent.
// OMN-14754: in postgres mode the local pgReader answers them (this is what the
// projection-api service itself runs). In the deployed http default the bridge
// holds no pgReader, so it proxies the read verbatim to the projection-api's
// same query endpoints (GET only). file/sqlite modes have no query backend and
// still 503.

router.get('/api/projections/log-entries', async (req, res) => {
  if (pgReader) {
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
    return;
  }
  if (dsConfig.mode === 'http') {
    try {
      res.json(await readViaHttp('/api/projections/log-entries', req.query));
    } catch (err) {
      console.error('[routes] /api/projections/log-entries error:', err);
      res.status(500).json({ error: 'log entries query failed' });
    }
    return;
  }
  res.status(503).json({ error: 'postgres data source not configured' });
});

router.get('/api/projections/traces', async (req, res) => {
  if (pgReader) {
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
    return;
  }
  if (dsConfig.mode === 'http') {
    try {
      res.json(await readViaHttp('/api/projections/traces', req.query));
    } catch (err) {
      console.error('[routes] /api/projections/traces error:', err);
      res.status(500).json({ error: 'traces query failed' });
    }
    return;
  }
  res.status(503).json({ error: 'postgres data source not configured' });
});

// OMN-12809: /api/dispatch removed — was the generic router-hop anti-pattern.
// Callers (DispatchButton, CommandPalette) now use /api/renderer/emit directly.
export default router;
