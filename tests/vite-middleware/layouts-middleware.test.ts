// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { layoutsMiddleware } from '../../vite.config';

const SAMPLE_LAYOUT = JSON.stringify({ id: 'dash-1', name: 'default', layout: [] });

describe('layoutsMiddleware (handler logic)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'layouts-mw-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const call = (
    handler: (req: any, res: any, next: any) => void,
    method: string,
    url: string,
    body?: string
  ): Promise<{ statusCode: number; body: string }> => {
    return new Promise((resolve) => {
      let statusCode = 200;
      const res: any = {
        setHeader: () => {},
        end: (b?: string) => resolve({ statusCode, body: b ?? '' }),
        get statusCode() { return statusCode; },
        set statusCode(v: number) { statusCode = v; },
      };

      // Simulate a simple readable stream for the request body
      const listeners: Record<string, ((chunk?: any) => void)[]> = {};
      const req: any = {
        url,
        method,
        on: (event: string, cb: (chunk?: any) => void) => {
          listeners[event] = listeners[event] ?? [];
          listeners[event].push(cb);
        },
      };

      handler(req, res, () => resolve({ statusCode: 404, body: '' }));

      // Emit body events if body provided
      if (body !== undefined && listeners['data']) {
        for (const cb of listeners['data']) cb(Buffer.from(body));
      }
      if (listeners['end']) {
        for (const cb of listeners['end']) cb();
      }
    });
  };

  it('GET returns 404 when layout file is missing', async () => {
    const { handler } = layoutsMiddleware({ root });
    const r = await call(handler, 'GET', '/default');
    expect(r.statusCode).toBe(404);
  });

  it('GET returns layout JSON when file exists', async () => {
    writeFileSync(path.join(root, 'default.json'), SAMPLE_LAYOUT);
    const { handler } = layoutsMiddleware({ root });
    const r = await call(handler, 'GET', '/default');
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).name).toBe('default');
  });

  it('POST writes file and returns 200 with body', async () => {
    const { handler } = layoutsMiddleware({ root });
    const r = await call(handler, 'POST', '/default', SAMPLE_LAYOUT);
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).name).toBe('default');

    // Verify file was written
    const { readFileSync } = await import('node:fs');
    const written = readFileSync(path.join(root, 'default.json'), 'utf8');
    expect(JSON.parse(written).name).toBe('default');
  });

  it('POST is idempotent (upsert — second write overwrites)', async () => {
    const { handler } = layoutsMiddleware({ root });
    const v1 = JSON.stringify({ name: 'v1' });
    const v2 = JSON.stringify({ name: 'v2' });
    await call(handler, 'POST', '/default', v1);
    await call(handler, 'POST', '/default', v2);

    const { readFileSync } = await import('node:fs');
    const written = readFileSync(path.join(root, 'default.json'), 'utf8');
    expect(JSON.parse(written).name).toBe('v2');
  });

  it('POST returns 400 for invalid JSON body', async () => {
    const { handler } = layoutsMiddleware({ root });
    const r = await call(handler, 'POST', '/default', 'not-valid-json{{{');
    expect(r.statusCode).toBe(400);
  });

  it('returns 404 for nested paths (outside contract)', async () => {
    const { handler } = layoutsMiddleware({ root });
    const r = await call(handler, 'GET', '/a/b/c');
    expect(r.statusCode).toBe(404);
  });

  it('returns 404 for unsupported HTTP method', async () => {
    const { handler } = layoutsMiddleware({ root });
    const r = await call(handler, 'DELETE', '/default');
    expect(r.statusCode).toBe(404);
  });

  it('rejects path traversal names with 400', async () => {
    const { handler } = layoutsMiddleware({ root });
    // URL-encoded traversal: %2F is /, %5C is \, .. is dot-dot
    const r1 = await call(handler, 'GET', '/..');
    expect(r1.statusCode).toBe(400);
    const r2 = await call(handler, 'GET', '/.');
    expect(r2.statusCode).toBe(400);
  });
});
