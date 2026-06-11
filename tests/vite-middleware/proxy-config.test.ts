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
});
