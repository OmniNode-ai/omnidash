import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { buildProxyMap } from '../../vite.proxy-config';

describe('buildProxyMap', () => {
  it('routes delegation trigger calls to the omnidash API server', () => {
    const proxy = buildProxyMap({
      VITE_PROJECTION_API_URL: 'http://projection-api:3002',
      VITE_OMNIDASH_API_URL: 'http://omnidash-api:3003',
    });

    expect(proxy['/api/delegation/trigger']?.target).toBe('http://omnidash-api:3003');
    expect(proxy['/api/delegation']?.target).toBe('http://projection-api:3002');
    expect(proxy['/projection']?.target).toBe('http://projection-api:3002');
  });

  it('does not register the trigger proxy without the omnidash API URL', () => {
    const proxy = buildProxyMap({
      VITE_PROJECTION_API_URL: 'http://projection-api:3002',
    });

    expect(proxy['/api/delegation/trigger']).toBeUndefined();
    expect(proxy['/api/delegation']?.target).toBe('http://projection-api:3002');
    expect(proxy['/projection']?.target).toBe('http://projection-api:3002');
  });

  // OMN-12995: route server-side settings endpoints to the Express dev server.
  it('routes /api/settings and /api/runtime-config to the omnidash Express server when configured', () => {
    const proxy = buildProxyMap({
      VITE_OMNIDASH_SERVER_URL: 'http://omnidash-server:3002',
    });

    expect(proxy['/api/settings']?.target).toBe('http://omnidash-server:3002');
    expect(proxy['/api/settings']?.rewrite('/api/settings/feature-flags')).toBe(
      '/api/settings/feature-flags',
    );
    expect(proxy['/api/runtime-config']?.target).toBe('http://omnidash-server:3002');
  });

  it('does not register the settings proxy without VITE_OMNIDASH_SERVER_URL (client-env config state)', () => {
    const proxy = buildProxyMap({
      VITE_PROJECTION_API_URL: 'http://projection-api:3002',
    });

    expect(proxy['/api/settings']).toBeUndefined();
    expect(proxy['/api/runtime-config']).toBeUndefined();
  });

  // OMN-19915: a dead projection backend must name itself. Vite's own proxy
  // error handler answers a bare `500` with an empty body, which every widget
  // renders as "HTTP 500 Internal Server Error" — indistinguishable from the
  // projection API itself failing. On 2026-09-28 a stale `.env.local` pointed
  // the proxy at a port nothing listened on and the whole dashboard read as
  // "the projection API is broken" while the API was healthy and serving rows.
  function fakeResponse() {
    const res = {
      headersSent: false,
      writableEnded: false,
      req: { url: '/projection/onex.snapshot.projection.delegation.summary.v1' },
      status: 0,
      statusMessage: '',
      headers: {} as Record<string, string>,
      body: '',
      writeHead(status: number, statusMessage: string, headers: Record<string, string>) {
        this.status = status;
        this.statusMessage = statusMessage;
        this.headers = headers;
        this.headersSent = true;
        return this;
      },
      end(body?: string) {
        this.body = body ?? '';
        this.writableEnded = true;
        return this;
      },
    };
    return res;
  }

  function refused(): NodeJS.ErrnoException {
    const err = new Error('connect ECONNREFUSED dead-projection-api:3002') as NodeJS.ErrnoException;
    err.code = 'ECONNREFUSED';
    return err;
  }

  it.each(['/projection', '/api/projections'])(
    'answers an unreachable projection backend on %s with a 502 that names the target and the cause',
    (route) => {
      const proxy = buildProxyMap({ VITE_PROJECTION_API_URL: 'http://dead-projection-api:3002' });
      const entry = proxy[route];
      expect(entry?.configure).toBeTypeOf('function');

      const server = new EventEmitter();
      entry!.configure!(server as never, entry as never);
      const res = fakeResponse();
      server.emit('error', refused(), res.req, res);

      expect(res.status).toBe(502);
      expect(res.statusMessage).toContain('http://dead-projection-api:3002');
      expect(res.statusMessage).toContain('ECONNREFUSED');
      const body = JSON.parse(res.body) as Record<string, string>;
      expect(body.error).toBe('projection_backend_unreachable');
      expect(body.target).toBe('http://dead-projection-api:3002');
      expect(body.cause).toBe('ECONNREFUSED');
    },
  );

  it('leaves a response alone when the backend already started answering', () => {
    const proxy = buildProxyMap({ VITE_PROJECTION_API_URL: 'http://dead-projection-api:3002' });
    const server = new EventEmitter();
    proxy['/projection']!.configure!(server as never, proxy['/projection'] as never);
    const res = fakeResponse();
    res.headersSent = true;
    server.emit('error', refused(), res.req, res);

    expect(res.status).toBe(0);
    expect(res.body).toBe('');
  });
});
