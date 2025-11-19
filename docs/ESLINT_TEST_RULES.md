# ESLint Test Cleanup Rules

This document explains the ESLint rules enforced for test files to prevent memory leaks, ensure proper cleanup, and maintain test quality.

## Overview

Custom ESLint rules have been configured specifically for test files (`**/*.test.ts`, `**/*.test.tsx`, `**/__tests__/**/*`) to enforce:
- **Vitest best practices**
- **Memory leak prevention**
- **Proper cleanup patterns**
- **Test organization and quality**

## Running ESLint

```bash
# Check for linting errors
npm run lint

# Auto-fix fixable issues
npm run lint:fix
```

## Rule Categories

### 1. Vitest Best Practices

#### `vitest/expect-expect` (error)
Ensures every test has at least one `expect()` assertion.

**Why**: Tests without assertions don't validate behavior and waste CI resources.

```typescript
// ❌ Bad - no assertion
test('should render component', () => {
  render(<MyComponent />);
});

// ✅ Good - has assertion
test('should render component', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

#### `vitest/no-disabled-tests` (warn)
Warns about disabled tests (`test.skip`).

**Why**: Disabled tests indicate incomplete work or issues that should be addressed or removed.

```typescript
// ⚠️ Warning - disabled test
test.skip('should handle edge case', () => {
  // ...
});

// ✅ Good - either fix or remove
test('should handle edge case', () => {
  // ...
});
```

#### `vitest/no-focused-tests` (error)
Prevents focused tests (`test.only`, `describe.only`) from being committed.

**Why**: Focused tests skip other tests in CI, causing false positives.

```typescript
// ❌ Bad - focused test
test.only('should work', () => {
  // Only this test runs!
});

// ✅ Good - no focus modifier
test('should work', () => {
  // All tests run
});
```

#### `vitest/valid-expect` (error)
Ensures `expect()` calls are valid and properly formed.

**Why**: Invalid expect calls lead to silent test failures.

```typescript
// ❌ Bad - invalid expect
expect(); // empty
expect(value); // no matcher

// ✅ Good - valid expect
expect(value).toBe(expected);
expect(promise).resolves.toBe(value);
```

#### `vitest/no-identical-title` (warn)
Warns about tests with identical titles.

**Why**: Duplicate titles cause confusion in test reports.

```typescript
// ⚠️ Warning - duplicate titles
describe('UserService', () => {
  test('should create user', () => { /* ... */ });
  test('should create user', () => { /* ... */ }); // Duplicate!
});

// ✅ Good - unique titles
describe('UserService', () => {
  test('should create user with valid data', () => { /* ... */ });
  test('should create user with defaults', () => { /* ... */ });
});
```

#### `vitest/prefer-hooks-in-order` (warn)
Enforces consistent hook ordering (beforeEach → test → afterEach).

**Why**: Consistent ordering improves readability and maintainability.

```typescript
// ⚠️ Warning - hooks out of order
describe('MyTest', () => {
  test('should work', () => { /* ... */ });
  beforeEach(() => { /* ... */ });
  afterEach(() => { /* ... */ });
});

// ✅ Good - hooks before tests
describe('MyTest', () => {
  beforeEach(() => { /* ... */ });
  afterEach(() => { /* ... */ });
  test('should work', () => { /* ... */ });
});
```

#### `vitest/require-top-level-describe` (warn)
Encourages wrapping tests in describe blocks.

**Why**: Organized tests with describe blocks improve test structure and readability.

```typescript
// ⚠️ Warning - no describe block
test('should work', () => { /* ... */ });

// ✅ Good - wrapped in describe
describe('MyComponent', () => {
  test('should work', () => { /* ... */ });
});
```

#### `vitest/prefer-to-be` (warn)
Prefer specific matchers like `toBeNull()` over generic `toBe(null)`.

**Why**: Specific matchers provide better error messages.

```typescript
// ⚠️ Warning - generic matcher
expect(value).toBe(null);

// ✅ Good - specific matcher
expect(value).toBeNull();
```

#### `vitest/require-hook` (warn)
Ensures hooks are inside describe blocks.

**Why**: Prevents hooks from affecting unrelated tests.

```typescript
// ⚠️ Warning - standalone hook
beforeEach(() => {
  // Affects ALL tests in file!
});

test('should work', () => { /* ... */ });

// ✅ Good - hook scoped to describe
describe('MyTest', () => {
  beforeEach(() => {
    // Only affects tests in this describe
  });

  test('should work', () => { /* ... */ });
});
```

#### `vitest/no-duplicate-hooks` (error)
Prevents duplicate hooks in the same scope.

**Why**: Multiple identical hooks indicate confusion or mistakes.

```typescript
// ❌ Bad - duplicate hooks
describe('MyTest', () => {
  beforeEach(() => { /* setup 1 */ });
  beforeEach(() => { /* setup 2 */ });
});

