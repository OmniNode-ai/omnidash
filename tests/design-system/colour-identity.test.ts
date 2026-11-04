/**
 * OMN-22168 AC7: moving every colour into the design system must not change what a page draws. Two shifts the
 * browser census caught after the move, each pinned here so it fails before the fix and passes after:
 *   1. a chart given a page's own accent knob (Workflow's --workflow-timing-accent) resolved nothing, because the kit
 *      resolved only var(--ds-*), so the bars lost their card's colour;
 *   2. the local pages' pass and fail graphics were mapped to the generic status colours (--ds-ok, --ds-bad) instead
 *      of the canonical pass and fail field colours they drew before (--ds-field-pass, --ds-field-fail).
 * Each check has a control that shows the instrument can see the failure.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { colorToNumber } from '@/theme/design-system/color';

const root = resolve(__dirname, '../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('OMN-22168 AC7: a chart resolves a page accent knob to its colour', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--planted-accent');
    document.documentElement.style.removeProperty('--ds-planted-token');
  });

  it('control: a --ds-* token set on the root resolves to its colour', () => {
    document.documentElement.style.setProperty('--ds-planted-token', '#123456');
    expect(colorToNumber('var(--ds-planted-token)', 0xabcdef)).toBe(0x123456);
  });

  it('a page knob that is not a --ds-* token resolves too, never the fallback', () => {
    document.documentElement.style.setProperty('--planted-accent', '#fb923c');
    expect(colorToNumber('var(--planted-accent)', 0xabcdef)).toBe(0xfb923c);
  });

  it('control: an unset knob still falls back, so the check above is not always-pass', () => {
    expect(colorToNumber('var(--planted-accent)', 0xabcdef)).toBe(0xabcdef);
  });
});

/** The declarations of every rule whose selector names one of the local pass/fail graphics. */
function passFailRules(css: string): string[] {
  const graphics = [
    '.local-runs-week-bar > i[data-outcome="passed"]',
    '.local-runs-week-bar > i[data-outcome="failed"]',
    '.local-selected-quality-meter > span',
    '.local-overview-focus [data-component="overview',
  ];
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => graphics.some(g => selector.includes(g)))
    .map(([, selector, body]) => `${selector.trim()} { ${body.trim()} }`);
}

describe('OMN-22168 AC7: local pass and fail graphics draw the pass and fail field colours', () => {
  const sheets = ['src/styles/local-dashboard.css', 'src/styles/seven-page-design.css'];

  it('control: the scan finds the graphics, and would catch a status colour on one', () => {
    const rules = sheets.flatMap(path => passFailRules(source(path)));
    expect(rules.length).toBeGreaterThanOrEqual(7);
    const planted = passFailRules('.local-runs-week-bar > i[data-outcome="passed"] { background: var(--ds-ok); }');
    expect(planted.filter(rule => /var\(--ds-(ok|bad)\)/.test(rule))).toHaveLength(1);
  });

  it('no pass or fail graphic reads --ds-ok or --ds-bad', () => {
    const rules = sheets.flatMap(path => passFailRules(source(path)));
    expect(rules.filter(rule => /var\(--ds-(ok|bad)\)/.test(rule))).toEqual([]);
    expect(rules.every(rule => /var\(--ds-field-(pass|fail)\)/.test(rule))).toBe(true);
  });

  it("the Overview charts' pass and fail swatches are the field colours", () => {
    const charts = source('src/pages/local/insight-charts.tsx');
    expect(charts).toMatch(/^const PASS = 'var\(--ds-field-pass\)';$/m);
    expect(charts).toMatch(/^const FAIL = 'var\(--ds-field-fail\)';$/m);
  });
});
