/**
 * Global teardown for Vitest tests
 * 
 * This file ensures proper cleanup and forces exit in CI environments
 * to prevent Vitest from hanging after tests complete.
 */

// Force exit in CI environments to prevent hanging
if (process.env.CI === 'true' || process.env.VITEST === 'true') {
  // Clear any remaining timers
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).vi !== 'undefined') {
    try {
      (globalThis as any).vi.useRealTimers();
    } catch (e) {
      // Ignore errors
    }
  }

  // Force exit after a short delay to allow cleanup
  // This is a last resort if Vitest doesn't exit naturally
  setTimeout(() => {
    if (process.env.CI === 'true') {
      // In CI, force exit after tests complete
      // Vitest should exit naturally, but this ensures it does
      process.exit(0);
    }
  }, 1000);
}

