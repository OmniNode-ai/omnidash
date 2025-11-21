# Test Utilities Migration Guide

This guide helps you migrate existing tests to use the new standardized test utilities and fix common test issues.

## Quick Reference

### ❌ Old Pattern (Causes Hangs)

```typescript
describe('MyComponent', () => {
  it('renders', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  });
});
```

**Problems:**

- No cleanup → Memory leaks
- No timer cleanup → Hanging tests
- No query cancellation → "Cannot flush pending work" errors

### ✅ New Pattern (Recommended)

```typescript
import { createTestLifecycle } from '@/tests/test-utils';

describe('MyComponent', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => lifecycle.beforeEach());
  afterEach(async () => await lifecycle.afterEach());

  it('renders', async () => {
    lifecycle.render(<MyComponent />);
    await waitFor(() => {
      expect(screen.getByText('Expected text')).toBeInTheDocument();
    });
  });
});
```

**Benefits:**

- ✅ Automatic QueryClient creation with test-safe config
- ✅ Automatic cleanup prevents memory leaks
- ✅ No hanging tests from uncancelled queries
- ✅ No "Cannot flush pending work" errors

## Available Utilities

### 1. `createTestLifecycle()` - Recommended for Most Tests

**When to use:** New tests or simple test suites

```typescript
import { createTestLifecycle } from '@/tests/test-utils';

describe('MyComponent', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => lifecycle.beforeEach());
  afterEach(async () => await lifecycle.afterEach());

  it('renders', () => {
    lifecycle.render(<MyComponent />);
    // Assertions...
  });
});
```

### 2. `renderWithQueryClient()` - For Advanced Use Cases

**When to use:** Need direct access to QueryClient for inspection or manipulation

```typescript
import { renderWithQueryClient, setupTestCleanup, cleanupTest } from '@/tests/test-utils';
import type { QueryClient } from '@tanstack/react-query';

describe('MyComponent', () => {
  let queryClient: QueryClient | null = null;

  beforeEach(() => setupTestCleanup());
  afterEach(async () => await cleanupTest(queryClient));

  it('renders and inspects cache', async () => {
    const result = renderWithQueryClient(<MyComponent />);
    queryClient = result.queryClient;

    // You can inspect the queryClient
    expect(queryClient.isFetching()).toBe(1);

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
  });
});
```

### 3. `createTestQueryClient()` - For Custom Setups

**When to use:** Need custom QueryClient configuration

```typescript
import { createTestQueryClient } from '@/tests/test-utils';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

describe('MyComponent', () => {
  it('renders with custom provider', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  });
});
```

## Common Migration Scenarios

### Scenario 1: Basic Component Test

**Before:**

```typescript
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('MyComponent', () => {
  it('renders', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

**After:**

```typescript
import { screen } from '@testing-library/react';
import { createTestLifecycle } from '@/tests/test-utils';

