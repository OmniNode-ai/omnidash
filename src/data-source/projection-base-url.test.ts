import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveProjectionBaseUrl, projectionUrl } from './projection-base-url';

// Helper to stub import.meta.env values for a single assertion.
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const original = { ...import.meta.env };
  Object.assign(import.meta.env, env);
  try {
    fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (k in original) {
        (import.meta.env as Record<string, unknown>)[k] = original[k as keyof typeof original];
      } else {
        delete (import.meta.env as Record<string, unknown>)[k];
      }
    }
  }
}

describe('resolveProjectionBaseUrl (OMN-12833 A2.5)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null in file mode (no projection backend)', () => {
    withEnv({ VITE_DATA_SOURCE: 'file' }, () => {
      expect(resolveProjectionBaseUrl()).toBeNull();
    });
  });

  it('returns a relative base ("") when VITE_PROJECTION_API_URL is set (proxy mode)', () => {
    withEnv(
      {
        VITE_DATA_SOURCE: 'http',
        VITE_PROJECTION_API_URL: 'http://backend-a:13002/',
        VITE_HTTP_DATA_SOURCE_URL: 'http://backend-b:3002',
      },
      () => {
        // Same-origin relative path; the serving layer proxies /projection/* to
        // the one backend, avoiding cross-origin CORS while staying one-backend.
        expect(resolveProjectionBaseUrl()).toBe('');
      },
    );
  });

  it('falls back to absolute VITE_HTTP_DATA_SOURCE_URL when no projection proxy is configured', () => {
    withEnv(
      { VITE_DATA_SOURCE: 'http', VITE_HTTP_DATA_SOURCE_URL: 'http://backend-b:3002/' },
      () => {
        expect(resolveProjectionBaseUrl()).toBe('http://backend-b:3002');
      },
    );
  });

  it('builds a same-origin /projection/{topic} URL in proxy mode', () => {
    withEnv(
      { VITE_DATA_SOURCE: 'http', VITE_PROJECTION_API_URL: 'http://backend-a:13002' },
      () => {
        expect(projectionUrl('onex.snapshot.projection.delegation.summary.v1')).toBe(
          '/projection/onex.snapshot.projection.delegation.summary.v1',
        );
        expect(
          projectionUrl('onex.snapshot.projection.delegation.correlation-trace.v1', 'correlation_id=abc'),
        ).toBe(
          '/projection/onex.snapshot.projection.delegation.correlation-trace.v1?correlation_id=abc',
        );
      },
    );
  });

  it('builds an absolute /projection/{topic} URL when using an absolute base', () => {
    withEnv(
      { VITE_DATA_SOURCE: 'http', VITE_HTTP_DATA_SOURCE_URL: 'http://backend-b:3002' },
      () => {
        expect(projectionUrl('onex.snapshot.projection.delegation.summary.v1')).toBe(
          'http://backend-b:3002/projection/onex.snapshot.projection.delegation.summary.v1',
        );
      },
    );
  });

  it('throws if projectionUrl is called in file mode', () => {
    withEnv({ VITE_DATA_SOURCE: 'file' }, () => {
      expect(() => projectionUrl('x')).toThrow(/file mode/);
    });
  });
});
