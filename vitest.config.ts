import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    globals: true,
    css: { modules: { classNameStrategy: 'non-scoped' } },
    // The typography compliance scorecard (src/typography-compliance.test.ts)
    // is a permanent regression gate as of OMN-98. Its Phase 5 case
    // dynamically imports ESLint's module graph. Cold-start is ~8s in
    // isolation but under concurrent-test pressure (370+ tests running
    // across jsdom workers) it climbs to ~47s in practice. 60s ceiling
    // accommodates this one slow test without flake. Normal tests finish
    // in ms; this ceiling doesn't affect their behavior.
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
