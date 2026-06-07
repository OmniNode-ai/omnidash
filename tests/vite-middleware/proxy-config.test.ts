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
});
