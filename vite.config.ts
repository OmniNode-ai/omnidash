import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) => m.cartographer()),
          await import('@replit/vite-plugin-dev-banner').then((m) => m.devBanner()),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client', 'src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
    },
  },
  root: path.resolve(import.meta.dirname, 'client'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only split truly independent utilities - let Vite handle React deps
          if (id.includes('node_modules')) {
            // Independent utilities with no React dependency
            if (
              id.includes('date-fns') ||
              id.includes('zod') ||
              id.includes('clsx') ||
              id.includes('tailwind-merge')
            ) {
              return 'utils-vendor';
            }
            // Let Vite handle React and all React-dependent packages together
            // This avoids circular chunk issues (vendor -> react-vendor -> vendor)
          }
          // Return undefined to let Vite/Rollup decide optimal chunking
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    fs: {
      strict: true,
      deny: ['**/.*'],
    },
  },
});
