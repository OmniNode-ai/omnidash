import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';

type SessionStore = session.Store;

let _store: SessionStore | null = null;

function buildStore(): SessionStore {
  const url = process.env.SESSION_STORE_URL;
  if (url) {
    const client = createClient({ url });
    // Attach error listener before connect() so unhandled 'error' events
    // (e.g. reconnect failures after initial success) don't crash the process.
    client.on('error', (err) => {
      console.error('[omnidash session] Redis error:', err);
    });
    client.connect().catch((err) => {
      console.error('[omnidash session] Redis connect failed:', err);
    });
    return new RedisStore({ client });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[omnidash session] SESSION_STORE_URL is required in production; set it to a Redis URL.');
  }
  // No Redis configured — in-memory store for local dev only.
  return new session.MemoryStore();
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
