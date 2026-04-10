import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), vanillaExtractPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    server: {
      port: 3001,
      proxy: {
        // Routes /llm-proxy/* → LLM host to avoid CORS in dev
        // VITE_LLM_BASE_URL holds host only (no /v1 suffix)
        '/llm-proxy': {
          target: env.VITE_LLM_BASE_URL ?? 'http://<lan-ip-redacted>:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/llm-proxy/, ''),
        },
      },
    },
  };
});
