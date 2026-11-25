// @vitest-environment node
// OMN-26665 AC2: SIGTERM stops new requests, finishes the reads already running, then exits;
// readiness fails until the built bundle and the projection API both answer.
//
// Failure modes this file pins (written before createLifecycle existed in server/routes.ts):
//   S1 a read in flight when SIGTERM lands must finish with its 200, and exit must wait for it
//   S2 a request that arrives after SIGTERM must be refused, not served
//   S3 a second SIGTERM must not exit early or run the shutdown twice
//   S4 a read that never ends must not hold the pod past the grace period
//   S5 an idle keep-alive socket must not hold the shutdown open
//   R1 bundle missing -> not ready, naming the bundle
//   R2 projection API down or hanging -> not ready, naming the projection
//   R3 both answering -> ready
//   R4 draining -> not ready even when both answer
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLifecycle } from '../routes.js';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

async function listen(app: express.Express): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => { server.closeAllConnections(); server.close(); });
  return { server, port: (server.address() as AddressInfo).port };
}

function get(port: number, urlPath: string, agent?: http.Agent): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, agent }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

function bundleDir(withIndex: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'omn26665-dist-'));
  if (withIndex) writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function build(opts: {
  withIndex?: boolean;
  projection?: () => Promise<boolean>;
  graceMs?: number;
  stopHeartbeat?: () => void;
}) {
  const exit = vi.fn();
  const app = express();
  const slow = deferred();
  let slowStarted!: () => void;
  const started = new Promise<void>((r) => { slowStarted = r; });
  const lifecycle = createLifecycle({
    distDir: bundleDir(opts.withIndex ?? true),
    checkProjection: opts.projection ?? (async () => true),
    graceMs: opts.graceMs ?? 5_000,
    stopHeartbeat: opts.stopHeartbeat ?? (() => {}),
    exit,
  });
  app.use(lifecycle.middleware);
  app.get('/api/health-probe', lifecycle.readinessHandler);
  app.get('/slow', async (_req, res) => {
    slowStarted();
    await slow.promise;
    res.json({ done: true });
  });
  app.get('/never', () => { /* never answers */ });
  app.get('/quick', (_req, res) => { res.json({ quick: true }); });
  return { app, lifecycle, exit, slow, started };
}

describe('AC2 shutdown: SIGTERM drains instead of dropping', () => {
  it('S1: the read in flight finishes with its 200 and exit waits for it', async () => {
    const t = build({});
    const { server, port } = await listen(t.app);
    t.lifecycle.attach(server);
    const inflight = get(port, '/slow');
    await t.started;

    const shutdown = t.lifecycle.shutdown();
    await new Promise((r) => setTimeout(r, 150));
    expect(t.exit).not.toHaveBeenCalled();

    t.slow.resolve();
    const res = await inflight;
    await shutdown;
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ done: true });
    expect(t.exit).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledWith(0);
  });

  it('S2: a request that arrives after SIGTERM is refused, not served', async () => {
    const t = build({});
    const { server, port } = await listen(t.app);
    t.lifecycle.attach(server);
    const inflight = get(port, '/slow');
    await t.started;
    const shutdown = t.lifecycle.shutdown();
    await new Promise((r) => setTimeout(r, 50));

    const late = await get(port, '/quick').then(
      (r) => ({ kind: 'response' as const, status: r.status }),
      (e: NodeJS.ErrnoException) => ({ kind: 'refused' as const, code: e.code }),
    );
    if (late.kind === 'response') expect(late.status).toBe(503);
    else expect(['ECONNREFUSED', 'ECONNRESET']).toContain(late.code);

    t.slow.resolve();
    await inflight;
    await shutdown;
  });

  it('S3: a second SIGTERM neither exits early nor stops the heartbeat twice', async () => {
    const stopHeartbeat = vi.fn();
    const t = build({ stopHeartbeat });
    const { server, port } = await listen(t.app);
    t.lifecycle.attach(server);
    const inflight = get(port, '/slow');
    await t.started;
    const first = t.lifecycle.shutdown();
    const second = t.lifecycle.shutdown();
    await new Promise((r) => setTimeout(r, 100));
    expect(t.exit).not.toHaveBeenCalled();
    t.slow.resolve();
    await inflight;
    await Promise.all([first, second]);
    expect(t.exit).toHaveBeenCalledTimes(1);
    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('S4: a read that never ends is cut at the grace period and exits non-zero', async () => {
    const t = build({ graceMs: 300 });
    const { server, port } = await listen(t.app);
    t.lifecycle.attach(server);
    const stuck = get(port, '/never').catch(() => 'cut');
    await new Promise((r) => setTimeout(r, 50));
    const began = Date.now();
    await t.lifecycle.shutdown();
    expect(Date.now() - began).toBeLessThan(2_000);
    expect(t.exit).toHaveBeenCalledWith(1);
    expect(await stuck).toBe('cut');
  });

  it('S5: an idle keep-alive socket does not hold the shutdown open', async () => {
    const t = build({ graceMs: 5_000 });
    const { server, port } = await listen(t.app);
    t.lifecycle.attach(server);
    const agent = new http.Agent({ keepAlive: true });
    cleanups.push(() => agent.destroy());
    expect((await get(port, '/quick', agent)).status).toBe(200);

    const began = Date.now();
    await t.lifecycle.shutdown();
    expect(Date.now() - began).toBeLessThan(1_500);
    expect(t.exit).toHaveBeenCalledWith(0);
  });
});

