import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';

type SessionStore = session.Store;

let _store: SessionStore | null = null;

function buildStore(): SessionStore {
  const url = process.env.SESSION_STORE_URL;
  if (url) {
    const client = createClient({ url });
    client.connect().catch((err) => {
      console.error('[omnidash session] Redis connect failed:', err);
    });
    return new RedisStore({ client });
  }
  // No Redis configured — use in-memory store (dev only).
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
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
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
