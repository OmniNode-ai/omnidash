import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';

type SessionStore = session.Store;
function createRedisClient(url: string) {
  return createClient({ url });
}

type RedisClient = ReturnType<typeof createRedisClient>;

let _store: SessionStore | null = null;
let _redisClient: RedisClient | null = null;
let _redisConnect: Promise<void> | null = null;
let _redisConnectError: Error | null = null;

/** Never log Redis errors verbatim: client errors can carry connection details. */
export function redisErrorStatus(error: unknown): 'timeout' | 'unavailable' | 'error' {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code : undefined;
  return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT' ? 'unavailable' : 'error';
}

function reportRedisError(event: 'session_redis_error' | 'session_redis_connect_failed', error: unknown): void {
  console.error(JSON.stringify({ event, status: redisErrorStatus(error) }));
}

function buildStore(): SessionStore {
  const url = process.env.SESSION_STORE_URL;
  if (url) {
    const client = createRedisClient(url);
    _redisClient = client;
    // Attach error listener before connect() so unhandled 'error' events
    // (e.g. reconnect failures after initial success) don't crash the process.
    client.on('error', (err) => {
      reportRedisError('session_redis_error', err);
    });
    _redisConnect = client.connect().then(() => undefined).catch((err: unknown) => {
      reportRedisError('session_redis_connect_failed', err);
      _redisConnectError = err instanceof Error ? err : new Error('Redis connect failed');
    });
    return new RedisStore({ client });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[omnidash session] SESSION_STORE_URL is required in production; set it to a Redis URL.');
  }
  // No Redis configured — in-memory store for local dev only.
  return new session.MemoryStore();
}

function oidcKey(sessionId: string, state: string): string {
  return `omnidash:oidc-pkce:${sessionId}:${state}`;
}

type OidcRedisClient = Pick<RedisClient, 'set' | 'getDel'>;

export function createOidcStateStore(client: OidcRedisClient) {
  return {
    async store(sessionId: string, state: string, value: unknown, ttlMs: number): Promise<void> {
      const stored = await client.set(oidcKey(sessionId, state), JSON.stringify(value), { NX: true, PX: ttlMs });
      if (stored !== 'OK') throw new Error('could not store OIDC login state');
    },
    async claim(sessionId: string, state: string): Promise<unknown | null> {
      const raw = await client.getDel(oidcKey(sessionId, state));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
  };
}

async function oidcRedis(): Promise<RedisClient> {
  if (!_redisClient || !_redisConnect) {
    throw new Error('Redis-backed SESSION_STORE_URL is required for browser OIDC login');
  }
  await _redisConnect;
  if (_redisConnectError || !_redisClient.isReady) {
    throw new Error('Redis session store is not ready for browser OIDC login');
  }
  return _redisClient;
}

/** Store a short-lived login transaction outside the cookie session. */
export async function storeOidcLoginState(
  sessionId: string,
  state: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  const store = createOidcStateStore(await oidcRedis());
  await store.store(sessionId, state, value, ttlMs);
}

/** Atomically consume an OIDC login transaction. Redis GETDEL permits one callback only. */
export async function claimOidcLoginState(sessionId: string, state: string): Promise<unknown | null> {
  return createOidcStateStore(await oidcRedis()).claim(sessionId, state);
}

export function getStore(): SessionStore {
  if (!_store) _store = buildStore();
  return _store;
}

export function getSessionMiddleware() {
  const store = getStore();

  return session({
    store,
    secret: (() => {
      const s = process.env.SESSION_SECRET;
      if (!s && process.env.NODE_ENV === 'production') {
        throw new Error('[omnidash session] SESSION_SECRET is required in production.');
      }
      return s ?? 'dev-secret-change-me';
    })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours — matches default Keycloak session TTL
    },
  });
}
