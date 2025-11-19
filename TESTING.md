# Testing Best Practices

## Overview

This document outlines testing patterns and best practices for the Omnidash project, based on lessons learned from fixing test hangs and memory leaks across 12+ test files. The patterns documented here ensure tests are fast, reliable, and don't consume unnecessary resources.

## Quick Start

### Running Tests

```bash
npm run test              # Run all tests
npm run test:ui           # Interactive test UI
npm run test:coverage     # Generate coverage report
```

### Test Structure

All tests should follow this standard structure:

```typescript
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('MyComponent', () => {
  let queryClient: QueryClient | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers(); // Prevent timer pollution between tests
  });

  afterEach(async () => {
    // Critical: Clean up query client to prevent memory leaks
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries();
      queryClient = null;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders correctly', async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,              // Disable retries in tests
          refetchInterval: false,    // Disable polling
          refetchOnWindowFocus: false,
          gcTime: Infinity,          // Consistent caching
          staleTime: Infinity,       // Never auto-refetch
        },
      },
    });

    const result = render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Expected')).toBeInTheDocument();
    });

    result.unmount(); // Important: explicit cleanup
  });
});
```

## Core Principles

### 1. Always Clean Up Resources

**Problem**: Query clients, timers, and components that aren't cleaned up cause:
- Tests to hang indefinitely
- Memory leaks that slow down test suites
- Flaky tests due to state pollution

**Solution**: Track all resources and clean them up in `afterEach`:

```typescript
let queryClient: QueryClient | null = null;

afterEach(async () => {
  // Clean up query client
  if (queryClient) {
    queryClient.clear();              // Clear cache
    await queryClient.cancelQueries(); // Cancel in-flight queries
    queryClient = null;               // Release reference
  }

  // Clean up timers
  vi.clearAllTimers();
  vi.useRealTimers();
});
```

### 2. Prevent Automatic Refetching

**Problem**: TanStack Query automatically refetches data in many scenarios:
- When window regains focus
- At intervals (polling)
- When data becomes stale
- After cache expires

This causes tests to hang waiting for refetches that never complete.

**Solution**: Configure query client to disable all automatic refetching:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,              // No retries on failure
      refetchInterval: false,    // No polling
      refetchOnWindowFocus: false, // No refetch on focus
      gcTime: Infinity,          // Cache never expires
      staleTime: Infinity,       // Data never stale
    },
  },
});
```

### 3. Isolate Test State

**Problem**: State leaking between tests causes unpredictable failures.

**Solution**: Reset all state in `beforeEach`:

```typescript
beforeEach(() => {
  vi.clearAllMocks();        // Clear mock call history
  vi.useRealTimers();        // Reset to real timers
  localStorage.clear();      // Clear localStorage mocks
  // Reset any module-level state
});
```

### 4. Explicit Component Cleanup

**Problem**: Components continue running after tests end, causing warnings and memory leaks.

**Solution**: Always call `unmount()`:

```typescript
const result = render(<Component />);

// ... test assertions ...

result.unmount(); // Explicit cleanup
```

### 5. Use Fake Timers Carefully

**Problem**: Fake timers can cause tests to hang if not properly managed.

**Solution**: Always reset timers and advance carefully:

```typescript
it('handles retry logic', async () => {
  vi.useFakeTimers(); // Enable fake timers

  // Start async operation
  const promise = someAsyncOperation();

  // Advance timers
  await vi.advanceTimersByTimeAsync(1000);

  // Wait for promise
  await promise;

  vi.useRealTimers(); // Always restore
}, 5000); // Reduced timeout for fake timer tests
```

## Common Pitfalls

### ❌ Creating Query Clients Without Cleanup

**Bad Example**:
```typescript
function render() {
  const queryClient = new QueryClient(); // Lost reference!
  return renderWithClient(queryClient);
  // No way to clean up this query client
}
```

**Good Example**:
```typescript
let queryClient: QueryClient | null = null;

afterEach(async () => {
  if (queryClient) {
    await queryClient.cancelQueries();
    queryClient.clear();
    queryClient = null;
  }
});

it('test', () => {
  queryClient = new QueryClient({ /* config */ });
  // Now we can clean it up
});
```

### ❌ Forgetting to Unmount Components

**Bad Example**:
```typescript
it('test', () => {
  render(<Component />);
  // Test ends, component still mounted
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

**Good Example**:
```typescript
it('test', () => {
  const result = render(<Component />);

  expect(screen.getByText('Hello')).toBeInTheDocument();

  result.unmount(); // Clean up
});
```

### ❌ Inconsistent Query Configuration

**Bad Example**:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false }, // Missing critical configs
  },
});
```

**Good Example**:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      gcTime: Infinity,
      staleTime: Infinity,
    },
  },
});
```

