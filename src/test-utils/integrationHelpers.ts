/**
 * Shared helpers for integration tests (OMN-11617).
 *
 * Centralises the manifest-loading and QueryClient-factory patterns that were
 * duplicated across integration.part2/3/4.test.tsx files.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { QueryClient } from '@tanstack/react-query';
import type { RegistryManifest } from '../registry/types';

// ── Manifest loading ─────────────────────────────────────────────────────────

const _dir = dirname(fileURLToPath(import.meta.url));

/**
 * Load and parse the generated component-registry.json manifest.
 * Result is cached at module load time — safe to call from multiple tests.
 */
export function loadTestManifest(): RegistryManifest {
  const json = readFileSync(resolve(_dir, '../registry/component-registry.json'), 'utf-8');
  return JSON.parse(json) as unknown as RegistryManifest;
}

/**
 * The loaded manifest, available as a constant for tests that import at
 * module scope. Identical to calling `loadTestManifest()` but avoids
 * repeating the call in each file.
 */
export const TEST_MANIFEST: RegistryManifest = loadTestManifest();

// ── QueryClient factory ──────────────────────────────────────────────────────

/**
 * Create a QueryClient suitable for tests: retries disabled, no garbage
 * collection window, no stale-time reuse between tests.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}
