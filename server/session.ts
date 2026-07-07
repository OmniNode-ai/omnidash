import session from 'express-session';
import { createClient } from 'redis';
import RedisStore from 'connect-redis';

let _store: RedisStore | null = null;

function buildStore(): RedisStore {
  const url = process.env.SESSION_STORE_URL;
  if (!url) {
    // No Redis configured — fall back to in-memory store (dev only).
    return undefined as unknown as RedisStore;
  }
  const client = createClient({ url });
  client.connect().catch((err) => {
    console.error('[omnidash session] Redis connect failed:', err);
  });
  return new RedisStore({ client });
}

export function getSessionMiddleware() {
  if (!_store) _store = buildStore();

  return session({
    store: _store ?? undefined,
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
