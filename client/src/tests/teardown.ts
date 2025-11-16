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

export async function teardown() {
  // Clear any remaining timers
  // Note: Vitest's globalTeardown runs after all tests complete
  // We rely on proper cleanup in afterEach/afterAll hooks rather than forcing exit
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).vi !== 'undefined') {
    try {
      (globalThis as any).vi.useRealTimers();
      // Clear all fake timers if any are still running
      (globalThis as any).vi.clearAllTimers();
    } catch (e) {
      // Ignore errors - vi may not be available in teardown context
    }
  }

  // Vitest's `run` mode should exit naturally after teardown completes
  // If tests hang, the root cause should be fixed (unclosed timers, polling, etc.)
  // rather than masking it with process.exit()
}


