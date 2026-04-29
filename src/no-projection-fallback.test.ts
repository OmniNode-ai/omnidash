/**
 * OMN-10304: no-projection-fallback ESLint rule unit tests
 *
 * Pattern follows src/typography-compliance.test.ts: import ESLint via
 * string-concat so Vite can't statically resolve the dev-dep at bundle time,
 * then use ESLint.lintText() to drive the rule.
 *
 * 3 positive tests (rule fires) + 3 negative tests (rule does NOT fire).
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// Fixture path helpers — filePath drives which ESLint config block applies.
// Must be under src/ to hit the `src/**` config block that enables the rule.
const SRC_FILE = resolve(ROOT, 'src/__lint_fixture_projection.tsx');
const TEST_FILE = resolve(ROOT, 'src/__lint_fixture_projection.test.tsx');

async function lint(code: string, filePath: string) {
  // String-concat prevents Vite's static-import analyzer from trying to
  // bundle eslint (which is a dev dep not available in Vite's module graph).
  const eslintModule = 'es' + 'lint';
  const { ESLint } = await import(eslintModule);
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(
    (m: { ruleId?: string }) => m.ruleId?.endsWith('no-projection-fallback'),
  );
}

// ── Positive tests: rule MUST fire ──────────────────────────────────────────

describe('no-projection-fallback: positive (rule fires)', () => {
  it('flags ?? 0 on a direct member-expression from useProjectionQuery data', async () => {
    const code = `
      import { useProjectionQuery } from '@/hooks/useProjectionQuery';
      function Widget() {
        const { data } = useProjectionQuery({ topic: 'test', queryKey: [] });
        return data.map((d) => d.total_cost_usd ?? 0);
      }
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });

  it('flags || 0 on a member-expression from useProjectionQuery data', async () => {
    const code = `
      import { useProjectionQuery } from '@/hooks/useProjectionQuery';
      function Widget() {
        const { data } = useProjectionQuery({ topic: 'test', queryKey: [] });
        return data.map((d) => d.total_cost_usd || 0);
      }
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });

  it('flags destructuring default on a projection row result', async () => {
    const code = `
      import { useProjectionQuery } from '@/hooks/useProjectionQuery';
      function Widget() {
        const { data } = useProjectionQuery({ topic: 'test', queryKey: [] });
        const row = data[0];
        const { total_tokens = 0 } = row;
        return total_tokens;
      }
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'expected a violation').toBeGreaterThan(0);
  });
});

// ── Negative tests: rule MUST NOT fire ──────────────────────────────────────

describe('no-projection-fallback: negative (rule silent)', () => {
  it('does not flag ?? 0 on a layout numeric literal (margin)', async () => {
    const code = `
      function Widget() {
        const margin = someConfig?.margin ?? 0;
        return margin;
      }
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'unexpected violation on layout literal').toBe(0);
  });

  it('does not flag ?? 0 on a Map.get accumulator lookup', async () => {
    const code = `
      import { useProjectionQuery } from '@/hooks/useProjectionQuery';
      function Widget() {
        const { data } = useProjectionQuery({ topic: 'test', queryKey: [] });
        const acc = new Map();
        for (const d of data) {
          acc.set(d.model, (acc.get(d.model) ?? 0) + 1);
        }
        return acc;
      }
    `;
    const msgs = await lint(code, SRC_FILE);
    expect(msgs.length, 'unexpected violation on Map.get accumulator').toBe(0);
  });

  it('does not flag violations in test files', async () => {
    const code = `
      import { useProjectionQuery } from '@/hooks/useProjectionQuery';
      function Widget() {
        const { data } = useProjectionQuery({ topic: 'test', queryKey: [] });
        return data.map((d) => d.total_cost_usd ?? 0);
      }
    `;
    const msgs = await lint(code, TEST_FILE);
    expect(msgs.length, 'rule should not fire in test files').toBe(0);
  });
});