### ❌ Not Resetting Timers

**Bad Example**:
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  // Timer state carries over from previous test!
});
```

**Good Example**:
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers(); // Always reset timers
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
```

### ❌ Mocking After Import

**Bad Example**:
```typescript
import { myFunction } from './module';

vi.mock('./module', () => ({
  myFunction: vi.fn(), // Too late!
}));
```

**Good Example**:
```typescript
vi.mock('./module', () => ({
  myFunction: vi.fn(),
}));

// Import AFTER mock is defined
import { myFunction } from './module';
```

## Testing Patterns

### Pattern 1: Page Component Tests

Use this pattern for testing full page components that use TanStack Query:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import MyPage from '../MyPage';

// Mock dependencies
vi.mock('@/lib/data-sources', async () => {
  const actual = await vi.importActual('@/lib/data-sources');
  return {
    ...actual,
    myDataSource: {
      fetchData: vi.fn(),
    },
  };
});

import { myDataSource } from '@/lib/data-sources';

let queryClient: QueryClient | null = null;

function renderWithClient(ui: ReactNode) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
        refetchOnWindowFocus: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
    },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );

  return { queryClient, ...result };
}

describe('MyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    // Setup default mocks
    vi.mocked(myDataSource.fetchData).mockResolvedValue({
      data: [],
      isMock: false,
    });
  });

  afterEach(async () => {
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries();
      queryClient = null;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders data successfully', async () => {
    vi.mocked(myDataSource.fetchData).mockResolvedValue({
      data: [{ id: 1, name: 'Item 1' }],
      isMock: false,
    });

    const result = renderWithClient(<MyPage />);
    queryClient = result.queryClient;

    await waitFor(() => {
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    }, { timeout: 5000 });

    result.unmount();
  });

  it('handles errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(myDataSource.fetchData).mockRejectedValue(
      new Error('API unavailable')
    );

    const result = renderWithClient(<MyPage />);
    queryClient = result.queryClient;

    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument();
    }, { timeout: 5000 });

    consoleError.mockRestore();
    result.unmount();
  });
});
```

**Key Points**:
- Track `queryClient` at module level
- Use `renderWithClient` helper function
- Clean up in `afterEach`
- Always unmount after assertions

### Pattern 2: Component Tests (Without Queries)

For simpler components that don't use TanStack Query:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('renders with props', () => {
    const result = render(
      <MyComponent label="Test" value={42} />
    );

    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();

    result.unmount();
  });

  it('handles edge cases', () => {
    const result = render(
      <MyComponent label="" value={0} />
    );

    expect(screen.queryByText('')).not.toBeInTheDocument();

    result.unmount();
  });
});
```

**Key Points**:
- No query client needed
- Still unmount components
- Keep tests simple and focused

### Pattern 3: Data Source Tests

For testing API data sources with fetch mocks:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { myDataSource } from '../my-data-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '@/tests/utils/mock-fetch';

describe('MyDataSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  it('fetches data successfully', async () => {
    const mockData = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ];

    setupFetchMock(
      new Map([
        ['/api/items', createMockResponse(mockData)],
      ])
    );

    const result = await myDataSource.fetchItems();

    expect(result.isMock).toBe(false);
    expect(result.data).toEqual(mockData);
  });

  it('returns mock data on API failure', async () => {
    setupFetchMock(
      new Map([
        ['/api/items', createMockResponse(null, { status: 500 })],
      ])
    );

    const result = await myDataSource.fetchItems();

    expect(result.isMock).toBe(true);
    expect(result.data).toBeDefined();
  });
});
```

**Key Points**:
- Reset fetch mocks in `beforeEach`
- Test both success and failure cases
- Verify `isMock` flag correctly

### Pattern 4: Server-Side Tests with Mocks

For testing server code that uses external dependencies:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.hoisted() for mocks that need to be available during module loading
const { mockConnect, mockDisconnect } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockDisconnect: vi.fn(),
}));

// Mock external dependencies BEFORE imports
vi.mock('kafkajs', () => ({
  Kafka: vi.fn().mockImplementation(() => ({
    consumer: vi.fn().mockReturnValue({
      connect: mockConnect,
      disconnect: mockDisconnect,
    }),
  })),
}));

// Import AFTER mocks are set up
import { EventConsumer } from '../event-consumer';

describe('EventConsumer', () => {
  let consumer: InstanceType<typeof EventConsumer>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    consumer = new EventConsumer();
  });

  afterEach(async () => {
    vi.useRealTimers();
    try {
      await consumer.stop();
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('connects successfully', async () => {
    mockConnect.mockResolvedValueOnce(undefined);

    await consumer.start();

    expect(mockConnect).toHaveBeenCalled();
  });

  it('handles retry logic with fake timers', async () => {
    vi.useFakeTimers();

    mockConnect
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValueOnce(undefined);

    const connectPromise = consumer.connectWithRetry(3);

    // Advance through retry delay
    await vi.advanceTimersByTimeAsync(1000);

    await connectPromise;

    expect(mockConnect).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  }, 5000); // Reduced timeout for fake timers
});
```

