import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';

async function loadRoutes() {
  vi.resetModules();
  const mod = await import('./routes.js');
  return mod.default;
}

function buildApp(routes: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(routes);
  return app;
}

describe('server projection routes', () => {
  let fixturesDir: string;

  beforeEach(async () => {
    fixturesDir = await mkdtemp(join(tmpdir(), 'omnidash-projections-'));
    process.env.FIXTURES_DIR = fixturesDir;
    process.env.OMNIDASH_DATA_SOURCE = 'file';
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  afterEach(async () => {
    delete process.env.FIXTURES_DIR;
    delete process.env.OMNIDASH_DATA_SOURCE;
    await rm(fixturesDir, { recursive: true, force: true });
  });

  it('GET /projection/:topic returns projection records from fixture snapshots', async () => {
    const topic = 'onex.snapshot.projection.llm_cost.v1';
    const topicDir = join(fixturesDir, encodeURIComponent(topic));
    await mkdir(topicDir, { recursive: true });
    await writeFile(join(topicDir, 'index.json'), JSON.stringify(['a.json', 'b.json']));
    await writeFile(join(topicDir, 'a.json'), JSON.stringify({ entity_id: 'a', total_cost_usd: '1.00' }));
    await writeFile(join(topicDir, 'b.json'), JSON.stringify({ entity_id: 'b', total_cost_usd: '2.00' }));

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(`/projection/${encodeURIComponent(topic)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { entity_id: 'a', total_cost_usd: '1.00' },
      { entity_id: 'b', total_cost_usd: '2.00' },
    ]);
  });

  it('GET /projection/:topic returns [] when a projection topic is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/projection/onex.snapshot.projection.missing.v1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('server import does not require a resolved postgres database secret', async () => {
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;

    await expect(import('./index.js')).resolves.toBeTruthy();
  });

  it('does not fall back to fixtures when postgres mode lacks a connection URL', async () => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const topic = 'onex.snapshot.projection.llm_cost.v1';
    const topicDir = join(fixturesDir, encodeURIComponent(topic));
    await mkdir(topicDir, { recursive: true });
    await writeFile(join(topicDir, 'index.json'), JSON.stringify(['stub.json']));
    await writeFile(join(topicDir, 'stub.json'), JSON.stringify({ entity_id: 'stub', total_cost_usd: '99.00' }));

    try {
      const routes = await loadRoutes();
      const res = await request(buildApp(routes)).get(`/projection/${encodeURIComponent(topic)}`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'projection read failed' });
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('GET /api/runtime-config', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'file';
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  it('reports projection API authority and DB secret-ref status without leaking secrets', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/runtime-config');

    expect(res.status).toBe(200);
    expect(res.body.data_source.mode).toBe('file');
    expect(res.body.data_source.postgres_database_url_configured).toBe(false);
    expect(res.body.data_source).not.toHaveProperty('postgres_database_url');
    expect(res.body.projection_api.base_path).toBe('/projection');
    expect(res.body.projection_api.evidence_pipeline_topics.stages).toBe(
      'onex.snapshot.projection.evidence_pipeline.stages.v1',
    );
  });
});

// OMN-10305: API surface proof for cost-trend cluster topics.
// Each test seeds the fixture dir from the populated plan fixtures and
// asserts exact field values — HTTP 200 alone is insufficient (R9).
describe('server projection routes — cost-trend cluster (OMN-10305)', () => {
  let fixturesDir: string;

  beforeEach(async () => {
    fixturesDir = await mkdtemp(join(tmpdir(), 'omnidash-cost-projections-'));
    process.env.FIXTURES_DIR = fixturesDir;
    process.env.OMNIDASH_DATA_SOURCE = 'file';
  });

  afterEach(async () => {
    delete process.env.FIXTURES_DIR;
    delete process.env.OMNIDASH_DATA_SOURCE;
    await rm(fixturesDir, { recursive: true, force: true });
  });

  // cost.summary.v1 — exact field assertions per plan sub-task 2.
  it('GET /projection/cost.summary.v1 returns 200 + exact total_cost_usd: 12.34', async () => {
    const topic = 'onex.snapshot.projection.cost.summary.v1';
    const topicDir = join(fixturesDir, encodeURIComponent(topic));
    await mkdir(topicDir, { recursive: true });
    await writeFile(join(topicDir, 'index.json'), JSON.stringify(['snapshot.json']));
    await writeFile(
      join(topicDir, 'snapshot.json'),
      JSON.stringify({
        window: '24h',
        total_cost_usd: 12.34,
        total_savings_usd: 4.56,
        total_tokens: 1234567,
        captured_at: '2026-04-29T00:00:00Z',
      }),
    );

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(`/projection/${encodeURIComponent(topic)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].total_cost_usd).toBe(12.34);
    expect(res.body[0].total_savings_usd).toBe(4.56);
    expect(res.body[0].total_tokens).toBe(1234567);
    expect(res.body[0].window).toBe('24h');
  });

  // cost.by_repo.v1 — exact 3 rows, repo names, and cost values.
  it('GET /projection/cost.by_repo.v1 returns 200 + exact 3 rows with correct repo_name + total_cost_usd', async () => {
    const topic = 'onex.snapshot.projection.cost.by_repo.v1';
    const topicDir = join(fixturesDir, encodeURIComponent(topic));
    await mkdir(topicDir, { recursive: true });
    await writeFile(
      join(topicDir, 'index.json'),
      JSON.stringify(['omniclaude.json', 'omnimarket.json', 'omnidash.json']),
    );
    await writeFile(
      join(topicDir, 'omniclaude.json'),
      JSON.stringify({ repo_name: 'omniclaude', total_cost_usd: 5.0, window: '7d' }),
    );
    await writeFile(
      join(topicDir, 'omnimarket.json'),
      JSON.stringify({ repo_name: 'omnimarket', total_cost_usd: 4.5, window: '7d' }),
    );
    await writeFile(
      join(topicDir, 'omnidash.json'),
      JSON.stringify({ repo_name: 'omnidash', total_cost_usd: 2.84, window: '7d' }),
    );

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(`/projection/${encodeURIComponent(topic)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const byRepo = Object.fromEntries(res.body.map((r: Record<string, unknown>) => [r.repo_name, r]));
    expect(byRepo['omniclaude'].total_cost_usd).toBe(5.0);
    expect(byRepo['omnimarket'].total_cost_usd).toBe(4.5);
    expect(byRepo['omnidash'].total_cost_usd).toBe(2.84);
  });

  // cost.token_usage.v1 — exact 5 buckets, total_tokens sequence 100k–500k.
  it('GET /projection/cost.token_usage.v1 returns 200 + exact 5 buckets with total_tokens 100k–500k', async () => {
    const topic = 'onex.snapshot.projection.cost.token_usage.v1';
    const topicDir = join(fixturesDir, encodeURIComponent(topic));
    await mkdir(topicDir, { recursive: true });

    const buckets = [
      { bucket_time: '2026-04-29T00:00:00Z', total_tokens: 100000 },
      { bucket_time: '2026-04-29T01:00:00Z', total_tokens: 200000 },
      { bucket_time: '2026-04-29T02:00:00Z', total_tokens: 300000 },
      { bucket_time: '2026-04-29T03:00:00Z', total_tokens: 400000 },
      { bucket_time: '2026-04-29T04:00:00Z', total_tokens: 500000 },
    ];

    const fileNames = buckets.map((_, i) => `bucket-${i + 1}.json`);
    await writeFile(join(topicDir, 'index.json'), JSON.stringify(fileNames));
    for (let i = 0; i < buckets.length; i++) {
      await writeFile(join(topicDir, fileNames[i]), JSON.stringify(buckets[i]));
    }

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(`/projection/${encodeURIComponent(topic)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    const tokens = res.body.map((r: Record<string, unknown>) => r.total_tokens) as number[];
    expect(tokens).toEqual([100000, 200000, 300000, 400000, 500000]);
    // All bucket_time values are hourly ISO-8601 UTC timestamps.
    for (const row of res.body as Array<Record<string, unknown>>) {
      expect(typeof row.bucket_time).toBe('string');
      expect(row.bucket_time).toMatch(/T\d{2}:00:00Z$/);
    }
  });

  // Empty topic → returns [] (existing coverage + sanity for new topics).
  it('GET /projection/cost.summary.v1 returns [] when no fixture exists', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(
      '/projection/onex.snapshot.projection.cost.summary.v1',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// OMN-10623: SQLite data source mode
describe('server projection routes — OMNIDASH_DATA_SOURCE=sqlite', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'omnidash-sqlite-routes-'));
    dbPath = join(tmpDir, 'delegation.sqlite');
    process.env.OMNIDASH_DATA_SOURCE = 'sqlite';
    process.env.OMNIDASH_SQLITE_DB_PATH = dbPath;
  });

  afterEach(async () => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_SQLITE_DB_PATH;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns [] for delegation.decisions topic when DB has no rows', async () => {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS delegation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        correlation_id TEXT NOT NULL UNIQUE,
        session_id TEXT,
        tool_use_id TEXT,
        hook_name TEXT,
        task_type TEXT NOT NULL DEFAULT '',
        delegated_to TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT '',
        quality_gate_passed INTEGER NOT NULL DEFAULT 0,
        quality_gate_detail TEXT,
        latency_ms INTEGER,
        input_hash TEXT,
        input_redaction_policy TEXT NOT NULL DEFAULT 'hash_only',
        contract_version TEXT NOT NULL DEFAULT 'v1',
        created_at REAL NOT NULL
      );
    `);
    db.close();

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(
      '/projection/onex.snapshot.projection.delegation.decisions.v1',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns delegation_events rows for decisions topic', async () => {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS delegation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        correlation_id TEXT NOT NULL UNIQUE,
        session_id TEXT,
        tool_use_id TEXT,
        hook_name TEXT,
        task_type TEXT NOT NULL DEFAULT '',
        delegated_to TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT '',
        quality_gate_passed INTEGER NOT NULL DEFAULT 0,
        quality_gate_detail TEXT,
        latency_ms INTEGER,
        input_hash TEXT,
        input_redaction_policy TEXT NOT NULL DEFAULT 'hash_only',
        contract_version TEXT NOT NULL DEFAULT 'v1',
        created_at REAL NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, created_at)
      VALUES ('corr-sqlite-1', 'code', 'local', 'qwen3', 1, 1000.0)
    `).run();
    db.close();

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(
      '/projection/onex.snapshot.projection.delegation.decisions.v1',
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].correlation_id).toBe('corr-sqlite-1');
    expect(res.body[0].model_name).toBe('qwen3');
  });

  it('returns [] for unknown topic in sqlite mode', async () => {
    // DB file does not need to exist for unknown topics
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(
      '/projection/onex.snapshot.projection.unknown.v1',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('/projection/delegation short alias returns same rows as decisions.v1 topic', async () => {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS delegation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        correlation_id TEXT NOT NULL UNIQUE,
        session_id TEXT,
        tool_use_id TEXT,
        hook_name TEXT,
        task_type TEXT NOT NULL DEFAULT '',
        delegated_to TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT '',
        quality_gate_passed INTEGER NOT NULL DEFAULT 0,
        quality_gate_detail TEXT,
        latency_ms INTEGER,
        input_hash TEXT,
        input_redaction_policy TEXT NOT NULL DEFAULT 'hash_only',
        contract_version TEXT NOT NULL DEFAULT 'v1',
        created_at REAL NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, created_at)
      VALUES ('corr-alias-1', 'code', 'local', 'qwen3', 1, 1000.0)
    `).run();
    db.close();

    const routes = await loadRoutes();
    const resAlias = await request(buildApp(routes)).get('/projection/delegation');
    const resFull = await request(buildApp(routes)).get(
      '/projection/onex.snapshot.projection.delegation.decisions.v1',
    );
    expect(resAlias.status).toBe(200);
    expect(resAlias.body).toHaveLength(1);
    expect(resAlias.body[0].correlation_id).toBe('corr-alias-1');
    expect(resAlias.body).toEqual(resFull.body);
  });
});

// OMN-7571: Feature flag dashboard — GET /api/settings/feature-flags
describe('GET /api/settings/feature-flags', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'file';
    delete process.env.ENABLE_KAFKA_LOGGING;
    delete process.env.ENABLE_REAL_TIME_EVENTS;
    delete process.env.ARCHON_ENABLE_EXTERNAL_GATEWAY;
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.ENABLE_KAFKA_LOGGING;
    delete process.env.ENABLE_REAL_TIME_EVENTS;
    delete process.env.ARCHON_ENABLE_EXTERNAL_GATEWAY;
  });

  it('returns 200 with flags array and fetchedAt', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/settings/feature-flags');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.flags)).toBe(true);
    expect(typeof res.body.fetchedAt).toBe('string');
    expect(new Date(res.body.fetchedAt).getTime()).not.toBeNaN();
  });

  it('includes both omnidash and omniclaude service entries', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/settings/feature-flags');

    const services = new Set((res.body.flags as Array<{ service: string }>).map((f) => f.service));
    expect(services.has('omnidash')).toBe(true);
    expect(services.has('omniclaude')).toBe(true);
  });

  it('each flag entry has name, value, state, service, description', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/settings/feature-flags');

    for (const flag of res.body.flags as Array<Record<string, unknown>>) {
      expect(typeof flag.name).toBe('string');
      expect(['on', 'off', 'migration']).toContain(flag.state);
      expect(['omniclaude', 'omnidash']).toContain(flag.service);
      expect(typeof flag.description).toBe('string');
    }
  });

  it('reflects env var values: set ENABLE_KAFKA_LOGGING=true → state=on', async () => {
    process.env.ENABLE_KAFKA_LOGGING = 'true';

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/settings/feature-flags');

    const flag = (res.body.flags as Array<{ name: string; state: string; value: string | null }>).find(
      (f) => f.name === 'ENABLE_KAFKA_LOGGING',
    );
    expect(flag).toBeDefined();
    expect(flag?.state).toBe('on');
    expect(flag?.value).toBe('true');
  });

  it('reflects env var values: unset ENABLE_KAFKA_LOGGING → state=off', async () => {
    delete process.env.ENABLE_KAFKA_LOGGING;

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/settings/feature-flags');

    const flag = (res.body.flags as Array<{ name: string; state: string; value: string | null }>).find(
      (f) => f.name === 'ENABLE_KAFKA_LOGGING',
    );
    expect(flag).toBeDefined();
    expect(flag?.state).toBe('off');
    expect(flag?.value).toBeNull();
  });

  it('migration flags always report state=migration regardless of value', async () => {
    process.env.ARCHON_ENABLE_EXTERNAL_GATEWAY = 'true';

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/settings/feature-flags');

    const flag = (res.body.flags as Array<{ name: string; state: string }>).find(
      (f) => f.name === 'ARCHON_ENABLE_EXTERNAL_GATEWAY',
    );
    expect(flag?.state).toBe('migration');
  });
});

// OMN-12133: projection query endpoints — /api/projections/log-entries and /api/projections/traces
describe('GET /api/projections/log-entries', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'file';
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  it('returns 503 when postgres data source is not configured', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/projections/log-entries');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'postgres data source not configured' });
  });
});

describe('GET /api/projections/traces', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'file';
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  it('returns 503 when postgres data source is not configured', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/projections/traces');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'postgres data source not configured' });
  });
});

// OMN-12822 (A2): the bespoke correlation-trace read route is RETIRED.
// fetchCorrelationTrace (src/services/delegation-api.ts) reads the
// per-correlation trace via the canonical projection API
// (`/projection/{topic}?correlation_id=<id>`) per OMN-12748; the dashboard
// renders the projection, it does not call a hand-written backend endpoint.
// The dead route must not be mounted — only authoritative read paths remain.
describe('GET /api/delegation/correlation-trace/:id is retired (OMN-12822)', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'file';
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  it('the bespoke correlation-trace route is not mounted (404)', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(
      '/api/delegation/correlation-trace/some-correlation-id',
    );

    // Express returns 404 for an unmounted route. The canonical read path is
    // `/projection/{topic}?correlation_id=<id>`, exercised elsewhere.
    expect(res.status).toBe(404);
  });
});

// OMN-14642: the deployed default is now `http` mode — the Express bridge must
// NOT hold a direct RDS/Postgres connection. Projection reads route through the
// projection-api HTTP service (which owns the DB). These tests drive the ACTUAL
// read seam bridge -> http adapter -> projection-api over real HTTP against a
// stand-in projection-api server. There is deliberately NO pg mock here: the
// point is to prove the bridge reaches a projection-api service, not a database.
describe('server projection routes — OMNIDASH_DATA_SOURCE=http (bridge -> adapter -> projection-api)', () => {
  let projectionApi: http.Server;
  let received: Array<{ method: string; url: string }>;
  let respondWith: { status: number; body: unknown };

  beforeEach(async () => {
    received = [];
    respondWith = { status: 200, body: { rows: [] } };
    projectionApi = http.createServer((req, res) => {
      received.push({ method: req.method ?? '', url: req.url ?? '' });
      res.statusCode = respondWith.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(respondWith.body));
    });
    await new Promise<void>((resolve) => projectionApi.listen(0, '127.0.0.1', () => resolve()));
    const addr = projectionApi.address() as AddressInfo;
    // OMNIDASH_BRIDGE_URL feeds dsConfig.url — the projection-api base the bridge
    // proxies to in http mode. No DATABASE_URL / RDS credential is set.
    process.env.OMNIDASH_DATA_SOURCE = 'http';
    process.env.OMNIDASH_BRIDGE_URL = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_BRIDGE_URL;
    await new Promise<void>((resolve, reject) =>
      projectionApi.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('proxies GET /projection/:topic through the http adapter to the projection-api (no pg)', async () => {
    const topic = 'onex.snapshot.projection.swarm.runs.v1';
    respondWith = {
      status: 200,
      body: { rows: [{ run_id: 'run-http-1', status: 'complete' }] },
    };

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(`/projection/${encodeURIComponent(topic)}`);

    // The bridge returned exactly what the projection-api served — the read
    // flowed bridge -> http adapter -> projection-api over real HTTP.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rows: [{ run_id: 'run-http-1', status: 'complete' }] });

    // The seam actually hit the projection-api service (not a DB): the stand-in
    // projection-api received exactly one GET /projection/<topic>.
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('GET');
    expect(received[0].url).toBe(`/projection/${encodeURIComponent(topic)}`);
  });

  it('surfaces a projection-api upstream error as HTTP 500 (upstream read, not a local DB read)', async () => {
    respondWith = { status: 503, body: { error: 'projection-api down' } };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const routes = await loadRoutes();
      const res = await request(buildApp(routes)).get(
        '/projection/onex.snapshot.projection.swarm.runs.v1',
      );

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'projection read failed' });
      // The adapter still reached the projection-api (proving the failure came
      // from the upstream read seam, not from a direct DB connection).
      expect(received).toHaveLength(1);
    } finally {
      consoleError.mockRestore();
    }
  });
});

// OMN-14754: the three specialized read routes (swarm-runs, log-entries,
// traces) previously gated on the (http-mode-null) pgReader and 503'd in the
// deployed http default — a functional regression after OMN-14642 (PR #261)
// flipped the bridge default from postgres to http. They must now resolve
// through the projection-api over the SAME real http seam the primary
// /projection/:topic read uses. These tests drive that ACTUAL seam (bridge ->
// http adapter -> stand-in projection-api over real HTTP), not a mock of the
// adapter, and prove each route returns the projection-api's data (not 503)
// when data_source.url is set.
describe('specialized read routes route through projection-api in http mode (OMN-14754)', () => {
  let projectionApi: http.Server;
  let received: Array<{ method: string; url: string }>;
  let handler: () => { status: number; body: unknown };

  beforeEach(async () => {
    received = [];
    handler = () => ({ status: 200, body: { rows: [] } });
    projectionApi = http.createServer((req, res) => {
      received.push({ method: req.method ?? '', url: req.url ?? '' });
      const { status, body } = handler();
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => projectionApi.listen(0, '127.0.0.1', () => resolve()));
    const addr = projectionApi.address() as AddressInfo;
    // OMNIDASH_BRIDGE_URL feeds dsConfig.url — the projection-api base the bridge
    // proxies to in http mode. No DATABASE_URL / RDS credential is set.
    process.env.OMNIDASH_DATA_SOURCE = 'http';
    process.env.OMNIDASH_BRIDGE_URL = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_BRIDGE_URL;
    await new Promise<void>((resolve, reject) =>
      projectionApi.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('GET /api/swarm-runs returns projection-api rows (not 503) via /projection/<topic>', async () => {
    handler = () => ({
      status: 200,
      body: {
        topic: 'onex.snapshot.projection.swarm.runs.v1',
        source: 'postgres',
        rows: [{ run_id: 'swarm-http-1', status: 'complete' }],
      },
    });
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get('/api/swarm-runs');

    // Data, not 503: the envelope's rows are unwrapped and returned as { rows }.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rows: [{ run_id: 'swarm-http-1', status: 'complete' }] });
    // The read flowed to the projection-api's canonical topic endpoint.
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('GET');
    expect(received[0].url).toBe('/projection/onex.snapshot.projection.swarm.runs.v1');
  });

  it('GET /api/projections/log-entries proxies the query to the projection-api (not 503)', async () => {
    const entries = [
      {
        entry_id: 'e1',
        timestamp: '2026-07-18T00:00:00Z',
        node_name: 'n1',
        function_name: 'f',
        level: 'INFO',
        message: 'hi',
        correlation_id: 'c1',
        duration_ms: null,
        metadata: {},
      },
    ];
    handler = () => ({ status: 200, body: entries });
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(
      '/api/projections/log-entries?correlation_id=c1&limit=25',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(entries);
    // The bridge proxied the same path + query verbatim to the projection-api.
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('GET');
    expect(received[0].url).toBe('/api/projections/log-entries?correlation_id=c1&limit=25');
  });

  it('GET /api/projections/traces proxies the query to the projection-api (not 503)', async () => {
    const traces = [
      {
        correlation_id: 'c1',
        nodes_involved: ['n1'],
        event_count: 3,
        first_event_at: '2026-07-18T00:00:00Z',
        last_event_at: '2026-07-18T00:00:05Z',
        duration_ms: 5000,
        has_error: false,
        is_running: false,
        latest_message: 'done',
      },
    ];
    handler = () => ({ status: 200, body: traces });
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).get(
      '/api/projections/traces?running_only=1&limit=10',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(traces);
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('GET');
    expect(received[0].url).toBe('/api/projections/traces?running_only=1&limit=10');
  });
});

// OMN-14754: http mode fails CLOSED when data_source.url is unset (the base
// contract carries data_source.url=''; the deploy overlay must set it). Each
// specialized route must surface a clean 500 (no crash, no 503-that-hides-the-
// misconfig) rather than throwing an unhandled error.
describe('specialized read routes fail closed (no crash) when data_source.url is unset (OMN-14754)', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'http';
    // Empty string (not unset) so the resolved url is '' regardless of any local
    // contract overlay — the http adapter must refuse rather than read nowhere.
    process.env.OMNIDASH_BRIDGE_URL = '';
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_BRIDGE_URL;
  });

  it.each([
    ['/api/swarm-runs', 'swarm runs read failed'],
    ['/api/projections/log-entries', 'log entries query failed'],
    ['/api/projections/traces', 'traces query failed'],
  ])('%s returns a clean 500 (not a crash) when data_source.url is empty', async (path, error) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const routes = await loadRoutes();
      const res = await request(buildApp(routes)).get(path);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error });
    } finally {
      consoleError.mockRestore();
    }
  });
});
