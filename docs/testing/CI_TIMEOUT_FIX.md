# CI Timeout Fix - Repository Level Solution

## Problem

Vitest tests were hanging in CI environments, causing 10-minute timeouts. This is a common issue when:

- Polling intervals aren't disabled in tests
- Timers aren't cleaned up properly
- Async operations don't complete
- Open handles prevent process exit

## Solution

We've implemented a repository-level fix with multiple layers:

### 1. Global Teardown (`client/src/tests/teardown.ts`)

A global teardown hook that:

- Clears all remaining timers
- Forces clean exit in CI environments
- Ensures no open handles prevent process exit

### 2. Test Setup Cleanup (`client/src/tests/setup.ts`)

Enhanced `afterEach` hook that:

- Clears React Testing Library cleanup
- Resets all timers after each test
- Prevents timer accumulation

### 3. Polling Interval Helper (`client/src/lib/constants/query-config.ts`)

The `getPollingInterval()` helper:

- Automatically disables polling in test environments
- Detects test environment via multiple signals
- Prevents infinite polling loops in tests

**Usage:**

```typescript
// ❌ Bad - polling runs in tests
refetchInterval: POLLING_INTERVAL_MEDIUM;

// ✅ Good - polling disabled in tests
refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM);
```

### 4. CI-Specific Test Command

The `test:ci` npm script:

- Uses `vitest run` (one-shot mode, exits after completion)
- Disables coverage (faster, prevents hangs)
- Uses verbose reporter for better debugging

### 5. Vitest Configuration

Optimized `vitest.config.ts`:

- Test isolation enabled (`isolate: true`)
- Proper timeout settings
- Thread pool limits to prevent resource exhaustion

## Best Practices

### Always Use `getPollingInterval()`

When using `refetchInterval` in `useQuery`:

```typescript
import { getPollingInterval, POLLING_INTERVAL_MEDIUM } from '@/lib/constants/query-config';

const { data } = useQuery({
  queryKey: ['my-query'],
  queryFn: fetchData,
  refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM), // ✅
});
```

### Clean Up Timers in Tests

If you use fake timers in tests:

```typescript
import { vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers(); // ✅ Always restore
});
```

### Mock Async Operations

Mock slow operations in tests:

```typescript
vi.mock('@/lib/data-sources', () => ({
  mySource: {
    fetchData: vi.fn().mockResolvedValue({ data: [] }),
  },
}));
```

## Troubleshooting

If tests still hang:

1. **Check for open handles:**

   ```bash
   node --trace-warnings test.js
   ```

2. **Verify polling is disabled:**
   - Search for `refetchInterval` without `getPollingInterval()`
   - Check that `process.env.VITEST` is set in test setup

3. **Check for unclosed connections:**
   - WebSocket connections
   - Database connections
   - HTTP keep-alive connections

4. **Review test timeouts:**
   - Individual test timeout: 10 seconds
   - Hook timeout: 10 seconds
   - Teardown timeout: 5 seconds

## Related Files

- `vitest.config.ts` - Main Vitest configuration
- `client/src/tests/setup.ts` - Test setup and cleanup
- `client/src/tests/teardown.ts` - Global teardown hook
- `client/src/lib/constants/query-config.ts` - Polling interval helper
- `.github/workflows/test.yml` - CI workflow configuration
