/**
 * OMN-13131 (W6, G-I): cross-renderer no-projection enforcement gate.
 *
 * Generalizes `no-projection-fallback` (which was React/useProjectionQuery-keyed)
 * into a CROSS-RENDERER gate: a renderer of ANY platform that surfaces an
 * empty/blocked state must use a TYPED reason VALUE from the canonical
 * `EnumEmptyStateReason` vocabulary — never an invented synonym, never a blank.
 *
 * CRITICAL (plan §0b.5): the rule keys on the enum VALUES
 * ('no-data' | 'missing-field' | 'upstream-blocked' | 'schema-invalid'), NOT the
 * symbol name (the hand-authored type is `EmptyStateReason`; the generated mirror
 * is `EnumEmptyStateReason` — both carry the same four values).
 *
 * Cross-renderer proof: the positive/negative cases below are exercised against a
 * PLAIN .ts module (non-chart, non-React) — proving the gate is not chart-only
 * and not React-only.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// A plain (non-React, non-chart) .ts surface under src/ — proves cross-renderer.
const NON_REACT_TS_FILE = resolve(ROOT, 'src/__lint_fixture_empty_state.ts');
const TEST_FILE = resolve(ROOT, 'src/__lint_fixture_empty_state.test.ts');

async function lint(code: string, filePath: string) {
  const eslintModule = 'es' + 'lint';
  const { ESLint } = await import(eslintModule);
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(
    (m: { ruleId?: string }) => m.ruleId?.endsWith('no-untyped-empty-state'),
  );
}

describe('no-untyped-empty-state: positive (rule fires) — cross-renderer, non-React/non-chart', () => {
  it('flags an INVALID reason value on a `reason` property (plain TS module)', async () => {
    const code = `
      type State = { reason: string };
      export function classify(): State {
        // 'error' is NOT in the canonical EnumEmptyStateReason vocabulary.
        return { reason: 'error' };
      }
    `;
    const msgs = await lint(code, NON_REACT_TS_FILE);
    expect(msgs.length, 'expected a violation on invalid reason value').toBeGreaterThan(0);
  });

  it('flags an invented synonym on an emptyStateReason property', async () => {
    const code = `
      export const cell = { emptyStateReason: 'not-found' };
    `;
    const msgs = await lint(code, NON_REACT_TS_FILE);
    expect(msgs.length, 'expected a violation on synonym value').toBeGreaterThan(0);
  });

  it('flags an invalid reason on a snake_case empty_state_reason property', async () => {
    const code = `
      export const row = { empty_state_reason: 'blank' };
    `;
    const msgs = await lint(code, NON_REACT_TS_FILE);
    expect(msgs.length, 'expected a violation on snake_case reason').toBeGreaterThan(0);
  });
});

describe('no-untyped-empty-state: negative (rule silent) — keyed on VALUES, not symbol name', () => {
  it('does NOT flag a valid canonical reason VALUE', async () => {
    const code = `
      export const blocked = { reason: 'upstream-blocked' };
    `;
    const msgs = await lint(code, NON_REACT_TS_FILE);
    expect(msgs.length, 'valid value must not fire').toBe(0);
  });

  it('does NOT flag all four canonical values', async () => {
    const code = `
      export const a = { reason: 'no-data' };
      export const b = { reason: 'missing-field' };
      export const c = { reason: 'upstream-blocked' };
      export const d = { reason: 'schema-invalid' };
    `;
    const msgs = await lint(code, NON_REACT_TS_FILE);
    expect(msgs.length, 'all canonical values must pass').toBe(0);
  });

  it('does NOT flag string literals on unrelated properties', async () => {
    const code = `
      export const cfg = { title: 'error', label: 'not-found', name: 'blank' };
    `;
    const msgs = await lint(code, NON_REACT_TS_FILE);
    expect(msgs.length, 'unrelated properties must not fire').toBe(0);
  });

  it('does NOT flag violations in test/fixture files', async () => {
    const code = `
      export const x = { reason: 'error' };
    `;
    const msgs = await lint(code, TEST_FILE);
    expect(msgs.length, 'rule must not fire in test files').toBe(0);
  });
});
