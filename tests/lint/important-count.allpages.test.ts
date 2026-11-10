// OMN-23330 AC30: no stylesheet under src/theme/design-system uses !important, and the count of !important across src
// never rises and falls below the 811 measured on 2026-11-09. Measured 2026-11-10: 808 before this change, 0 after. Each
// former !important declaration is a normal one in a copy of its rule whose selector carries :not(#ds-important), which
// matches every element and adds an id's weight, so it still wins over every class rule as the flag did; the four places
// where a flag had beaten an inline style now set a custom property the stylesheet reads (table columns, the Runs table
// width, the widget dashboard column, the chart canvas height). The AC32 capture of all twelve pages matched before and
// after, apart from the dashboard's live refresh countdown.
// Failure modes:
//   I1  a stylesheet under src/theme/design-system declares !important;
//   I2  the count across src rises above the recorded 0 (and so above 811);
//   I3  the counter is blind: it misses a planted !important, or counts the word in a comment or a selector.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const RECORDED = 0;
const BASELINE_2026_11_09 = 811;

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return stylesheets(file);
    return name.endsWith('.css') ? [file] : [];
  });
}
/** Declarations marked !important in a stylesheet's text (never the word in a comment or a selector). */
export function importantCount(css: string): number {
  let count = 0;
  postcss.parse(css).walkDecls((decl) => { if (decl.important) count += 1; });
  return count;
}

describe('OMN-23330 AC30: no !important', () => {
  const files = stylesheets(path.join(ROOT, 'src')).map((file) => ({ file: path.relative(ROOT, file), css: readFileSync(file, 'utf8') }));

  it('I1: no stylesheet under src/theme/design-system declares !important', () => {
    const kit = files.filter(({ file }) => file.startsWith('src/theme/design-system/'));
    expect(kit.length).toBeGreaterThan(5);
    expect(kit.filter(({ css }) => importantCount(css) > 0).map(({ file }) => file)).toEqual([]);
  });

  it('I2: the count across src does not rise above the recorded 0, under the 811 of 2026-11-09', () => {
    const total = files.reduce((sum, { css }) => sum + importantCount(css), 0);
    expect(total).toBeLessThanOrEqual(RECORDED);
    expect(total).toBeLessThan(BASELINE_2026_11_09);
    expect(files.length).toBeGreaterThan(20);
  });

  it('I3 control: a planted !important is counted; the word in a comment or a selector is not', () => {
    expect(importantCount('.a { color: red !important; margin: 0; }')).toBe(1);
    expect(importantCount('/* never !important */ .a:not(#ds-important) { color: red; }')).toBe(0);
  });
});
