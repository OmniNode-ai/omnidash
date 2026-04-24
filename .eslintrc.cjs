// ESLint legacy (.eslintrc) config, ESLint 8.x.
//
// Purpose: wire the local/no-typography-inline rule — defined in
// eslint-rules/ and installed as eslint-plugin-local — into the project
// lint pass. See docs/adr/001-typography-system.md for rationale.
//
// We parse .ts/.tsx with @typescript-eslint/parser (no type-aware
// rules, no recommended configs). This config intentionally does NOT
// expand lint surface beyond the typography rule on this branch;
// broader style/lint coverage is a separate follow-up.
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['local'],
  rules: {
    'local/no-typography-inline': 'error',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    'fixtures/',
    'dashboard-layouts/',
    'public/',
    'src/shared/types/generated/',
    '*.d.ts',
  ],
};
