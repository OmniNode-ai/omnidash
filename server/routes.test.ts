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
