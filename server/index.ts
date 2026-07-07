import express from 'express';
import compression from 'compression';
import http from 'http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes.js';
import { authMiddleware } from './auth-middleware.js';
import { getSessionMiddleware } from './session.js';
import { getKeycloak } from './keycloak.js';
import { connectProducer, disconnectProducer } from './kafka-producer.js';
import {
  loadAuthConfig,
  loadCapabilityHeartbeatConfig,
  loadOnboardingConfig,
} from './data-source-contract.js';
import { createTenantMiddleware } from './auth/tenant-middleware.js';
import { buildOnboardingRouter } from './onboarding/bootstrap.js';
import {
  startCapabilityHeartbeat,
  type CapabilityHeartbeatHandle,
} from './renderer-capability-producer.js';
import { webRendererCapability } from '../shared/types/web-renderer-capability.js';

const PORT = parseInt(process.env.PORT ?? '3002', 10);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_ORIGINS: ReadonlySet<string> = (() => {
  const origins = new Set<string>(['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173']);
  const base = process.env.OMNIDASH_BASE_URL;
  if (base) origins.add(base.replace(/\/$/, ''));
  return origins;
})();

// Public paths that bypass JWT auth.
const PUBLIC_PATHS = new Set(['/api/health-probe', '/api/runtime-config']);

export const app = express();

// Health probe — registered before auth so k8s liveness/readiness checks never require a token.
app.get('/api/health-probe', (_req, res) => {
  res.json({ status: 'ok' });
});

// OMN-14152: gzip/deflate every response (JSON reads + the static SPA bundle alike).
app.use(compression());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json());

// Session middleware — must run before keycloak and auth so req.session is
// populated when authMiddleware checks for a session-stored Keycloak grant.
const sessionMiddleware = getSessionMiddleware();
app.use(sessionMiddleware);

// Keycloak middleware — handles OAuth callback, /logout, and backchannel
// /k_logout. Must run after session middleware.
const keycloak = getKeycloak();
app.use(keycloak.middleware({ logout: '/logout' }));

// For browser (non-API) routes, redirect unauthenticated users to Keycloak
// login instead of returning 401. API paths always get 401 from authMiddleware.
keycloak.redirectToLogin = (req) => !req.path.startsWith('/api/');
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || PUBLIC_PATHS.has(req.path)) return next();
  return keycloak.protect()(req, res, next);
});

const authConfig = loadAuthConfig();
// OMN-10875: self-service onboarding routes mount BEFORE the tenant gate —
// a brand-new user's token has no tenant claim yet, and the gate would 403
// exactly the users onboarding exists for.
app.use(buildOnboardingRouter(loadOnboardingConfig(), authConfig));
// OMN-13824 / OMN-1636: tenant auth gate. Contract-driven (auth.tenant_mode);
// pass-through when disabled. When required, the verified tenant id from the
// OIDC token is threaded through AsyncLocalStorage into the Postgres reader.
app.use(createTenantMiddleware({ config: authConfig }));

// Auth — skips public paths; checks session first (browser), then Bearer
// token (API clients). Attaches req.tenant for all downstream handlers.
app.use((req, res, next) => {
  if (PUBLIC_PATHS.has(req.path)) return next();
  return authMiddleware(req, res, next);
});

app.use(routes);

// OMN-14152: co-locate the built SPA on this server so one process serves the
// dashboard HTML, the /api/* routes, and /projection/* reads — same-origin, no
// CORS, no second static host to deploy. `dist/` is produced by `npm run build`
// and is gitignored; in a checkout without a build it is simply empty and this
// middleware serves nothing (routes above still work).
const distDir = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distDir));
// SPA history-fallback: any GET that isn't an API/projection read and didn't
// match a static asset above falls through to index.html so client-side
// routing (wouter) can resolve the path. API/projection misses must still 404
// normally rather than being masked by the app shell.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/projection/')) {
    next();
    return;
  }
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) next(err);
  });
});

const httpServer = http.createServer(app);
// OMN-14152: explicit, generous socket timeouts. Traffic to this box can ride
// a lossy/relayed network path (e.g. a Tailscale DERP hop with real packet
// loss), so a slow-but-progressing download must not be cut mid-transfer.
// Node's own default `server.timeout` is already 0 (no timeout) as of
// Node 13+, but stating it here removes any doubt and documents intent —
// this is not an accident of the runtime default. keepAliveTimeout only
// bounds IDLE time between requests on a persistent connection (unrelated to
// an in-flight response), left at Node's default.
httpServer.timeout = 0;

// OMN-12969: the `/ws` WebSocket invalidation bridge was removed. It accepted
// connections and exposed a `broadcast()` helper, but nothing ever called
// `broadcast()` (no Kafka consumer was ever wired to it), so it never delivered
// an INVALIDATE frame. The deployed dashboard targets the FastAPI projection
// backend for live data, which has no `/ws` route — so the browser's upgrade was
// rejected (403). Panels are poll-only via useProjectionQuery; this Express
// process now serves HTTP projection reads and the Kafka dispatch producer only.
// Reintroducing a client-side socket is guarded by local/no-projection-websocket.

// Only start listening when this file is the entrypoint — importing it from
// a test or another module must not bind to a port. ESM equivalent of the
// `require.main === module` idiom.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let capabilityHeartbeat: CapabilityHeartbeatHandle | null = null;

  connectProducer()
    .then(() => {
      // OMN-13131 (W-cap): once the producer is connected, declare the web
      // renderer's capability onto the bus and keep the heartbeat fresh so the
      // W5 Renderer Capability Registry projection does not flag this renderer
      // is_degraded. Config-driven; auto-disabled when no broker is configured.
      const heartbeatConfig = loadCapabilityHeartbeatConfig();
      if (heartbeatConfig.enabled) {
        capabilityHeartbeat = startCapabilityHeartbeat({
          intervalMs: heartbeatConfig.intervalMs,
          input: { capability: webRendererCapability() },
        });
        console.log(
          `[omnidash server] renderer capability heartbeat started (every ${heartbeatConfig.intervalMs}ms)`,
        );
      }
    })
    .catch((err) => {
      console.warn('[omnidash server] Kafka producer connect failed (dispatch endpoint will return 503):', err);
    });

  const shutdown = () => {
    capabilityHeartbeat?.stop();
    disconnectProducer().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  httpServer.listen(PORT, () => {
    console.log(`[omnidash server] Listening on port ${PORT}`);
  });
}
