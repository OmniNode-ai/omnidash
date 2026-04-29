import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
  });

  afterEach(async () => {
    delete process.env.FIXTURES_DIR;
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

  it('server import does not require OMNIDASH_ANALYTICS_DB_URL', async () => {
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;

    await expect(import('./index.js')).resolves.toBeTruthy();
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
  });

  afterEach(async () => {
    delete process.env.FIXTURES_DIR;
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
