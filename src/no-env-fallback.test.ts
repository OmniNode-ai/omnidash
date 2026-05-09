/**
 * OMN-10739: no-env-fallback ESLint rule unit tests
 *
 * Pattern follows src/no-projection-fallback.test.ts: import ESLint via
 * string-concat so Vite can't statically resolve the dev-dep at bundle time,
 * then use ESLint.lintText() to drive the rule.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

const SRC_FILE = resolve(ROOT, 'src/__lint_fixture_env_fallback.tsx');
const TEST_FILE = resolve(ROOT, 'src/__lint_fixture_env_fallback.test.tsx');

async function lint(code: string, filePath: string) {
  const eslintModule = 'es' + 'lint';
  const { ESLint } = await import(eslintModule);
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(
    (m: { ruleId?: string }) => m.ruleId?.endsWith('no-env-fallback'),
  );
}

// ── Positive tests: rule MUST fire ──────────────────────────────────────────

describe('no-env-fallback: positive (rule fires)', () => {
  it('flags ?? string fallback on VITE_ env var', async () => {
    const code = `
      const url = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });

  it('flags || string fallback on VITE_ env var', async () => {
    const code = `
      const model = import.meta.env.VITE_LLM_MODEL || 'qwen3-coder-30b-awq';
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });

  it('flags non-null ?? fallback on VITE_ env var', async () => {
    const code = `
      const key = import.meta.env.VITE_API_KEY ?? 'not-needed';
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });
});

// ── Negative tests: rule MUST NOT fire ──────────────────────────────────────

describe('no-env-fallback: negative (rule silent)', () => {
  it('does not flag Vite builtins (DEV, PROD, MODE)', async () => {
    const code = `
      const isDev = import.meta.env.DEV ?? false;
      const mode = import.meta.env.MODE ?? 'development';
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected no violations').toBe(0);
  });

  it('does not flag ?? null (honest null-coercion)', async () => {
    const code = `
      const url = import.meta.env.VITE_API_URL ?? null;
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected no violations').toBe(0);
  });

  it('does not flag ?? undefined (honest null-coercion)', async () => {
    const code = `
      const url = import.meta.env.VITE_API_URL ?? undefined;
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected no violations').toBe(0);
  });

  it('does not flag ?? with a named constant (not a string literal)', async () => {
    const code = `
      const NO_AUTH_SENTINEL = 'not-needed';
      const apiKey = import.meta.env.VITE_LLM_API_KEY ?? NO_AUTH_SENTINEL;
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected no violations for named constant fallback').toBe(0);
  });

  it('does not flag env reads in test files', async () => {
    const code = `
      const url = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';
    `;
    const msgs = await lint(code, TEST_FILE);
    expect(msgs.length, 'expected no violations in test file').toBe(0);
  });
});