// ✅ Good - single hook
describe('MyTest', () => {
  beforeEach(() => {
    // All setup here
  });
});
```

### 2. Memory Leak Prevention

#### Timer Cleanup Rules (error)

**Rule**: `vi.useFakeTimers()` must only be called inside `beforeEach()`

**Why**: Ensures proper cleanup via `afterEach()` and prevents timer leaks between tests.

```typescript
// ❌ Bad - useFakeTimers at module level
vi.useFakeTimers();

describe('MyTest', () => {
  test('should work', () => {
    // Timers leak to other tests!
  });
});

// ✅ Good - useFakeTimers in beforeEach
describe('MyTest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test('should work', () => {
    // Timers properly scoped
  });
});
```

**Rule**: `vi.useRealTimers()` should be called in `afterEach()`

**Why**: Ensures timer state is properly restored after each test.

```typescript
// ❌ Bad - manual cleanup in test
test('should work', () => {
  vi.useFakeTimers();
  // ... test code ...
  vi.useRealTimers(); // Easy to forget!
});

// ✅ Good - cleanup in afterEach
describe('MyTest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('should work', () => {
    // Cleanup guaranteed
  });
});
```

**Rule**: `vi.clearAllTimers()` should be called in `afterEach()`

**Why**: Prevents pending timers from leaking between tests.

```typescript
// ❌ Bad - no timer cleanup
describe('MyTest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test('should work', () => {
    setTimeout(() => { /* ... */ }, 1000);
    // Timer still pending!
  });
});

// ✅ Good - clear timers in afterEach
describe('MyTest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test('should work', () => {
    setTimeout(() => { /* ... */ }, 1000);
    // Timer cleaned up
  });
});
```

### 3. Standard Cleanup Pattern

**Required Pattern** for all tests using fake timers:

```typescript
describe('ComponentName', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test('test case', () => {
    // Test code here
  });
});
```

**Why This Pattern Works**:
1. **beforeEach**: Initializes fake timers before each test
2. **afterEach**: Clears pending timers and restores real timers
3. **Scoped**: Only affects tests in the describe block
4. **Automatic**: No manual cleanup required in tests
5. **Safe**: Prevents timer leaks between tests

## Configuration Files

### `.eslintrc.json`
Main ESLint configuration with TypeScript, React, and Vitest plugins.

### `.eslintignore`
Specifies files/directories to exclude from linting (node_modules, dist, coverage, etc.).

## Integration with CI/CD

Add to your CI pipeline:

```yaml
- name: Lint code
  run: npm run lint
```

The `--max-warnings 0` flag in the lint script ensures CI fails if any warnings are present.

## Common Violations and Fixes

### Violation: Timer at module level

```typescript
// ❌ ESLint Error
vi.useFakeTimers();

describe('MyTest', () => {
  // ...
});
```

**Fix**: Move to beforeEach
```typescript
// ✅ Fixed
describe('MyTest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ...
});
```

### Violation: Focused test

```typescript
// ❌ ESLint Error
test.only('should work', () => {
  // ...
});
```

**Fix**: Remove .only
```typescript
// ✅ Fixed
test('should work', () => {
  // ...
});
```

### Violation: Test without assertion

```typescript
// ❌ ESLint Error
test('should render', () => {
  render(<MyComponent />);
});
```

**Fix**: Add assertion
```typescript
// ✅ Fixed
test('should render', () => {
  render(<MyComponent />);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

## Disabling Rules

In rare cases, you may need to disable a rule:

```typescript
// Disable for one line
// eslint-disable-next-line vitest/expect-expect
test('visual test', () => {
  render(<MyComponent />);
});

// Disable for entire file (use sparingly!)
/* eslint-disable vitest/no-focused-tests */
```

**Important**: Always add a comment explaining WHY the rule is disabled.

## Benefits

1. **Prevents Memory Leaks**: Enforces proper timer cleanup
2. **Improves Test Quality**: Ensures tests have assertions
3. **Catches Mistakes**: Prevents focused/disabled tests in CI
4. **Consistency**: Enforces uniform test structure
5. **Automatic**: Catches issues before code review
6. **Documentation**: Rules serve as best practice guide

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [eslint-plugin-vitest](https://github.com/veritem/eslint-plugin-vitest)
- [ESLint no-restricted-syntax](https://eslint.org/docs/latest/rules/no-restricted-syntax)
