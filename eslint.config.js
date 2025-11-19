import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import vitest from 'eslint-plugin-vitest';

export default [
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.log',
      '**/.DS_Store',
      '**/package-lock.json',
      '**/yarn.lock',
      '**/pnpm-lock.yaml',
    ],
  },

  // Base TypeScript configuration for all files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Enforce best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },

  // Client-side React configuration
  {
    files: ['client/src/**/*.ts', 'client/src/**/*.tsx'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Server-side configuration
  {
    files: ['server/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Test files configuration with vitest rules
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
    ],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      // ==========================================
      // VITEST BEST PRACTICES
      // ==========================================

      // Ensure tests have at least one expect() call
      'vitest/expect-expect': 'error',

      // Disallow disabled tests (test.skip) - they should be removed or fixed
      'vitest/no-disabled-tests': 'warn',

      // Prevent focused tests (test.only) from being committed
      'vitest/no-focused-tests': 'error',

      // Ensure expect() calls are valid and properly formed
      'vitest/valid-expect': 'error',

      // Warn about identical test titles that can cause confusion
      'vitest/no-identical-title': 'warn',

      // Enforce consistent hook ordering (beforeEach before test)
      'vitest/prefer-hooks-in-order': 'warn',

      // Encourage wrapping tests in describe blocks for organization
      'vitest/require-top-level-describe': 'warn',

      // Prefer toBeNull() over toBe(null) for better error messages
      'vitest/prefer-to-be': 'warn',

      // Ensure hooks are inside describe blocks (not standalone)
      'vitest/require-hook': 'warn',

      // Prevent duplicate hooks in the same scope
      'vitest/no-duplicate-hooks': 'error',

      // ==========================================
      // MEMORY LEAK PREVENTION
      // ==========================================

      // NOTE: The no-restricted-syntax rules below use AST selectors to detect
      // timer-related calls at problematic locations. These rules are intentionally
      // simplified to avoid false positives while still catching the most critical
      // memory leak pattern: timer initialization at module level.
      //
      // For a more comprehensive check, rely on code review and the test cleanup
      // documentation in docs/ESLINT_TEST_RULES.md

      'no-restricted-syntax': [
        'error',
        {
          // Catch vi.useFakeTimers() at module level (not inside any function)
          // This is the most critical memory leak pattern
          selector: 'Program > ExpressionStatement > CallExpression[callee.object.name="vi"][callee.property.name="useFakeTimers"]',
          message: 'vi.useFakeTimers() at module level causes timer leaks. Move it inside beforeEach() to ensure proper cleanup in afterEach(). See docs/ESLINT_TEST_RULES.md for the standard pattern.',
        },
      ],

      // ==========================================
      // CLEANUP PATTERNS
      // ==========================================

      // Allow console methods in tests for debugging
      'no-console': 'off',

      // Allow any type in tests for mocking purposes
      '@typescript-eslint/no-explicit-any': 'off',

      // Allow non-null assertions in tests
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
