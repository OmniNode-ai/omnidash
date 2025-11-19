# ESLint Setup for Test Cleanup

This document provides a quick overview of the ESLint configuration added to enforce test cleanup patterns.

## Quick Start

```bash
# Check for linting errors
npm run lint

# Auto-fix fixable issues
npm run lint:fix
```

## What Was Added

### 1. Dependencies

Added to `package.json` devDependencies:
- `eslint@^9.18.0` - Core ESLint engine
- `@typescript-eslint/eslint-plugin@^8.18.0` - TypeScript linting rules
- `@typescript-eslint/parser@^8.18.0` - TypeScript parser for ESLint
- `eslint-plugin-react@^7.37.3` - React-specific rules
- `eslint-plugin-react-hooks@^5.1.0` - React Hooks rules
- `eslint-plugin-vitest@^0.5.4` - Vitest-specific test rules

### 2. Configuration Files

**`eslint.config.js`** - Main ESLint configuration using flat config format (ESLint v9+)
- Base TypeScript configuration for all `.ts` and `.tsx` files
- React-specific rules for client code
- Server-specific rules allowing console logs
- **Test-specific rules** for `*.test.ts`, `*.test.tsx`, and `__tests__/` directories

### 3. NPM Scripts

Added to `package.json`:
```json
{
  "lint": "eslint . --ext .ts,.tsx --max-warnings 0",
  "lint:fix": "eslint . --ext .ts,.tsx --fix"
}
```

## Key Rules for Tests

### Memory Leak Prevention

1. **`vi.useFakeTimers()` must be in `beforeEach()`**
   - ❌ Module-level timer initialization
   - ✅ Inside beforeEach hook

2. **`vi.useRealTimers()` must be in `afterEach()`**
   - ❌ Manual cleanup in tests
   - ✅ Inside afterEach hook

3. **`vi.clearAllTimers()` must be in `afterEach()`**
   - ❌ Cleanup in test body
   - ✅ Inside afterEach hook

### Vitest Best Practices

- `vitest/expect-expect` - Every test must have assertions
- `vitest/no-focused-tests` - No `test.only` or `describe.only`
- `vitest/no-disabled-tests` - Warn about `test.skip`
- `vitest/valid-expect` - Ensure expect() calls are valid
- `vitest/no-identical-title` - Unique test titles
- `vitest/prefer-hooks-in-order` - Consistent hook ordering
- `vitest/require-top-level-describe` - Wrap tests in describe blocks
- `vitest/require-hook` - Hooks must be inside describe blocks
- `vitest/no-duplicate-hooks` - No duplicate hooks in same scope

## Standard Test Pattern

All tests using timers should follow this pattern:

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
    // Test code with assertions
    expect(something).toBe(expected);
  });
});
```

## Integration with CI/CD

The `--max-warnings 0` flag ensures that any warnings are treated as errors in CI pipelines:

```yaml
- name: Lint code
  run: npm run lint
```

This prevents code with warnings from being merged.

## Common Fixes

### Fix 1: Move timers to beforeEach

**Before:**
```typescript
vi.useFakeTimers();

describe('MyTest', () => {
  test('should work', () => {
    // ...
  });
});
```

**After:**
```typescript
describe('MyTest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test('should work', () => {
    // ...
  });
});
```

### Fix 2: Remove focused tests

**Before:**
```typescript
test.only('should work', () => {
  // ...
});
```

**After:**
```typescript
test('should work', () => {
  // ...
});
```

### Fix 3: Add assertions

**Before:**
```typescript
test('should render', () => {
  render(<MyComponent />);
});
```

**After:**
```typescript
test('should render', () => {
  render(<MyComponent />);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

## Benefits

1. **Prevents Memory Leaks** - Enforces proper timer cleanup between tests
2. **Catches Mistakes Early** - Finds issues before code review
3. **Consistency** - Enforces uniform patterns across all tests
4. **Automatic Enforcement** - Runs in CI/CD pipeline
5. **Documentation** - Rules serve as living best practices guide

## Documentation

For detailed rule explanations and examples, see:
- `docs/ESLINT_TEST_RULES.md` - Comprehensive rule documentation
- `eslint.config.js` - Configuration with inline comments

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [eslint-plugin-vitest](https://github.com/veritem/eslint-plugin-vitest)
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [ESLint no-restricted-syntax](https://eslint.org/docs/latest/rules/no-restricted-syntax)