describe('AC2 readiness: the probe fails until the bundle and the projection answer', () => {
  it('R1: no built bundle -> 503 naming the bundle', async () => {
    const t = build({ withIndex: false });
    const res = await request(t.app).get('/api/health-probe');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.checks.bundle).toBe(false);
    expect(res.body.checks.projection).toBe(true);
  });

  it('R2: projection down, or hanging past its deadline -> 503 naming the projection', async () => {
    const down = build({ projection: async () => false });
    const r1 = await request(down.app).get('/api/health-probe');
    expect(r1.status).toBe(503);
    expect(r1.body.checks).toEqual({ bundle: true, projection: false, draining: false });

    const hung = build({ projection: () => new Promise<boolean>(() => {}) });
    const began = Date.now();
    const r2 = await request(hung.app).get('/api/health-probe');
    expect(Date.now() - began).toBeLessThan(6_000);
    expect(r2.status).toBe(503);
    expect(r2.body.checks.projection).toBe(false);
  }, 15_000);

  it('R3: bundle present and projection answering -> 200 ok', async () => {
    const t = build({});
    const res = await request(t.app).get('/api/health-probe');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { bundle: true, projection: true, draining: false } });
  });

  it('R4: draining fails readiness even when the bundle and projection both answer', async () => {
    const t = build({});
    const { server, port } = await listen(t.app);
    t.lifecycle.attach(server);
    const inflight = get(port, '/slow');
    await t.started;
    const shutdown = t.lifecycle.shutdown();
    // A probe over a connection that was already open still sees the pod say it is leaving.
    const probe = await request(t.app).get('/api/health-probe');
    expect(probe.status).toBe(503);
    expect(probe.body.checks.draining).toBe(true);
    t.slow.resolve();
    await inflight;
    await shutdown;
  });
});

// AC6 (hosted proof, mechanism b, server half): one pod's rollout as the probe sees it. The merged-build timing of a real
// rollout is a note in the pull request; this is what hosted CI can run before merge.
//   A1 the probe must not say ok while the bundle is missing or the projection is down, and must say ok once both answer
//   A2 the same pod, once told to stop, must say not ready (draining) while the read in flight is still finishing
describe('AC6 rollout: the probe follows one pod from start to drain', () => {
  it('AC6 A1+A2: 503 with no bundle (projection down, then up), 503 with the projection down, 200 when both answer, 503 while draining', async () => {
    let projectionUp = false;
    const dir = bundleDir(false);
    const exit = vi.fn();
    const slow = deferred();
    let slowStarted!: () => void;
    const started = new Promise<void>((r) => { slowStarted = r; });
    const lifecycle = createLifecycle({ distDir: dir, checkProjection: async () => projectionUp, graceMs: 5_000, stopHeartbeat: () => {}, exit });
    const app = express();
    app.use(lifecycle.middleware);
    app.get('/api/health-probe', lifecycle.readinessHandler);
    app.get('/slow', async (_req, res) => { slowStarted(); await slow.promise; res.json({ done: true }); });
    const { server, port } = await listen(app);
    lifecycle.attach(server);
    const probe = async () => JSON.parse((await get(port, '/api/health-probe')).body) as { status: string; checks: Record<string, boolean> };
    const status = async () => (await get(port, '/api/health-probe')).status;

    expect(await status()).toBe(503);
    expect((await probe()).checks).toMatchObject({ bundle: false, projection: false });

    projectionUp = true;
    expect(await status()).toBe(503);
    expect((await probe()).checks).toMatchObject({ bundle: false, projection: true });

    projectionUp = false;
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
    expect(await status()).toBe(503);
    expect((await probe()).checks).toMatchObject({ bundle: true, projection: false });

    projectionUp = true;
    expect(await status()).toBe(200);
    expect(await probe()).toEqual({ status: 'ok', checks: { bundle: true, projection: true, draining: false } });

    const inflight = get(port, '/slow');
    await started;
    const shutdown = lifecycle.shutdown();
    const draining = await request(app).get('/api/health-probe');
    expect(draining.status).toBe(503);
    expect(draining.body.checks).toMatchObject({ bundle: true, projection: true, draining: true });
    expect(exit).not.toHaveBeenCalled();

    slow.resolve();
    expect((await inflight).status).toBe(200);
    await shutdown;
    expect(exit).toHaveBeenCalledWith(0);
  });
});
