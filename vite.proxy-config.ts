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

  return proxyMap;
}