**Key Points**:
- Use `vi.hoisted()` for mocks needed during module load
- Mock BEFORE importing
- Clean up instances in `afterEach`
- Use fake timers for retry logic testing

## Mock Patterns

### Mocking Components

```typescript
vi.mock('@/components/MetricCard', () => ({
  MetricCard: ({ label }: { label: string }) => (
    <div data-testid="metric-card">{label}</div>
  ),
}));
```

### Mocking Data Sources

```typescript
vi.mock('@/lib/data-sources', async () => {
  const actual = await vi.importActual('@/lib/data-sources');
  return {
    ...actual,
    myDataSource: {
      fetchData: vi.fn(),
    },
  };
});
```

### Mocking Hooks

```typescript
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    isConnected: true,
    connectionStatus: 'connected',
  })),
}));
```

### Mocking localStorage

```typescript
type LocalStorageMock = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

describe('MyComponent', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;

  beforeEach(() => {
    localStorageMocks.getItem.mockReturnValue('24h');
  });
});
```

## Troubleshooting

### Tests Hang Indefinitely

**Symptoms**:
- Test suite never completes
- Tests stuck in "RUNNING" state
- No error messages

**Likely Causes**:
1. Query client not cleaned up
2. Polling enabled (`refetchInterval` not false)
3. Timers not reset between tests
4. Component not unmounted

**Solutions**:
```typescript
// 1. Add query client cleanup
afterEach(async () => {
  if (queryClient) {
    await queryClient.cancelQueries();
    queryClient.clear();
    queryClient = null;
  }
});

// 2. Disable polling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
    },
  },
});

// 3. Reset timers
beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// 4. Unmount components
const result = render(<Component />);
// ... tests ...
result.unmount();
```

### Memory Leaks

**Symptoms**:
- Test suite gets progressively slower
- High memory usage
- "Exceeded timeout" errors

**Likely Causes**:
1. Query clients not released
2. Event listeners not removed
3. Intervals/timeouts not cleared
4. Large objects held in closures

**Solutions**:
```typescript
// Track all resources
let queryClient: QueryClient | null = null;
let subscription: Subscription | null = null;

afterEach(async () => {
  // Clean up ALL resources
  if (queryClient) {
    await queryClient.cancelQueries();
    queryClient.clear();
    queryClient = null;
  }

  if (subscription) {
    subscription.unsubscribe();
    subscription = null;
  }

  vi.clearAllTimers();
  vi.useRealTimers();
});
```

### Flaky Tests

**Symptoms**:
- Tests pass sometimes, fail other times
- Different results on different runs
- Race conditions

**Likely Causes**:
1. State pollution between tests
2. Timing issues with async operations
3. Mock state not reset
4. Shared module state

**Solutions**:
```typescript
// 1. Reset all state
beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

// 2. Use waitFor with appropriate timeouts
await waitFor(() => {
  expect(screen.getByText('Expected')).toBeInTheDocument();
}, { timeout: 5000 });

// 3. Reset mocks properly
beforeEach(() => {
  vi.mocked(myFunction).mockReset();
  vi.mocked(myFunction).mockResolvedValue(defaultValue);
});

// 4. Avoid module-level state
// Instead of:
let globalState = {};

// Use:
function createState() {
  return {};
}

let state = createState();

beforeEach(() => {
  state = createState();
});
```

### "Cannot access X before initialization"

**Symptoms**:
- ReferenceError during test setup
- Mocks not working

