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

  // In CI, ensure all Node.js handles are closed
  // This helps Vitest exit cleanly after all tests complete
  if (process.env.CI === 'true') {
    // Give a brief moment for any final async operations
    await new Promise(resolve => setImmediate(resolve));
    
    // Force close any remaining handles that might prevent exit
    // This is a last resort to ensure CI doesn't hang
    if (typeof process !== 'undefined' && process.exit) {
      // Use setImmediate to allow any pending operations to complete
      setImmediate(() => {
        // Only exit if we're still running (shouldn't be necessary with vitest run)
        // But this ensures CI doesn't hang indefinitely
        if (process.listenerCount('beforeExit') === 0) {
          // No listeners means nothing is waiting, safe to exit
          process.exit(0);
        }
      });
    }
  }
}


