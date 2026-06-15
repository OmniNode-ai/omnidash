export type ProxyEntry = {
  target: string;
  changeOrigin: boolean;
  rewrite: (path: string) => string;
};

export function buildProxyMap(
  env: Record<string, string | undefined>,
): Record<string, ProxyEntry> {
  const proxyMap: Record<string, ProxyEntry> = {};
  if (env.VITE_LLM_BASE_URL) {
    proxyMap['/llm-proxy'] = {
      target: env.VITE_LLM_BASE_URL,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/llm-proxy/, ''),
    };
  }

  if (env.VITE_OMNIDASH_API_URL) {
    proxyMap['/api/delegation/trigger'] = {
      target: env.VITE_OMNIDASH_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
  }

  if (env.VITE_PROJECTION_API_URL) {
    proxyMap['/projection'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
    proxyMap['/api/projections'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
    proxyMap['/api/delegation'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
    proxyMap['/api/generate'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
    proxyMap['/api/compare'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
  }

  // OMN-12995: the Express dev server (`npm run dev:server`, default :3002)
  // owns the server-side settings endpoints (`/api/settings/feature-flags`,
  // `/api/runtime-config`) that read process.env. Plain `vite` dev does not run
  // Express, so without this proxy these requests fall through to the SPA
  // history fallback and return index.html. When VITE_OMNIDASH_SERVER_URL is
  // set, route them to the Express server. When unset, the panels fall back to
  // their explicit client-side config state (a normal local-dev mode, not an
  // error).
  if (env.VITE_OMNIDASH_SERVER_URL) {
    proxyMap['/api/settings'] = {
      target: env.VITE_OMNIDASH_SERVER_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
    proxyMap['/api/runtime-config'] = {
      target: env.VITE_OMNIDASH_SERVER_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
  }

  if (env.EVIDENCE_PROJECTION_API_URL) {
    proxyMap['/api/evidence-pipeline'] = {
      target: env.EVIDENCE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/evidence-pipeline/, ''),
    };
  }

  return proxyMap;
}
