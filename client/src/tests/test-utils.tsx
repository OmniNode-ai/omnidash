import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

/**
 * Standard QueryClient configuration for tests
 *
 * This configuration prevents common test issues:
 * - retry: false - Prevents hanging tests from retry attempts
 * - refetchInterval: false - Disables automatic refetching that can cause memory leaks
 * - refetchOnWindowFocus: false - Prevents unexpected refetches during test execution
 * - gcTime: Infinity - Prevents premature cache cleanup that can cause timing issues
 * - staleTime: Infinity - Prevents unnecessary refetches during short-lived tests
 *
 * @returns QueryClient configured for test environment
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry failed queries in tests
        refetchInterval: false, // Disable automatic refetching
        refetchOnWindowFocus: false, // Disable refetch on window focus
        gcTime: Infinity, // Keep data in cache indefinitely during tests
        staleTime: Infinity, // Consider all data fresh during tests
      },
    },
  });
}

/**
 * Render component with QueryClient wrapper
 *
 * Automatically creates and configures a QueryClient for the test,
 * wrapping the component in QueryClientProvider. Returns the queryClient
 * instance for manual cleanup in afterEach hooks.
 *
 * @example
 * ```typescript
 * describe('MyComponent', () => {
 *   let queryClient: QueryClient | null = null;
 *
 *   afterEach(async () => {
 *     await cleanupTest(queryClient);
 *   });
 *
 *   it('renders', () => {
 *     const result = renderWithQueryClient(<MyComponent />);
 *     queryClient = result.queryClient;
 *   });
 * });
 * ```
 *
 * @param ui - React component to render
 * @param options - Additional render options (excluding wrapper)
 * @returns Render result with queryClient instance for cleanup
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  const result = render(ui, { wrapper: Wrapper, ...options });

  return {
    ...result,
    queryClient, // Return for cleanup tracking
  };
}

/**
 * Setup standard beforeEach cleanup
 *
 * Clears all mocks and resets timers to real timers to ensure
 * a clean state before each test.
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setupTestCleanup();
 * });
 * ```
 */
export function setupTestCleanup(): void {
  vi.clearAllMocks();
  vi.useRealTimers();
}

/**
 * Setup standard afterEach cleanup
 *
 * Performs comprehensive cleanup to prevent test hangs and memory leaks:
 * 1. Clears QueryClient cache (prevents memory leaks)
 * 2. Cancels pending queries (prevents hanging promises)
 * 3. Clears all timers (prevents timer-based hangs)
 * 4. Resets to real timers (ensures clean state)
 *
 * IMPORTANT: Always await this function in afterEach hooks!
 *
 * @example
 * ```typescript
 * afterEach(async () => {
 *   await cleanupTest(queryClient);
 * });
 * ```
 *
 * @param queryClient - QueryClient instance from renderWithQueryClient
 */
export async function cleanupTest(queryClient: QueryClient | null): Promise<void> {
  if (queryClient) {
    queryClient.clear(); // Clear cache
    await queryClient.cancelQueries(); // Cancel pending queries
  }
  vi.clearAllTimers(); // Clear any pending timers
  vi.useRealTimers(); // Reset to real timers
}

/**
 * Complete test lifecycle manager
 *
 * Simplifies test setup/cleanup by managing QueryClient lifecycle automatically.
 * Use this for new tests to ensure proper cleanup without manual tracking.
 *
 * @example
 * ```typescript
 * describe('MyComponent', () => {
 *   const lifecycle = createTestLifecycle();
 *
 *   beforeEach(() => {
 *     lifecycle.beforeEach();
 *   });
 *
 *   afterEach(async () => {
 *     await lifecycle.afterEach();
 *   });
 *
 *   it('renders', () => {
 *     lifecycle.render(<MyComponent />);
 *     // Test assertions...
 *   });
 * });
 * ```
 *
 * @returns Lifecycle manager with setup, cleanup, and render methods
 */
export function createTestLifecycle() {
  let queryClient: QueryClient | null = null;

  return {
    /**
     * Call in beforeEach hook
     */
    beforeEach: () => {
      setupTestCleanup();
    },

    /**
     * Call in afterEach hook (must be awaited!)
     */
    afterEach: async () => {
      await cleanupTest(queryClient);
      queryClient = null;
    },

    /**
     * Use instead of render() - automatically tracks QueryClient for cleanup
     */
    render: (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => {
      const result = renderWithQueryClient(ui, options);
      queryClient = result.queryClient;
      return result;
    },
  };
}

/**
 * Common Pitfalls to Avoid:
 *
 * 1. ❌ NOT awaiting cleanupTest in afterEach
 *    - Causes: Hanging tests, memory leaks
 *    - Fix: Always use `await lifecycle.afterEach()` or `await cleanupTest(queryClient)`
 *
 * 2. ❌ Using fake timers without proper cleanup
 *    - Causes: Tests hang waiting for timers
 *    - Fix: Call vi.useRealTimers() in afterEach (handled automatically)
 *
 * 3. ❌ Not tracking queryClient reference
 *    - Causes: Cannot cleanup queries, memory leaks
 *    - Fix: Store queryClient from renderWithQueryClient or use lifecycle manager
 *
 * 4. ❌ Configuring queries with retry/refetch in tests
 *    - Causes: Unexpected behavior, flaky tests
 *    - Fix: Use createTestQueryClient() which disables these features
 *
 * 5. ❌ Reusing QueryClient across tests
 *    - Causes: State pollution between tests
 *    - Fix: Create new instance per test (handled automatically by utilities)
 *
 * Migration Guide:
 *
 * OLD PATTERN:
 * ```typescript
 * describe('MyComponent', () => {
 *   it('renders', () => {
 *     const queryClient = new QueryClient();
 *     render(
 *       <QueryClientProvider client={queryClient}>
 *         <MyComponent />
 *       </QueryClientProvider>
 *     );
 *   });
 * });
 * ```
 *
 * NEW PATTERN (Lifecycle Manager):
 * ```typescript
 * describe('MyComponent', () => {
 *   const lifecycle = createTestLifecycle();
 *
 *   beforeEach(() => lifecycle.beforeEach());
 *   afterEach(async () => await lifecycle.afterEach());
 *
 *   it('renders', () => {
 *     lifecycle.render(<MyComponent />);
 *   });
 * });
 * ```
 *
 * NEW PATTERN (Manual Tracking):
 * ```typescript
 * describe('MyComponent', () => {
 *   let queryClient: QueryClient | null = null;
 *
 *   beforeEach(() => setupTestCleanup());
 *   afterEach(async () => await cleanupTest(queryClient));
 *
 *   it('renders', () => {
 *     const result = renderWithQueryClient(<MyComponent />);
 *     queryClient = result.queryClient;
 *   });
 * });
 * ```
 */
