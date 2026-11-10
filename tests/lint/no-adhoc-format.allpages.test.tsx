// OMN-23330 AC20: no toFixed, toLocaleString, toLocaleDateString or toLocaleTimeString call sits outside src/theme/format,
// and an ESLint rule (local/no-adhoc-format) refuses a new one. Measured 2026-11-10 before the change: 214 such calls in
// about 70 files, each free to round, group and date its own way.
// Failure modes:
//   L1  a call survives somewhere in src (the rule runs over the whole tree with the repo's own config);
//   L2  the rule does not fire on a planted call, through optional chaining or a computed name;
//   L3  the rule fires inside src/theme/format, the one place these calls belong, or on a test or story;
//   L4  the rule is not switched on for src in the repo's config.
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const RULE = 'local/no-adhoc-format';
const eslint = new ESLint({ cwd: ROOT });

async function hits(code: string, file: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return result!.messages.filter((message) => message.ruleId === RULE).length;
}

describe('OMN-23330 AC20: formatting calls live only in src/theme/format', () => {
  it('L1: no call sits anywhere else in src', async () => {
    const results = await eslint.lintFiles(['src/**/*.{ts,tsx}']);
    const found = results.flatMap((result) => result.messages.filter((message) => message.ruleId === RULE)
      .map((message) => `${path.relative(ROOT, result.filePath)}:${message.line}`));
    expect(found).toEqual([]);
    expect(results.length).toBeGreaterThan(500);
  }, 240_000);

  it('L2: the rule fires on each planted call, plain, optional and computed', async () => {
    const planted = [
      'export const a = (n: number) => n.toFixed(2);',
      'export const b = (n?: number) => n?.toLocaleString("en-US");',
      'export const c = (d: Date) => d.toLocaleDateString("en-US");',
      'export const d = (d: Date) => d["toLocaleTimeString"]();',
    ];
    for (const code of planted) expect({ code, hits: await hits(code, 'src/pages/planted.ts') }).toEqual({ code, hits: 1 });
  });

  it('L3: inside src/theme/format, and in tests and stories, the same calls are allowed', async () => {
    const code = 'export const a = (n: number) => n.toFixed(2);';
    expect(await hits(code, 'src/theme/format/planted.ts')).toBe(0);
    expect(await hits(code, 'src/pages/planted.test.ts')).toBe(0);
    expect(await hits(code, 'src/pages/planted.stories.tsx')).toBe(0);
  });

  it('L4: the repo config switches the rule on for src', async () => {
    const config = await eslint.calculateConfigForFile(path.join(ROOT, 'src/pages/LocalDashboardPage.tsx'));
    expect(config.rules?.[RULE]?.[0] ?? config.rules?.[RULE]).toBe(2);
  });
});
