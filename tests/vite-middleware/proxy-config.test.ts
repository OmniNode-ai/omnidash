import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { buildProxyMap, sameOriginProjectionDefine } from '../../vite.proxy-config';

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

  // OMN-19994 AC1: the local overlay's projection URL (contract.local.yaml data_source.url, generated into
  // DATA_SOURCE_DEFAULT_URL) is a backend the dev server forwards to, never an origin the browser reads
  // cross-origin. Measured on .201 2026-10-05 18:12Z: `onex dashboard` sends no Access-Control-Allow-Origin and
  // answers the preflight 405, so an absolute overlay URL in the browser gave "Failed to fetch" and 0 Runs rows.
  describe('local overlay projection URL (OMN-19994 AC1)', () => {
    const overlay = 'http://127.0.0.1:47694';

    it('proxies /projection to the overlay URL with no env file', () => {
      const proxy = buildProxyMap({}, { overlayProjectionUrl: overlay });
      expect(proxy['/projection']?.target).toBe(overlay);
      expect(proxy['/projection']?.rewrite('/projection/topic.v1')).toBe('/projection/topic.v1');
    });

    it('covers the catalogue path /projections with the same entry (vite matches a context as a prefix)', () => {
      const proxy = buildProxyMap({}, { overlayProjectionUrl: overlay });
      const contexts = Object.keys(proxy).filter((context) => '/projections'.startsWith(context));
      expect(contexts).toEqual(['/projection']);
    });

    it('takes the overlay URL over a stale VITE_PROJECTION_API_URL for /projection', () => {
      const proxy = buildProxyMap(
        { VITE_PROJECTION_API_URL: 'http://stale-env:3002' },
        { overlayProjectionUrl: overlay },
      );
      expect(proxy['/projection']?.target).toBe(overlay);
      // The other env-driven routes keep their env target.
      expect(proxy['/api/delegation']?.target).toBe('http://stale-env:3002');
    });

    it('keeps the env-only behaviour when the overlay names no URL', () => {
      const proxy = buildProxyMap(
        { VITE_PROJECTION_API_URL: 'http://projection-api:3002' },
        { overlayProjectionUrl: '' },
      );
      expect(proxy['/projection']?.target).toBe('http://projection-api:3002');
      expect(proxy['/projection']?.bypass).toBeUndefined();
    });

    it('registers no projection proxy when neither the overlay nor env names a backend', () => {
      expect(buildProxyMap({}, { overlayProjectionUrl: '' })['/projection']).toBeUndefined();
      expect(buildProxyMap({})['/projection']).toBeUndefined();
    });

    it('answers an unreachable overlay backend with the typed 502', () => {
      const proxy = buildProxyMap({}, { overlayProjectionUrl: overlay });
      const server = new EventEmitter();
      proxy['/projection']!.configure!(server as never, proxy['/projection'] as never);
      const res = fakeResponse();
      server.emit('error', refused(), res.req, res);
      expect(res.status).toBe(502);
      expect(JSON.parse(res.body).target).toBe(overlay);
    });

    // A loopback-only backend (D2: `onex dashboard` binds loopback) must not become reachable from the LAN
    // because the dev server was started with --host.
    it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.2'])(
      'forwards a loopback client (%s) to a loopback overlay backend',
      (remoteAddress) => {
        const entry = buildProxyMap({}, { overlayProjectionUrl: overlay })['/projection']!;
        expect(entry.bypass).toBeTypeOf('function');
        expect(entry.bypass!({ socket: { remoteAddress } })).toBeUndefined();
      },
    );

    it.each(['198.51.100.7', '10.0.0.5', '::ffff:198.51.100.7', 'fe80::1', undefined])(
      'refuses a non-loopback client (%s) for a loopback overlay backend',
      (remoteAddress) => {
        const entry = buildProxyMap({}, { overlayProjectionUrl: overlay })['/projection']!;
        expect(entry.bypass!({ socket: { remoteAddress } })).toBe(false);
      },
    );

    it.each(['http://localhost:47694', 'http://[::1]:47694'])(
      'treats %s as a loopback backend',
      (target) => {
        const entry = buildProxyMap({}, { overlayProjectionUrl: target })['/projection']!;
        expect(entry.bypass!({ socket: { remoteAddress: '198.51.100.7' } })).toBe(false);
      },
    );

    it('does not restrict clients for a non-loopback overlay backend (a lab host the LAN can reach anyway)', () => {
      const entry = buildProxyMap({}, { overlayProjectionUrl: 'http://192.0.2.10:3002' })['/projection']!;
      expect(entry.target).toBe('http://192.0.2.10:3002');
      expect(entry.bypass).toBeUndefined();
    });
  });

  describe('sameOriginProjectionDefine (OMN-19994 AC1)', () => {
    it('tells the browser to read same-origin when the dev server proxies the overlay URL', () => {
      expect(sameOriginProjectionDefine('serve', 'http://127.0.0.1:47694')).toEqual({
        'import.meta.env.OMNIDASH_SAME_ORIGIN_PROJECTION': JSON.stringify('1'),
      });
    });

    it('says nothing for a build: no dev proxy serves a static bundle', () => {
      expect(sameOriginProjectionDefine('build', 'http://127.0.0.1:47694')).toEqual({});
    });

    it('says nothing when the overlay names no URL (the base is already same-origin)', () => {
      expect(sameOriginProjectionDefine('serve', '')).toEqual({});
      expect(sameOriginProjectionDefine('serve', '   ')).toEqual({});
    });
  });

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
