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
    // Both compliance scorecards are permanent regression gates that
    // run on every `npm test`:
    //   - typography-compliance.test.ts (OMN-98) — Phase 5 dynamically
    //     imports ESLint's module graph; cold-start is ~8s in isolation
    //     but under concurrent-test pressure (420+ tests running across
    //     jsdom workers) it climbs to ~47s in practice.
    //   - storybook-coverage-compliance.test.ts (OMN-100/OMN-118) —
    //     enforces every widget exposes at minimum `Empty` and
    //     `Populated` story exports plus state-specific variants.
    // 60s ceiling accommodates these two slow tests without flake.
    // Normal tests finish in ms; this ceiling doesn't affect their behavior.
    testTimeout: 60000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    coverage: {
      // Conservative initial floor — guards against coverage collapsing,
      // not a bar of excellence. Tighten incrementally as the suite
      // grows. A floor is much cheaper to maintain than chasing why
      // coverage dropped 30% in a refactor without a gate. (M14 fix.)
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}', 'shared/**/*.ts', 'server/**/*.ts'],
      exclude: [
        'src/**/*.stories.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.test.js',
        'src/storybook/**',
        'src/test-utils/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/shared/types/generated/**',
        'shared/**/*.test.ts',
        'shared/**/*.test.js',
        'server/**/*.test.ts',
        '**/*.css.ts',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        statements: 50,
        branches: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