**Likely Cause**: Importing before mocking

**Solution**:
```typescript
// ❌ Bad: Import before mock
import { myFunction } from './module';
vi.mock('./module');

// ✅ Good: Mock before import
vi.mock('./module', () => ({
  myFunction: vi.fn(),
}));
import { myFunction } from './module';
```

### Fake Timers Not Advancing

**Symptoms**:
- Tests timeout when using `vi.useFakeTimers()`
- Promises never resolve

**Solution**:
```typescript
it('handles delayed operations', async () => {
  vi.useFakeTimers();

  const promise = delayedOperation();

  // Use async version!
  await vi.advanceTimersByTimeAsync(1000);

  await promise;

  vi.useRealTimers();
});
```

## Migration Guide

### Converting Old Tests to New Patterns

Follow these steps to migrate existing tests:

**Step 1: Add Resource Tracking**

```typescript
// Add at the top of describe block
let queryClient: QueryClient | null = null;
```

**Step 2: Add Timer Management**

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers(); // Add this
});

afterEach(() => {
  // Add timer cleanup
  vi.clearAllTimers();
  vi.useRealTimers();
});
```

**Step 3: Update Query Client Configuration**

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchInterval: false,        // Add these
      refetchOnWindowFocus: false,   // Add these
      gcTime: Infinity,              // Add these
      staleTime: Infinity,           // Add these
    },
  },
});
```

**Step 4: Add Query Client Cleanup**

```typescript
afterEach(async () => {
  // Add query client cleanup
  if (queryClient) {
    queryClient.clear();
    await queryClient.cancelQueries();
    queryClient = null;
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});
```

**Step 5: Track Query Client in Tests**

```typescript
it('test', () => {
  const result = renderWithClient(<Component />);
  queryClient = result.queryClient; // Add this line

  // ... rest of test

  result.unmount();
});
```

**Step 6: Add Component Unmounting**

```typescript
it('test', () => {
  const result = render(<Component />);

  // ... assertions ...

  result.unmount(); // Add this
});
```

## ESLint Rules

The following ESLint rules help enforce these patterns:

```json
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.name='useQuery'] > ObjectExpression:not(:has(Property[key.name='refetchInterval']))",
        "message": "useQuery must explicitly set refetchInterval to false in tests"
      }
    ]
  }
}
```

## Reference Implementations

### Exemplary Test Files

These test files demonstrate all best practices:

1. **`client/src/pages/__tests__/EventFlow.test.tsx`**
   - Page component testing with queries
   - Proper resource cleanup
   - Multiple test scenarios

2. **`client/src/components/__tests__/MetricCard.test.tsx`**
   - Component testing without queries
   - Simple, focused tests
   - Proper unmounting

3. **`server/__tests__/event-consumer.test.ts`**
   - Server-side testing
   - Complex mocking with vi.hoisted()
   - Fake timer usage

4. **`client/src/lib/data-sources/__tests__/agent-operations-source.test.ts`**
   - Data source testing
   - Fetch mocking
   - Error handling

### Global Test Setup

See `client/src/tests/setup.ts` for global test configuration:
- ResizeObserver mock
- matchMedia mock
- localStorage mock
- Pointer capture mocks for Radix UI

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [TanStack Query Testing Guide](https://tanstack.com/query/latest/docs/framework/react/guides/testing)
- [Effective Testing Patterns](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Summary Checklist

Use this checklist when writing new tests:

- [ ] Query client tracked at module level (`let queryClient: QueryClient | null = null`)
- [ ] Query client configured with anti-flake settings (all refetch disabled, Infinity cache/stale)
- [ ] `beforeEach` resets timers (`vi.useRealTimers()`)
- [ ] `beforeEach` clears mocks (`vi.clearAllMocks()`)
- [ ] `afterEach` cleans up query client (clear + cancelQueries)
- [ ] `afterEach` resets timers (`vi.clearAllTimers()`, `vi.useRealTimers()`)
- [ ] Components explicitly unmounted (`result.unmount()`)
- [ ] Query client assigned in test (`queryClient = result.queryClient`)
- [ ] Mocks defined before imports
- [ ] Complex mocks use `vi.hoisted()`
- [ ] Fake timers properly managed (enable, advance, restore)
- [ ] Timeouts adjusted for fake timer tests
- [ ] `waitFor` used with appropriate timeout values
- [ ] Console errors mocked when testing error states
- [ ] No module-level mutable state
