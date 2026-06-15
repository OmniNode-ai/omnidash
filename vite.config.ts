import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildProxyMap } from './vite.proxy-config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `next` is part of the Connect middleware contract but neither of our
 * handlers calls it (each request resolves with res.end()). Typed for
 * clarity rather than borrowed from `connect` to avoid pulling another
 * type-only dep just for this signature.
 */
type ConnectNext = (err?: unknown) => void;

// OMN-10945: SQLite inline queries removed from fixturesMiddleware.
// Delegation data now flows through the contract-backed delegation-api adapter
// (src/services/delegation-api.ts) via the Express bridge (server/routes.ts →
// SqliteProjectionReader). The /_fixtures middleware only serves static JSON
// fixture files — no direct SQLite access in the Vite dev server.
export function fixturesMiddleware(opts: { root: string }) {
  const root = opts.root;

  const handler = (req: IncomingMessage, res: ServerResponse, _next: ConnectNext) => {
    // NOTE: req.url arrives WITHOUT the /_fixtures prefix (Vite strips it).
    const urlPath = (req.url ?? '').split('?')[0];
    const parts = urlPath.split('/').filter(Boolean);

    if (parts.length === 1 && parts[0] === 'registry.json') {
      const file = path.join(root, 'registry.json');
      if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      return res.end(readFileSync(file));
    }

    if (parts.length === 2 && parts[1] === 'index.json') {
      const dir = path.join(root, parts[0]!);
      if (!existsSync(dir) || !statSync(dir).isDirectory()) { res.statusCode = 404; return res.end(); }
      const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(files));
    }

    if (parts.length === 2 && parts[1]!.endsWith('.json')) {
      const file = path.join(root, parts[0]!, parts[1]!);
      if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      return res.end(readFileSync(file));
    }

    res.statusCode = 404;
    return res.end();
  };

  const plugin = {
    name: 'fixtures-middleware',
    configureServer(server: any) {
      server.middlewares.use('/_fixtures', handler);
    },
  };

  return { plugin, handler };
}

export function layoutsMiddleware(opts: { root: string }) {
  const root = opts.root;
  const handler = (req: IncomingMessage, res: ServerResponse, _next: ConnectNext) => {
    // NOTE: req.url arrives WITHOUT the /_layouts prefix (Vite strips it).
    const urlPath = (req.url ?? '').split('?')[0];
    const parts = urlPath.split('/').filter(Boolean);

    // Only handle single-segment paths: /<name>
    if (parts.length !== 1) {
      res.statusCode = 404;
      return res.end();
    }

    const name = parts[0]!;
    // Guard against path traversal: reject names containing path separators or dot-only segments.
    if (name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
      res.statusCode = 400;
      return res.end();
    }
    const file = path.join(root, `${name}.json`);

    if (req.method === 'GET') {
      if (!existsSync(file)) {
        // OMN-12995: absence of a saved layout is a normal state, not an error.
        // Return an empty 204 instead of 404 so the dev console stays clean on
        // first load (no saved layout yet). The client treats 204 — and 404 for
        // back-compat — as "no saved layout".
        res.statusCode = 204;
        return res.end();
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(readFileSync(file));
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          // Validate JSON before writing
          JSON.parse(body);
          mkdirSync(root, { recursive: true });
          writeFileSync(file, body, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(body);
        } catch (_err) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    res.statusCode = 404;
    return res.end();
  };

  const plugin = {
    name: 'layouts-middleware',
    configureServer(server: any) {
      server.middlewares.use('/_layouts', handler);
    },
  };

  return { plugin, handler };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const { plugin: fixturesPlugin } = fixturesMiddleware({
    root: path.resolve(__dirname, 'fixtures'),
  });
  const { plugin: layoutsPlugin } = layoutsMiddleware({
    root: path.resolve(__dirname, 'dashboard-layouts'),
  });
  const proxyMap = buildProxyMap(env);

  return {
    envPrefix: ['VITE_'],
    plugins: [react(), vanillaExtractPlugin(), fixturesPlugin, layoutsPlugin],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    build: {
      rollupOptions: {
        // better-sqlite3 and pg are server-side modules. They must never
        // be bundled by Vite — only server/routes.ts uses them at runtime.
        external: ['better-sqlite3', 'pg'],
      },
    },
    optimizeDeps: {
      exclude: ['better-sqlite3', 'pg'],
    },
    server: {
      port: Number(env.VITE_DEV_PORT ?? 3001),
      proxy: Object.keys(proxyMap).length > 0 ? proxyMap : undefined,
    },
  };
});
