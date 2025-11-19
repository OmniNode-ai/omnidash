import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import {
  createTestLifecycle,
  renderWithQueryClient,
  setupTestCleanup,
  cleanupTest,
  createTestQueryClient,
} from '../test-utils';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Example component that uses TanStack Query
 * This simulates a real component that fetches data
 */
function TestComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['test-data'],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { message: 'Hello from query!' };
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>Data: {data?.message}</div>;
}

/**
 * EXAMPLE 1: Using Lifecycle Manager (Recommended for new tests)
 *
 * This is the simplest and safest approach. The lifecycle manager
 * automatically handles QueryClient creation and cleanup.
 */
describe('TestComponent - Lifecycle Manager Pattern', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => {
    lifecycle.beforeEach();
  });

  afterEach(async () => {
    await lifecycle.afterEach();
  });

  it('renders loading state initially', () => {
    lifecycle.render(<TestComponent />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders data after fetch completes', async () => {
    lifecycle.render(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByText('Data: Hello from query!')).toBeInTheDocument();
    });
  });

  it('handles multiple renders in same test', async () => {
    // First render
    const { unmount } = lifecycle.render(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByText('Data: Hello from query!')).toBeInTheDocument();
    });

    // Unmount and render again (lifecycle tracks the latest queryClient)
    unmount();
    lifecycle.render(<TestComponent />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

/**
 * EXAMPLE 2: Manual Tracking Pattern (For complex scenarios)
 *
 * Use this when you need direct access to the QueryClient instance
 * for custom assertions or manipulations.
 */
describe('TestComponent - Manual Tracking Pattern', () => {
  let queryClient: QueryClient | null = null;

  beforeEach(() => {
    setupTestCleanup();
  });

  afterEach(async () => {
    await cleanupTest(queryClient);
    queryClient = null;
  });

  it('renders and allows QueryClient inspection', async () => {
    const result = renderWithQueryClient(<TestComponent />);
    queryClient = result.queryClient;

    // You can inspect the queryClient directly
    expect(queryClient.isFetching()).toBe(1);

    await waitFor(() => {
      expect(screen.getByText('Data: Hello from query!')).toBeInTheDocument();
    });

    // Verify query completed
    expect(queryClient.isFetching()).toBe(0);
    const queryData = queryClient.getQueryData(['test-data']);
    expect(queryData).toEqual({ message: 'Hello from query!' });
  });

  it('allows manual query cache manipulation', async () => {
    const result = renderWithQueryClient(<TestComponent />);
    queryClient = result.queryClient;

    // Wait for initial load to complete
    await waitFor(() => {
      expect(screen.getByText('Data: Hello from query!')).toBeInTheDocument();
    });

    // Verify we can inspect the cache
    const queryData = queryClient.getQueryData(['test-data']);
    expect(queryData).toEqual({ message: 'Hello from query!' });

    // We can also invalidate queries manually
    queryClient.invalidateQueries({ queryKey: ['test-data'] });
  });
});

/**
 * EXAMPLE 3: Testing QueryClient Configuration
 *
 * Demonstrates that the test QueryClient has correct configuration
 * to prevent common test issues.
 */
describe('createTestQueryClient', () => {
  it('creates QueryClient with test-safe defaults', () => {
    const queryClient = createTestQueryClient();
    const defaultOptions = queryClient.getDefaultOptions();

    // Verify retry is disabled (prevents hanging tests)
    expect(defaultOptions.queries?.retry).toBe(false);

    // Verify refetch is disabled (prevents memory leaks)
    expect(defaultOptions.queries?.refetchInterval).toBe(false);
    expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(false);

    // Verify cache times prevent premature cleanup
    expect(defaultOptions.queries?.gcTime).toBe(Infinity);
    expect(defaultOptions.queries?.staleTime).toBe(Infinity);
  });
});

/**
 * EXAMPLE 4: Migration Example
 *
 * Shows how to migrate from old pattern to new pattern.
 */
describe('Migration Example', () => {
  // ❌ OLD PATTERN - Don't do this anymore
  describe('Old Pattern (avoid)', () => {
    it('renders without proper cleanup', async () => {
      // This was the old way - no cleanup, potential memory leaks
      const result = renderWithQueryClient(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText('Data: Hello from query!')).toBeInTheDocument();
      });

      // Missing cleanup! This causes issues in CI/CD
      // Need to manually add afterEach with result.queryClient
    });
  });

  // ✅ NEW PATTERN - Use this
  describe('New Pattern (recommended)', () => {
    const lifecycle = createTestLifecycle();

    beforeEach(() => lifecycle.beforeEach());
    afterEach(async () => await lifecycle.afterEach());

    it('renders with automatic cleanup', async () => {
      lifecycle.render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText('Data: Hello from query!')).toBeInTheDocument();
      });

      // Cleanup happens automatically in afterEach!
    });
  });
});

/**
 * EXAMPLE 5: Common Pitfalls Demonstration
 *
 * Shows what NOT to do and why.
 */
describe('Common Pitfalls', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => lifecycle.beforeEach());
  afterEach(async () => await lifecycle.afterEach());

  it('demonstrates proper async cleanup', async () => {
    lifecycle.render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByText('Data: Hello from query!')).toBeInTheDocument();
    });

    // ✅ CORRECT: afterEach is async and awaits cleanup
    // This prevents "Cannot flush pending work" errors
  });

  it('demonstrates multiple renders in one test', async () => {
    // First render
    const { unmount } = lifecycle.render(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByText('Data: Hello from query!')).toBeInTheDocument();
    });

    // ✅ CORRECT: Unmount before second render
    unmount();

    // Second render (lifecycle tracks latest queryClient)
    lifecycle.render(<TestComponent />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

/**
 * Key Takeaways:
 *
 * 1. Use lifecycle manager for simple tests (Example 1)
 * 2. Use manual tracking when you need QueryClient access (Example 2)
 * 3. Always await afterEach cleanup (prevents hangs)
 * 4. Use unmount() before rendering again in same test
 * 5. Don't reuse QueryClient across tests
 * 6. Don't forget to call lifecycle.beforeEach() in beforeEach
 *
 * Common Errors and Fixes:
 *
 * Error: "Cannot flush pending work without a root"
 * Fix: Await lifecycle.afterEach() or cleanupTest()
 *
 * Error: Tests hang indefinitely
 * Fix: Ensure afterEach cleanup is async and awaited
 *
 * Error: State pollution between tests
 * Fix: Use createTestLifecycle() or reset queryClient in afterEach
 *
 * Error: "Invalid hook call" with multiple renders
 * Fix: Call unmount() before second render
 */
