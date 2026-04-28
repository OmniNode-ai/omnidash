import express from 'express';
import http from 'http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import routes from './routes.js';

const PORT = parseInt(process.env.PORT ?? '3002', 10);

export const app = express();
app.use(express.json());
app.use(routes);

const httpServer = http.createServer(app);

// ── WebSocket bridge (/ws) ────────────────────────────────────────────────────
// Forwards invalidation signals to the Vite SPA. Components subscribe to a
// channel (e.g. "cost-trends") and receive INVALIDATE messages so they can
// call queryClient.invalidateQueries() without polling.

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://localhost`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  }
});

type Subscription = Set<string>;
export const clients = new Map<WebSocket, Subscription>();

/**
 * Filtered broadcast helper. Sends an INVALIDATE frame to every client whose
 * subscription set contains either the '*' wildcard or the exact channel.
 * Tested in isolation by stubbing the `clients` map with mock WebSocket
 * instances (server/broadcast.test.ts).
 */
export function broadcast(channel: string, data: unknown) {
  const msg = JSON.stringify({ type: 'INVALIDATE', channel, data, ts: Date.now() });
  for (const [ws, subs] of clients) {
    if (ws.readyState === WebSocket.OPEN && (subs.has('*') || subs.has(channel))) {
      ws.send(msg);
    }
  }
}

wss.on('connection', (ws: WebSocket) => {
  const subs: Subscription = new Set(['*']);
  clients.set(ws, subs);

  ws.send(JSON.stringify({ type: 'CONNECTED', ts: Date.now() }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === 'subscribe' && Array.isArray(msg.channels)) {
        subs.clear();
        for (const ch of msg.channels) subs.add(String(ch));
      }
    } catch { /* ignore malformed frames */ }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// Only start listening when this file is the entrypoint — importing it from
// a test or another module must not bind to a port. ESM equivalent of the
// `require.main === module` idiom.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  httpServer.listen(PORT, () => {
    console.log(`[omnidash server] Listening on port ${PORT}`);
  });
}
