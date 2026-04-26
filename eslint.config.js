// ESLint 9 flat config.
// Migrated from .eslintrc.cjs as part of Bundle 4 (M12 + M13).
//
// Rule layering (intentionally narrow on top of the recommended sets):
//   1. ESLint core recommended.
//   2. typescript-eslint recommended (non-type-aware — keeps lint fast).
//   3. react-hooks recommended (catches the `if (!editMode) return; useEffect(...)`
//      kind of conditional-hook bug we'd otherwise eat in production).
//   4. Local plugin rules:
//      - local/no-typography-inline (existing — see ADR 001).
//      - local/no-cast-on-parsed-json (cluster B capstone — bans `as`
//        casts immediately after `JSON.parse(...)` so the only way to
//        cross the I/O type boundary is through a validator).
//
// Rules I deliberately do NOT enable yet (would cascade into many
// pre-existing fixes that should be their own ticket):
//   - typescript-eslint/strict
//   - typescript-eslint/recommended-type-checked (requires parserOptions.project)
//   - react-hooks/exhaustive-deps (we have a few intentional one-shot
//     effects whose dep arrays are intentionally narrow; turning this
//     on without auditing would generate noise).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import localPlugin from 'eslint-plugin-local';
import globals from 'globals';

export default [
  {
    // Project-wide ignores. Matches the old .eslintrc.cjs ignorePatterns
    // plus a handful of generated-output paths that didn't exist on the
    // legacy config but do now.
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'fixtures/**',
      'dashboard-layouts/**',
      'public/**',
      'src/shared/types/generated/**',
      '**/*.d.ts',
      'storybook-static/**',
      '.vite/**',
      // Storybook's own files use globals + types ESLint can't always resolve;
      // they're sanity-checked by `storybook build` instead.
      '.storybook/**',
    ],
  },

  // Recommended layers. typescript-eslint config exports an array; spread it.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // The local plugin's typography rule + the new no-cast-on-parsed-json
  // rule both apply to all .ts/.tsx files.
  {
    files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts', 'server/**/*.ts'],
    plugins: {
      local: localPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
      },
    },
    rules: {
      'local/no-typography-inline': 'error',
      'local/no-cast-on-parsed-json': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // `exhaustive-deps` is set to `warn` rather than `error` so that
      // genuine one-shot effects (mount-only hydration, resize observer
      // setup, etc.) can carry an inline `// eslint-disable-next-line
      // react-hooks/exhaustive-deps -- <reason>` comment instead of
      // breaking the build. The lint surface is "max-warnings=0" so
      // unaddressed warnings still fail; a real warning is just an
      // un-justified deps mismatch.
      'react-hooks/exhaustive-deps': 'warn',
      // Conservative pragma: the codebase has many intentional
      // narrowing casts (`as const`, `as Foo` for narrowing in test
      // fixtures, etc.) and turning on no-explicit-any across the
      // tree would cascade into a large list. Allow `any` for now;
      // the no-cast-on-parsed-json rule covers the boundary case the
      // review actually called out. Tightening to ban-all-explicit-any
      // is its own ticket.
      '@typescript-eslint/no-explicit-any': 'off',
      // The codebase uses `_prefix` for intentionally-unused params
      // (Connect middleware `_next`, etc.). Honor that convention.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Local rule source files use CommonJS. ESLint's recommended bans
  // require() in ESM-context files; this carve-out keeps eslint-rules/
  // happy without disabling the rule globally.
  {
    files: ['eslint-rules/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
