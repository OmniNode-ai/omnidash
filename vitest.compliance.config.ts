// Standalone vitest config for running the typography compliance scorecard.
//
// The compliance test (src/typography-compliance.test.ts) is EXCLUDED from the
// default vitest run (see vitest.config.ts) so the ~95% RED state during the
// refactor doesn't pollute `npm test`. This config is the explicit way to run
// the compliance file for progress-measurement purposes:
//
//   npx vitest run --config vitest.compliance.config.ts
//
// Task 39 (Proof of Life) removes both this config file AND the exclude line
// in vitest.config.ts, promoting the compliance file to a permanent regression
// gate that runs on every `npm test`.
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
    include: ['src/typography-compliance.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
