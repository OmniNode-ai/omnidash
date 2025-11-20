import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Export test utilities for standardized test patterns
export {
  createTestQueryClient,
  renderWithQueryClient,
  setupTestCleanup,
  cleanupTest,
  createTestLifecycle,
} from './test-utils';

// Ensure VITEST is set for test environment detection
// Note: import.meta.env is read-only in Vite, but Vitest should set it automatically
// We set process.env as a fallback
if (typeof process !== 'undefined') {
  process.env.VITEST = 'true';
  process.env.NODE_ENV = 'test';
}

// Cleanup after each test
afterEach(() => {
  cleanup();
  // Clear all timers to prevent hanging
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).vi !== 'undefined') {
    // Vitest is available, ensure timers are cleared
    try {
      (globalThis as any).vi.useRealTimers();
    } catch (e) {
      // Ignore errors
    }
  }
});

// Mock ResizeObserver for Recharts and other components
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {}
} as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock pointer capture APIs for Radix UI components (required by @radix-ui/react-select)
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();

  // Mock scrollIntoView for Radix UI Select
  Element.prototype.scrollIntoView = vi.fn();
}
