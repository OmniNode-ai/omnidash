import express from 'express';
import http from 'http';
import { fileURLToPath } from 'node:url';
import routes from './routes.js';
import { connectProducer, disconnectProducer } from './kafka-producer.js';
import { loadAuthConfig, loadCapabilityHeartbeatConfig } from './data-source-contract.js';
import { createTenantMiddleware } from './auth/tenant-middleware.js';
import {
  startCapabilityHeartbeat,
  type CapabilityHeartbeatHandle,
} from './renderer-capability-producer.js';
import { webRendererCapability } from '../shared/types/web-renderer-capability.js';

const PORT = parseInt(process.env.PORT ?? '3002', 10);

export const app = express();
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
app.use(express.json());
// OMN-13824 / OMN-1636: tenant auth gate. Contract-driven (auth.tenant_mode);
// pass-through when disabled. When required, the verified tenant id from the
// OIDC token is threaded through AsyncLocalStorage into the Postgres reader,
// which scopes every read with the RLS GUC `app.tenant_id`.
app.use(createTenantMiddleware({ config: loadAuthConfig() }));
app.use(routes);

const httpServer = http.createServer(app);

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
