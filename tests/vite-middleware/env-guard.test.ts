import { describe, expect, it } from 'vitest';

import {
  assertProjectionEnv,
  findProjectionEnvViolations,
  formatProjectionEnvError,
} from '../../vite.env-guard';

describe('projection env guard (OMN-12400)', () => {
  // ── Positive: stale .env.local value pinned at a dead port must be caught ──

  it('flags the historical stale .env.local value (localhost:8765)', () => {
    const violations = findProjectionEnvViolations({
      VITE_PROJECTION_API_URL: 'http://localhost:8765',
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.key).toBe('VITE_PROJECTION_API_URL');
    expect(violations[0]?.value).toBe('http://localhost:8765');
  });

  it('throws a loud, explanatory error for a banned projection port', () => {
    expect(() =>
      assertProjectionEnv({ VITE_PROJECTION_API_URL: 'http://localhost:8765' }),
    ).toThrowError(/OMN-12400/);
    expect(() =>
      assertProjectionEnv({ VITE_PROJECTION_API_URL: 'http://localhost:8765' }),
    ).toThrowError(/\.env\.local/);
  });

  it('flags the merge-proxy port (:3010) and retired alt-backend (:3002)', () => {
    expect(
      findProjectionEnvViolations({ VITE_PROJECTION_API_URL: 'http://localhost:3010' }),
    ).toHaveLength(1);
    expect(
      findProjectionEnvViolations({ VITE_HTTP_DATA_SOURCE_URL: 'http://localhost:3002' }),
    ).toHaveLength(1);
  });

  it('reports every offending key when several are stale at once', () => {
    const violations = findProjectionEnvViolations({
      VITE_PROJECTION_API_URL: 'http://localhost:8765',
      VITE_HTTP_DATA_SOURCE_URL: 'http://localhost:3010',
    });
    expect(violations.map((v) => v.key).sort()).toEqual([
      'VITE_HTTP_DATA_SOURCE_URL',
      'VITE_PROJECTION_API_URL',
    ]);
    const msg = formatProjectionEnvError(violations);
    expect(msg).toContain('VITE_PROJECTION_API_URL=http://localhost:8765');
    expect(msg).toContain('VITE_HTTP_DATA_SOURCE_URL=http://localhost:3010');
  });

  // ── Negative: the authoritative Express bridge and absent values pass ──

  it('passes the authoritative Express bridge (:3003)', () => {
    expect(
      findProjectionEnvViolations({ VITE_PROJECTION_API_URL: 'http://localhost:3003' }),
    ).toHaveLength(0);
    expect(() =>
      assertProjectionEnv({ VITE_PROJECTION_API_URL: 'http://localhost:3003' }),
    ).not.toThrow();
  });

  it('passes a high-numbered lane projection port (:13002)', () => {
    // :13002 must NOT be a false positive — the banned set uses word-boundary
    // matching so :3002 does not match inside :13002.
    expect(
      findProjectionEnvViolations({ VITE_PROJECTION_API_URL: 'http://projection-host:13002' }),
    ).toHaveLength(0);
  });

  it('passes an empty / absent env (no projection keys set)', () => {
    expect(findProjectionEnvViolations({})).toHaveLength(0);
    expect(() => assertProjectionEnv({})).not.toThrow();
    expect(() =>
      assertProjectionEnv({ VITE_PROJECTION_API_URL: undefined }),
    ).not.toThrow();
  });
});
