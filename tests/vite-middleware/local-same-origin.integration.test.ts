// @vitest-environment node
//
// OMN-19994 AC1, end to end through the real dev server. A fresh install has no env file; contract.local.yaml's
// data_source.url names `onex dashboard` on loopback, which sends no CORS headers (measured on .201 2026-10-05
// 18:12Z: no Access-Control-Allow-Origin, OPTIONS 405). The page must still read it, so the dev server built
// from vite.config.ts has to serve /projection* same-origin and tell the browser to use that path.
//
// The upstream here is a stand-in that, like `onex dashboard`, answers only GET and sends no CORS headers.
import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

const overlay = vi.hoisted(() => ({ url: '' }));

// vite.config.ts reads the overlay URL through the contract loader; point it at this test's upstream.
vi.mock('../../server/data-source-contract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/data-source-contract')>();
  return {
    ...actual,
    loadRuntimeContract: () => {
      const contract = actual.loadRuntimeContract();
      return { ...contract, data_source: { ...contract.data_source, url: overlay.url } };
    },
  };
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const RUN_ID = '9c7083c2-213e-4a84-aae7-fae9c18af576';

let upstream: Server;
let vite: ViteDevServer;
let base = '';
const seen: Array<{ method?: string; url?: string; origin?: string }> = [];

function listen(server: Server | NonNullable<ViteDevServer['httpServer']>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

beforeAll(async () => {
  upstream = createHttpServer((req: IncomingMessage, res) => {
    seen.push({ method: req.method, url: req.url, origin: req.headers.origin });
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
      return res.end('{"detail":"Method Not Allowed"}');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/projections') {
      return res.end(JSON.stringify({ topics: [{ topic: DECISIONS, backing: 'bus', bus_backed: true }] }));
    }
    return res.end(JSON.stringify({ rows: [{ correlation_id: RUN_ID }], row_count: 1 }));
  });
  overlay.url = `http://127.0.0.1:${await listen(upstream)}`;

  const { default: config } = await import('../../vite.config');
  const resolved = typeof config === 'function' ? await config({ command: 'serve', mode: 'development' }) : config;
  vite = await createServer({
    ...resolved,
    configFile: false,
    root: ROOT,
    logLevel: 'silent',
    server: { ...resolved.server, middlewareMode: false, hmr: false, port: 0, host: '127.0.0.1' },
    optimizeDeps: { ...resolved.optimizeDeps, noDiscovery: true, include: [] },
  });
  await vite.listen();
  base = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  await vite?.close();
  await new Promise((resolve) => upstream?.close(resolve));
});

describe('the dev server serves the overlay projection backend same-origin (OMN-19994 AC1)', () => {
  it('serves the exposure catalogue at /projections from the overlay backend, not the SPA', async () => {
    const res = await fetch(`${base}/projections`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.trimStart().startsWith('<')).toBe(false);
    expect(JSON.parse(body).topics[0].topic).toBe(DECISIONS);
  });

  it('serves an exposure read with its query string intact', async () => {
    const res = await fetch(`${base}/projection/${DECISIONS}?tenant=c94fa3c5-ea87-4dbb-a4fc-424343bac7a0`);
    expect(res.status).toBe(200);
    expect((await res.json()).rows[0].correlation_id).toBe(RUN_ID);
    expect(seen.at(-1)?.url).toBe(`/projection/${DECISIONS}?tenant=c94fa3c5-ea87-4dbb-a4fc-424343bac7a0`);
  });

  it('hands the browser the same-origin flag in the served import.meta.env', async () => {
    const res = await fetch(`${base}/src/data-source/projection-base-url.ts`);
    expect(res.status).toBe(200);
    const code = await res.text();
    expect(code).toMatch(/"OMNIDASH_SAME_ORIGIN_PROJECTION":\s*"1"/);
  });
});
