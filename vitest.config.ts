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
    // Exclude the typography-refactor compliance scorecard from the default
    // test run. It's a phase-by-phase progress indicator that starts ~95%
    // RED; running it in the default suite would falsely red the CI until
    // the refactor completes. Task 39 (Proof of Life) removes this line and
    // promotes the compliance file to a permanent regression gate.
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/.idea/**',
      '**/.git/**', '**/.cache/**',
      'src/typography-compliance.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
