// OMN-22168 (Jonah 2026-11-06, "regression on truncating $ to 2 decimals"; 2026-11-07, "the decimal place issue is still
// showing up for me"): every dollar figure the Usage analysis prints follows the one display rule (two decimals from $1
// up, up to four under $1, digits cut and never rounded up). Failure modes, each a test below:
//   U1  the Usage analysis still formats through src/lib/currency (up to six decimals) or its own toFixed(3) case
//   U2  the rule itself: a sub-cent saving, a float-noisy spend, a thousands total and zero
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDashboardUsd } from '@/lib/format';

describe('OMN-22168: Usage analysis money follows the two-decimal rule', () => {
  it('U1: usage-analysis.tsx formats money only through the dashboard rule', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/local/usage-analysis.tsx'), 'utf8');
    expect(source).not.toContain('@/lib/currency');
    expect(source).not.toContain('toFixed(3)');
    expect(source).toContain("from '@/lib/format'");
    // No call to the old formatter is left: every money call is the dashboard rule.
    expect(source.match(/\bformatUsd\(/g)).toBeNull();
  });

  it.each([
    [0.028702, '$0.0287'],
    [3.7580399999999985, '$3.75'],
    [1813.3308790000435, '$1,813.33'],
    [0, '$0.00'],
  ])('U2: %s prints as %s', (value, text) => {
    expect(formatDashboardUsd(value)).toBe(text);
  });
});
