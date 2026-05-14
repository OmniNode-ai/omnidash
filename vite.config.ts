import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
        res.statusCode = 404;
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

  // OMN-10945: build proxy map. Both the LLM proxy and the delegation API
  // proxy are registered only when their respective env vars are set, so
  // the dev server does not silently forward to a hardcoded host.
  type ProxyEntry = { target: string; changeOrigin: boolean; rewrite: (p: string) => string };
  const proxyMap: Record<string, ProxyEntry> = {};

  if (env.VITE_LLM_BASE_URL) {
    // Routes /llm-proxy/* → LLM host to avoid CORS in dev.
    // VITE_LLM_BASE_URL holds host only (no /v1 suffix).
    proxyMap['/llm-proxy'] = {
      target: env.VITE_LLM_BASE_URL,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/llm-proxy/, ''),
    };
  }

  if (env.VITE_PROJECTION_API_URL) {
    // Routes /api/delegation/* → projection API backend.
    // Used by src/services/delegation-api.ts in dev when the projection API
    // is running. VITE_PROJECTION_API_URL holds the base URL of the API server.
    proxyMap['/api/delegation'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (p) => p,
    };
  }

  return {
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