describe('MyComponent', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => lifecycle.beforeEach());
  afterEach(async () => await lifecycle.afterEach());

  it('renders', () => {
    lifecycle.render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Scenario 2: Test with Async Data Fetching

**Before:**

```typescript
describe('MyComponent', () => {
  it('fetches and displays data', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Data loaded')).toBeInTheDocument();
    });
  });
});
```

**After:**

```typescript
import { createTestLifecycle } from '@/tests/test-utils';

describe('MyComponent', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => lifecycle.beforeEach());
  afterEach(async () => await lifecycle.afterEach());

  it('fetches and displays data', async () => {
    lifecycle.render(<MyComponent />);

    await waitFor(() => {
      expect(screen.getByText('Data loaded')).toBeInTheDocument();
    });
  });
});
```

**Note:** Test-safe QueryClient config is automatic (retry: false, no refetching)

### Scenario 3: Multiple Tests with Shared Setup

**Before:**

```typescript
describe('MyComponent', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('test 1', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  });

  it('test 2', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  });
});
```

**After:**

```typescript
import { createTestLifecycle } from '@/tests/test-utils';

describe('MyComponent', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => lifecycle.beforeEach());
  afterEach(async () => await lifecycle.afterEach());

  it('test 1', () => {
    lifecycle.render(<MyComponent />);
  });

  it('test 2', () => {
    lifecycle.render(<MyComponent />);
  });
});
```

**Note:** Each test gets a fresh QueryClient automatically

### Scenario 4: Tests with Multiple Renders

**Before:**

```typescript
describe('MyComponent', () => {
  it('renders multiple times', async () => {
    const queryClient = new QueryClient();

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('First render')).toBeInTheDocument();
    });

    unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );
  });
});
```

**After:**

```typescript
import { createTestLifecycle } from '@/tests/test-utils';

describe('MyComponent', () => {
  const lifecycle = createTestLifecycle();

  beforeEach(() => lifecycle.beforeEach());
  afterEach(async () => await lifecycle.afterEach());

  it('renders multiple times', async () => {
    const { unmount } = lifecycle.render(<MyComponent />);

    await waitFor(() => {
      expect(screen.getByText('First render')).toBeInTheDocument();
    });

    unmount();
    lifecycle.render(<MyComponent />);
  });
});
```

**Note:** Lifecycle manager tracks the latest QueryClient for cleanup

## Common Errors and Fixes

### Error: "Cannot flush pending work without a root"

**Cause:** Missing or non-async cleanup in afterEach

**Fix:**

```typescript
// ❌ Wrong
afterEach(() => {
  lifecycle.afterEach(); // Missing await!
});

// ✅ Correct
afterEach(async () => {
  await lifecycle.afterEach();
});
```

### Error: Tests hang indefinitely

**Cause:** Queries not cancelled, timers not cleared

**Fix:** Ensure afterEach is async and awaited:

```typescript
afterEach(async () => {
  await lifecycle.afterEach();
});
```

### Error: State pollution between tests

**Cause:** Reusing QueryClient across tests

**Fix:** Use lifecycle manager which creates fresh QueryClient per test:

```typescript
const lifecycle = createTestLifecycle(); // Fresh QueryClient per test
```

### Error: "Invalid hook call" with multiple renders

**Cause:** Not unmounting before second render

**Fix:**

```typescript
const { unmount } = lifecycle.render(<MyComponent />);
// ... assertions ...
unmount(); // Must unmount before next render
lifecycle.render(<MyComponent />);
```

## Step-by-Step Migration Process

1. **Import the utilities:**

   ```typescript
   import { createTestLifecycle } from '@/tests/test-utils';
   ```

2. **Create lifecycle manager:**

   ```typescript
   const lifecycle = createTestLifecycle();
   ```

3. **Add lifecycle hooks:**

   ```typescript
   beforeEach(() => lifecycle.beforeEach());
   afterEach(async () => await lifecycle.afterEach());
   ```

4. **Replace render calls:**

   ```typescript
   // Before: render(<QueryClientProvider client={queryClient}>...)
   // After:  lifecycle.render(<MyComponent />)
   ```

5. **Make async tests properly async:**

   ```typescript
   it('test name', async () => {
     lifecycle.render(<MyComponent />);
     await waitFor(() => { /* assertions */ });
   });
   ```

6. **Run tests and verify no hangs:**
   ```bash
   npm run test -- path/to/test.test.tsx
   ```

## Verification Checklist

After migrating a test file:

- [ ] All tests pass without hanging
- [ ] No "Cannot flush pending work" errors
- [ ] No memory leak warnings in console
- [ ] Tests complete in reasonable time (<5s per suite)
- [ ] afterEach uses async/await pattern
- [ ] lifecycle.render() used instead of manual QueryClientProvider
- [ ] Multiple renders use unmount() between renders

## Examples

See `client/src/tests/__tests__/test-utils.test.tsx` for comprehensive examples of:

- Lifecycle manager pattern
- Manual tracking pattern
- Multiple renders in one test
- QueryClient inspection
- Common pitfalls and solutions

## Getting Help

If you encounter issues after migration:

1. Check the [Common Errors](#common-errors-and-fixes) section above
2. Review `test-utils.test.tsx` for working examples
3. Verify afterEach is async and awaited
4. Check that lifecycle.beforeEach() is called in beforeEach
5. Ensure unmount() is called before second render in same test
