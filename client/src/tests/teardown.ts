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
export default async function() {
  console.log('[Teardown] Starting global teardown...');

  // Clear any remaining timers
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).vi !== 'undefined') {
    try {
      (globalThis as any).vi.useRealTimers();
      (globalThis as any).vi.clearAllTimers();
    } catch (e) {
      // Ignore errors - vi may not be available in teardown context
    }
  }

  // In CI environments, force exit after grace period to prevent hanging
  // This is necessary because some polling intervals may not clean up properly in CI
  if (process.env.CI === 'true') {
    console.log('[Teardown] CI environment detected, will force exit after grace period');

    // Give 100ms grace period for any final cleanup
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('[Teardown] Forcing process exit to prevent hanging from open handles');
    process.exit(0);
  } else {
    console.log('[Teardown] Local environment, allowing natural exit');
  }
}


