import express from 'express';
import compression from 'compression';
import http from 'http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes.js';
import { authMiddleware } from './auth-middleware.js';
import { getSessionMiddleware, getStore } from './session.js';
import { getKeycloak } from './keycloak.js';
import { shouldProtectBrowserNavigation } from './auth-navigation.js';
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
  type CapabilityDeclarationEnvelope,
} from './renderer-capability-producer.js';
import { webRendererCapability } from '../shared/types/web-renderer-capability.js';
import { invokeRuntimeCommand } from './runtime-skill-client.js';

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

// The cluster ingress terminates TLS and forwards plain HTTP to this pod, so
// req.protocol reports "http" unless the X-Forwarded-* headers are trusted.
// keycloak-connect builds its OAuth redirect_uri from req.protocol, so without
// this it sends Keycloak an http:// callback, which is not a registered redirect
// URI on the omnidash client, and login fails with 400 before the SPA ever loads.
// 1 = trust exactly one hop (the ingress); do not widen this without a reason,
// since a blanket trust lets clients spoof X-Forwarded-For.
app.set('trust proxy', 1);

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
const keycloak = getKeycloak(getStore());
app.use(keycloak.middleware({ logout: '/logout' }));

// Only top-level SPA document navigations may initiate Keycloak login. Protecting
// projection reads, favicon requests, or static subresources creates competing
// authorization-code flows in the same session and overwrites the saved callback
// URI. Non-document requests fall through to the normal 401/403 auth boundary.
keycloak.redirectToLogin = shouldProtectBrowserNavigation;
const protectBrowserNavigation = keycloak.protect();
app.use((req, res, next) => {
  if (PUBLIC_PATHS.has(req.path) || !shouldProtectBrowserNavigation(req)) return next();
  return protectBrowserNavigation(req, res, next);
});

const authConfig = loadAuthConfig();
// OMN-10875: self-service onboarding routes mount BEFORE the tenant gate —
// a brand-new user's token has no tenant claim yet, and the gate would 403
// exactly the users onboarding exists for.
app.use(buildOnboardingRouter(loadOnboardingConfig(), authConfig));
// OMN-13824 / OMN-1636: tenant auth gate. Contract-driven (auth.tenant_mode);
// pass-through when disabled. When required, the verified tenant id from the
// OIDC token is threaded through AsyncLocalStorage into the Postgres reader.
// PUBLIC_PATHS bypass the gate so health-probe and runtime-config are never
// blocked by the tenant check, even when tenant_mode is required.
const tenantMiddleware = createTenantMiddleware({ config: authConfig });
app.use((req, res, next) => {
  if (PUBLIC_PATHS.has(req.path)) return next();
  return tenantMiddleware(req, res, next);
});

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
// process now serves HTTP projection reads and the generic runtime HTTP edge only.
// Reintroducing a client-side socket is guarded by local/no-projection-websocket.

// Only start listening when this file is the entrypoint — importing it from
// a test or another module must not bind to a port. ESM equivalent of the
// `require.main === module` idiom.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let capabilityHeartbeat: CapabilityHeartbeatHandle | null = null;

  // OMN-14974: capability declarations use the generic runtime edge. The
  // runtime resolves the contract topic and owns the broker/IAM lifecycle.
  const heartbeatConfig = loadCapabilityHeartbeatConfig();
  if (heartbeatConfig.enabled) {
    capabilityHeartbeat = startCapabilityHeartbeat({
      intervalMs: heartbeatConfig.intervalMs,
      input: { capability: webRendererCapability() },
      deps: {
        publish: async (_topic, value) => {
          const envelope = value as CapabilityDeclarationEnvelope;
          await invokeRuntimeCommand({
            commandName: 'node_renderer_capability_projection',
            payload: envelope.payload,
            correlationId: envelope.correlation_id,
            timeoutMs: 10_000,
          });
        },
      },
    });
    console.log(
      `[omnidash server] renderer capability heartbeat started through runtime edge (every ${heartbeatConfig.intervalMs}ms)`,
    );
  }

  const shutdown = () => {
    capabilityHeartbeat?.stop();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  httpServer.listen(PORT, () => {
    console.log(`[omnidash server] Listening on port ${PORT}`);
  });
}
