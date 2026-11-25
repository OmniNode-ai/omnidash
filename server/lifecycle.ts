// OMN-26665 AC2: graceful shutdown and a real readiness probe.
//
// SIGTERM used to call process.exit(0) at once, so a rollout cut every read in flight. Now the
// server stops taking new connections, lets the reads already running finish, then exits; a read
// that outlives the grace period is cut and the exit code is 1. The probe used to answer ok
// unconditionally; it now fails until the built bundle exists and the projection API answers, and
// while the pod is draining.
import { existsSync } from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
import type { RequestHandler } from 'express';

export interface ReadinessChecks {
  bundle: boolean;
  projection: boolean;
  draining: boolean;
}

export interface LifecycleOptions {
  /** Directory holding the built SPA (must contain index.html). */
  distDir: string;
  /** Resolves true when the projection API answers. May reject or hang; both read as false. */
  checkProjection: () => Promise<boolean>;
  /** How long a shutdown waits for reads in flight before cutting them. */
  graceMs: number;
  stopHeartbeat: () => void;
  exit: (code: number) => void;
}

/** Per-check deadline: a probe must answer well inside a kubelet's own timeout. */
const PROJECTION_DEADLINE_MS = 3_000;

export interface Lifecycle {
  middleware: RequestHandler;
  readinessHandler: RequestHandler;
  readiness: () => Promise<{ ready: boolean; checks: ReadinessChecks }>;
  attach: (s: http.Server) => void;
  shutdown: () => Promise<void>;
}

export function createLifecycle(opts: LifecycleOptions): Lifecycle {
  let server: http.Server | null = null;
  let draining = false;
  let shutdownPromise: Promise<void> | null = null;

  async function projectionAnswers(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), PROJECTION_DEADLINE_MS);
    });
    try {
      return await Promise.race([opts.checkProjection().catch(() => false), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function readiness(): Promise<{ ready: boolean; checks: ReadinessChecks }> {
    const bundle = existsSync(path.join(opts.distDir, 'index.html'));
    const projection = await projectionAnswers();
    const checks = { bundle, projection, draining };
    return { ready: bundle && projection && !draining, checks };
  }

  const readinessHandler: RequestHandler = (_req, res) => {
    void readiness().then(({ ready, checks }) => {
      res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'not_ready', checks });
    });
  };

  // New requests on a socket that was already open when SIGTERM landed get a 503 and the socket is
  // closed after it; the probe is exempt so it can say "draining". Reads already running are not touched.
  const middleware: RequestHandler = (req, res, next) => {
    if (draining && req.path !== '/api/health-probe') {
      res.set('Connection', 'close');
      res.status(503).json({ error: 'shutting_down' });
      return;
    }
    next();
  };

  function attach(s: http.Server): void {
    server = s;
  }

  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    draining = true;
    shutdownPromise = new Promise<void>((resolve) => {
      let code = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(forceTimer);
        opts.stopHeartbeat();
        opts.exit(code);
        resolve();
      };
      const forceTimer = setTimeout(() => {
        code = 1;
        server?.closeAllConnections();
        finish();
      }, opts.graceMs);
      if (!server) {
        finish();
        return;
      }
      // close() refuses new connections now and calls back once every active one has ended.
      server.close(() => finish());
      // Idle keep-alive sockets would otherwise hold close() open until they time out.
      server.closeIdleConnections();
    });
    return shutdownPromise;
  }

  return { middleware, readinessHandler, readiness, attach, shutdown };
}
