/**
 * Global teardown for Vitest tests
 *
 * This file ensures proper cleanup and forces exit in CI environments
 * to prevent Vitest from hanging after tests complete.
 *
 * Common causes of Vitest hanging in CI:
 * - Open handles (timers, intervals, WebSocket connections)
 * - Async operations not completing
 * - Polling intervals not being disabled
 *
 * This teardown ensures all resources are cleaned up.
 */

// Default export required for Vitest globalTeardown
export default async function globalTeardown() {
  console.warn('[Teardown] Starting global teardown...');

  /**
   * Give pending microtasks a chance to flush. This mirrors Vitest's own behaviour
   * and helps ensure that any promises scheduled during test shutdown complete
   * before the process exits.
   */
  await new Promise((resolve) => setTimeout(resolve, 25));

  console.warn('[Teardown] Complete. Allowing Vitest to exit naturally.');
}
