import { describe, expect, it } from 'vitest';
import { getWebSocketUrl } from './index';

const ENV_KEYS = [
  'VITE_WS_URL',
  'VITE_PROJECTION_API_URL',
  'VITE_HTTP_DATA_SOURCE_URL',
  'VITE_SQLITE_DATA_SOURCE_URL',
  'VITE_DATA_SOURCE',
] as const;

function withEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => void) {
  const original = { ...import.meta.env };
  for (const key of ENV_KEYS) {
    delete (import.meta.env as Record<string, unknown>)[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete (import.meta.env as Record<string, unknown>)[key];
    } else {
      (import.meta.env as Record<string, unknown>)[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (key in original) {
        (import.meta.env as Record<string, unknown>)[key] = original[key as keyof typeof original];
      } else {
        delete (import.meta.env as Record<string, unknown>)[key];
      }
    }
  }
}

describe('getWebSocketUrl', () => {
  it('uses explicit VITE_WS_URL first', () => {
    withEnv(
      {
        VITE_WS_URL: 'wss://explicit.example/ws',
        VITE_PROJECTION_API_URL: 'http://projection.example:13002',
      },
      () => {
        expect(getWebSocketUrl()).toBe('wss://explicit.example/ws');
      },
    );
  });

  it('derives from VITE_PROJECTION_API_URL when projection proxy mode is configured', () => {
    withEnv({ VITE_PROJECTION_API_URL: 'http://projection.example:13002/' }, () => {
      expect(getWebSocketUrl()).toBe('ws://projection.example:13002/ws');
    });
  });

  it('derives secure websocket URLs from https projection backends', () => {
    withEnv({ VITE_PROJECTION_API_URL: 'https://projection.example' }, () => {
      expect(getWebSocketUrl()).toBe('wss://projection.example/ws');
    });
  });

  it('falls back to VITE_HTTP_DATA_SOURCE_URL when no projection backend is configured', () => {
    withEnv({ VITE_HTTP_DATA_SOURCE_URL: 'http://bridge.example:3002' }, () => {
      expect(getWebSocketUrl()).toBe('ws://bridge.example:3002/ws');
    });
  });

  it('uses the sqlite data-source URL in sqlite mode', () => {
    withEnv(
      {
        VITE_DATA_SOURCE: 'sqlite',
        VITE_SQLITE_DATA_SOURCE_URL: 'http://sqlite.example:3002',
      },
      () => {
        expect(getWebSocketUrl()).toBe('ws://sqlite.example:3002/ws');
      },
    );
  });

  it('falls back to the generated contract default when no override is configured', () => {
    withEnv({}, () => {
      expect(getWebSocketUrl()).toBe('ws://localhost:3002/ws');
    });
  });
});
