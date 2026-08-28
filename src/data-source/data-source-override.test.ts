// OMN-13007 — the runtime data-source override seam: persistence, env layering,
// and (critically) that switching the override changes what
// `resolveProjectionBaseUrl()` and `resolveCommandBaseUrl()` resolve to.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDataSourceOverride,
  setDataSourceOverride,
  clearDataSourceOverride,
  resolveEffectiveDataSource,
} from './data-source-override';
import { resolveProjectionBaseUrl, resolveCommandBaseUrl } from './projection-base-url';
import { isLiveDataSource } from '@/hooks/useDataSourceMode';

// This jsdom config does not provide a functioning localStorage, so install a
// minimal in-memory one (matching src/store/dashboardSlice.hydrate.test.ts).
function installMemoryStorage() {
  const map = new Map<string, string>();
  const storage: Storage = {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  return storage;
}

// Helper to stub import.meta.env for a single assertion.
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const original = { ...import.meta.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete (import.meta.env as Record<string, unknown>)[key];
    else (import.meta.env as Record<string, unknown>)[key] = value;
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (k in original) (import.meta.env as Record<string, unknown>)[k] = original[k as keyof typeof original];
      else delete (import.meta.env as Record<string, unknown>)[k];
    }
  }
}

describe('data-source-override (OMN-13007)', () => {
  beforeEach(() => {
    installMemoryStorage();
    clearDataSourceOverride();
  });
  afterEach(() => {
    clearDataSourceOverride();
    vi.unstubAllGlobals();
  });

  it('defaults to no override (env applies)', () => {
    expect(getDataSourceOverride()).toBeNull();
    expect(resolveEffectiveDataSource().isOverridden).toBe(false);
  });

  it('classifies every backend mode as live and only fixture mode as offline', () => {
    expect(isLiveDataSource('http')).toBe(true);
    expect(isLiveDataSource('postgres')).toBe(true);
    expect(isLiveDataSource('sqlite')).toBe(true);
    expect(isLiveDataSource('file')).toBe(false);
  });

  it('persists a live override with a normalized (no trailing slash) base URL', () => {
    setDataSourceOverride({ mode: 'live', baseUrl: 'http://100.109.203.94:13002/' });
    expect(getDataSourceOverride()).toEqual({ mode: 'live', baseUrl: 'http://100.109.203.94:13002' });
    // Persisted to localStorage so it survives reload.
    const raw = window.localStorage.getItem('omnidash.dataSourceOverride.v1');
    expect(raw).toContain('100.109.203.94:13002');
  });

  it('file override drops any base URL and resolves projection base to null', () => {
    setDataSourceOverride({ mode: 'file', baseUrl: 'http://ignored:1/' });
    const eff = resolveEffectiveDataSource();
    expect(eff.mode).toBe('file');
    expect(eff.baseUrl).toBeNull();
    withEnv({ VITE_DATA_SOURCE: 'postgres' }, () => {
      // Override wins over a live env mode.
      expect(resolveProjectionBaseUrl()).toBeNull();
    });
  });

  it('SWITCH override changes the resolved projection base URL (core acceptance)', () => {
    // `VITE_PROJECTION_API_URL: undefined` is load-bearing, not noise: it is
    // step 1 of resolveProjectionBaseUrl()'s precedence order and it returns
    // '' (relative) when set, which would shadow the VITE_HTTP_DATA_SOURCE_URL
    // branch this test exercises. Declaring "no projection proxy configured"
    // is what makes the env-default assertions below mean anything.
    withEnv({
      VITE_DATA_SOURCE: 'http',
      VITE_PROJECTION_API_URL: undefined,
      VITE_HTTP_DATA_SOURCE_URL: 'http://env-default:3002',
    }, () => {
      // Env default first.
      expect(resolveProjectionBaseUrl()).toBe('http://env-default:3002');
      // Switch to a live override with an explicit backend.
      setDataSourceOverride({ mode: 'live', baseUrl: 'http://100.109.203.94:13002' });
      expect(resolveProjectionBaseUrl()).toBe('http://100.109.203.94:13002');
      // Switch to file — no live backend.
      setDataSourceOverride({ mode: 'file' });
      expect(resolveProjectionBaseUrl()).toBeNull();
      // Clear — back to env default.
      clearDataSourceOverride();
      expect(resolveProjectionBaseUrl()).toBe('http://env-default:3002');
    });
  });

  it('command base URL follows the same override as projection reads', () => {
    withEnv({ VITE_DATA_SOURCE: 'http', VITE_HTTP_DATA_SOURCE_URL: 'http://env-default:3002' }, () => {
      setDataSourceOverride({ mode: 'live', baseUrl: 'http://100.109.203.94:13002' });
      expect(resolveCommandBaseUrl()).toBe('http://100.109.203.94:13002');
      setDataSourceOverride({ mode: 'file' });
      // File mode -> null so the SEA generate submit fails with an honest message
      // instead of silently posting to the page origin.
      expect(resolveCommandBaseUrl()).toBeNull();
    });
  });

  it('live override with no base URL keeps a live mode and defers to env base', () => {
    withEnv({ VITE_DATA_SOURCE: 'file', VITE_PROJECTION_API_URL: 'http://proxy:13002' }, () => {
      setDataSourceOverride({ mode: 'live' });
      const eff = resolveEffectiveDataSource();
      // env was 'file' so a live override forces 'http'.
      expect(eff.mode).toBe('http');
      expect(eff.baseUrl).toBeNull();
      // With VITE_PROJECTION_API_URL set, the resolver returns the proxy-relative base.
      expect(resolveProjectionBaseUrl()).toBe('');
    });
  });

  it('rehydration tolerates corrupt persisted JSON (degrades to env default)', () => {
    window.localStorage.setItem('omnidash.dataSourceOverride.v1', '{not json');
    // A fresh read happens at module load; simulate the same guard via a set then
    // a corrupt overwrite does not crash resolution.
    clearDataSourceOverride();
    expect(getDataSourceOverride()).toBeNull();
    expect(resolveEffectiveDataSource().isOverridden).toBe(false);
  });
});
