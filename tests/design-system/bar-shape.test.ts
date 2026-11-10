// @vitest-environment node
/**
 * OMN-22168 AC3 (Lakshman 2026-11-04: "3px rounded tops, unify all bars"): every chart bar takes its corners from one
 * token, --ds-radius-bar, so the whole dashboard draws one bar shape. Failure modes this catches:
 *   1. a chart picks its own corner radius (a px literal, or an ECharts radius array written in place);
 *   2. a bar family draws square while the others are rounded (the ranked bars behind Model usage and Tier mix had no
 *      radius at all, while the daily columns had 3px and the Runs charts 4px);
 *   3. the token goes missing, so every bar silently falls back to whatever the browser draws.
 * Each check sits beside a planted control that shows it can fail.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pageStylesheet } from '@/tests/page-stylesheet';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const KIT_BARS = 'src/theme/design-system/charts/bar-charts.tsx';
// OMN-23330 AC29: each page stylesheet is read whole, its kit part included (src/tests/page-stylesheet.ts).
const SHEETS = ['local-dashboard', 'seven-page-design'] as const;

/** flatBar(...) calls whose corners are an array written in place instead of barRadius(...). */
function literalRadiusCalls(source: string): string[] {
  return [...source.matchAll(/flatBar\((?:[^()]|\([^()]*\))*?,\s*\[[^\]]*\]\s*\)/g)].map(m => m[0])
    .filter(call => !/^flatBar\(colour: string/.test(call));
}

/** Bar rules (.rb-bar, .ins-seg, .gdb-bar) that set a corner radius without the token. */
function barRadiusLeaks(css: string): string[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => /\.(rb-bar|ins-seg|gdb-bar)\b/.test(selector))
    .filter(([, , body]) => /border-radius\s*:/.test(body))
    .filter(([, , body]) => !/border-radius\s*:[^;]*var\(--ds-radius-bar\)/.test(body) || /border-radius\s*:[^;]*[1-9]\d*(\.\d+)?px/.test(body))
    .map(([, selector, body]) => `${selector.trim()} { ${body.trim()} }`);
}

describe('OMN-22168: every chart bar draws one shape', () => {
  it('the token holds the 3px rounded end', () => {
    expect(read('src/theme/design-system/tokens.css')).toMatch(/--ds-radius-bar:\s*3px;/);
  });

  it('control: a chart that writes its own corners in place is caught', () => {
    expect(literalRadiusCalls('itemStyle: flatBar(color, [4, 4, 0, 0])')).toHaveLength(1);
    expect(literalRadiusCalls("itemStyle: flatBar(colours[i]!, barRadius('horizontal'))")).toEqual([]);
  });

  it("every kit bar takes its corners from barRadius, never an array of its own", () => {
    const source = read(KIT_BARS);
    expect(source.match(/flatBar\(/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(literalRadiusCalls(source)).toEqual([]);
  });

  it('control: a bar rule with a px radius is caught, and one reading the token passes', () => {
    expect(barRadiusLeaks('.rb-chart .rb-bar { border-radius: 4px; }')).toHaveLength(1);
    expect(barRadiusLeaks('.ins-seg { border-radius: var(--ds-radius-bar) var(--ds-radius-bar) 0 0; }')).toEqual([]);
  });

  it('no bar stylesheet rule sets its own corner radius', () => {
    expect(SHEETS.flatMap(name => barRadiusLeaks(pageStylesheet(name)))).toEqual([]);
  });

  it('the ranked bars behind Model usage and Tier mix are rounded by the token, not square', () => {
    const css = pageStylesheet('seven-page-design');
    const base = /\.rb-chart \.rb-bar \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(base, 'the base ranked bar rule').toMatch(/border-radius:\s*var\(--ds-radius-bar\) var\(--ds-radius-bar\) 0 0/);
  });
});
