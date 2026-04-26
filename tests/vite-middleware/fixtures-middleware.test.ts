// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fixturesMiddleware } from '../../vite.config';

describe('fixturesMiddleware (handler logic)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'fixt-mw-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const call = async (handler: Function, url: string) => {
    return await new Promise<{ statusCode: number; body: string }>((resolve) => {
      const req: any = { url };
      let statusCode = 200;
      let body = '';
      const res: any = {
        setHeader: () => {},
        end: (b?: string) => resolve({ statusCode, body: b ?? '' }),
        get statusCode() { return statusCode; },
        set statusCode(v) { statusCode = v; },
      };
      handler(req, res, () => resolve({ statusCode: 404, body: '' }));
    });
  };

  it('returns registry.json when file exists', async () => {
    writeFileSync(path.join(root, 'registry.json'), '{"x":1}');
    const { handler } = fixturesMiddleware({ root });
    const r = await call(handler, '/registry.json');
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ x: 1 });
  });

  it('synthesizes topic index.json listing', async () => {
    mkdirSync(path.join(root, 'topic-a'));
    writeFileSync(path.join(root, 'topic-a', 'k1.json'), '{}');
    writeFileSync(path.join(root, 'topic-a', 'k2.json'), '{}');
    const { handler } = fixturesMiddleware({ root });
    const r = await call(handler, '/topic-a/index.json');
    expect(r.statusCode).toBe(200);
    const list = JSON.parse(r.body);
    expect(list.sort()).toEqual(['k1.json', 'k2.json']);
  });

  it('serves individual snapshot files', async () => {
    mkdirSync(path.join(root, 'topic-a'));
    writeFileSync(path.join(root, 'topic-a', 'key-1.json'), '{"entity_id":"key-1"}');
    const { handler } = fixturesMiddleware({ root });
    const r = await call(handler, '/topic-a/key-1.json');
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).entity_id).toBe('key-1');
  });

  it('returns 404 for missing files', async () => {
    const { handler } = fixturesMiddleware({ root });
    const r = await call(handler, '/does-not-exist.json');
    expect(r.statusCode).toBe(404);
  });

  it('returns 404 for nested paths outside the contract', async () => {
    const { handler } = fixturesMiddleware({ root });
    const r = await call(handler, '/a/b/c/d.json');
    expect(r.statusCode).toBe(404);
  });
});
