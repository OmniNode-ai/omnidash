import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

async function importApp() {
  const { app } = await import('../index.js');
  return app;
}

describe('CORS middleware', () => {
  it('allows a known localhost dev origin', async () => {
    const app = await importApp();
    const res = await request(app)
      .get('/api/runtime-config')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not echo an unlisted origin', async () => {
    const app = await importApp();
    const res = await request(app)
      .get('/api/runtime-config')
      .set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the OMNIDASH_BASE_URL origin when set', async () => {
    process.env.OMNIDASH_BASE_URL = 'https://dev.dash.omninode.ai';
    vi.resetModules();
    const { app } = await import('../index.js');
    delete process.env.OMNIDASH_BASE_URL;

    const res = await request(app)
      .get('/api/runtime-config')
      .set('Origin', 'https://dev.dash.omninode.ai');
    expect(res.headers['access-control-allow-origin']).toBe('https://dev.dash.omninode.ai');
  });

  it('responds 204 to OPTIONS preflight from an allowed origin', async () => {
    const app = await importApp();
    const res = await request(app)
      .options('/api/delegation/trigger')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('includes Authorization in allowed headers', async () => {
    const app = await importApp();
    const res = await request(app)
      .get('/api/runtime-config')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });

  it('sets Vary: Origin so CDN/proxies do not cache the wrong origin header', async () => {
    const app = await importApp();
    const res = await request(app)
      .get('/api/runtime-config')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['vary']).toMatch(/origin/i);
  });
});
