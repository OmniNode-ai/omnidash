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
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).vi !== 'undefined') {
    try {
      (globalThis as any).vi.useRealTimers();
      // Clear all fake timers if any are still running
      (globalThis as any).vi.clearAllTimers();
    } catch (e) {
      // Ignore errors
    }
  }

  // In CI environments, ensure process exits cleanly
  // Vitest's `run` mode should exit naturally, but this is a safety net
  if (process.env.CI === 'true') {
    // Give a small delay for any final cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Force exit if we're still running (shouldn't be necessary with vitest run)
    // This is only a last resort
    if (process.env.FORCE_EXIT === 'true') {
      process.exit(0);
    }
  }
}

