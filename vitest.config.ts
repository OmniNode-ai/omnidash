import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./client/src/tests/setup.ts'],
    // Test timeout to prevent hanging tests
    testTimeout: 10000, // 10 seconds per test
    hookTimeout: 10000, // 10 seconds for hooks
    teardownTimeout: 5000, // 5 seconds for teardown
    // Ensure Vitest exits after tests complete
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 2,  // Max 2 worker threads
        minThreads: 1,
        isolate: true, // Isolate each test file
      },
    },
    // Exclude Playwright snapshot tests (they use test.describe from @playwright/test)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/client/src/tests/snapshots/**', // Exclude Playwright snapshot tests
    ],
    // Limit parallelism to prevent CPU overload
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 2,  // Max 2 worker threads
        minThreads: 1,
      },
    },
    // Run tests sequentially within files to reduce CPU load
    sequence: {
      concurrent: false,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'client/src/tests/',
        '*.config.*',
        'dist/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@assets': path.resolve(__dirname, './attached_assets'),
    },
  },
});





