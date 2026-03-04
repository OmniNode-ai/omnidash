import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';
import { type Server } from 'http';

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Dynamically import vite and plugins only in development to avoid requiring them at runtime
  // in production where they are not installed (devDependencies only).
  const { createServer: createViteServer, createLogger } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { default: runtimeErrorOverlay } = await import('@replit/vite-plugin-runtime-error-modal');
  const { nanoid } = await import('nanoid');

  const viteLogger = createLogger();

  // Inline vite config to avoid importing vite.config.ts (which has static vite imports
  // that would get bundled into dist/index.js and fail at module load in production).
  const resolvedAliases = {
    '@': path.resolve(import.meta.dirname, '..', 'client', 'src'),
    '@shared': path.resolve(import.meta.dirname, '..', 'shared'),
    '@assets': path.resolve(import.meta.dirname, '..', 'attached_assets'),
  };

  const viteConfig = {
    plugins: [react(), runtimeErrorOverlay()],
    resolve: { alias: resolvedAliases },
    root: path.resolve(import.meta.dirname, '..', 'client'),
    server: { fs: { strict: true, deny: ['**/.*'] } },
  };

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: 'custom',
  });

  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(import.meta.dirname, '..', 'client', 'index.html');

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, 'utf-8');
      const id = nanoid();
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${id}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, 'public');

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}
