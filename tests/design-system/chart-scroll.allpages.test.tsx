// @vitest-environment jsdom
// OMN-23330 AC4 (the operator's 2026-11-09 review: Overview Model usage showed 11 of its 13 models behind a scroll with
// no scrollbar; measured live 2026-11-10 01:52Z: the box 1,126 px, its content 1,327 px, the drawn scrollbar 0 px).
// Every kit chart whose content can be wider than its box scrolls inside the kit's one scroll container, whose
// scrollbar is always drawn. macOS draws overlay scrollbars only while scrolling unless the scrollbar is styled with
// ::-webkit-scrollbar, and Chrome ignores those rules once the standard scrollbar-width or scrollbar-color is set.
// Failure modes:
//   S1  a wide chart (ranked bars, grouped bars) scrolls in a container of its page, not the kit's;
//   S2  the kit container hides its scrollbar: no ::-webkit-scrollbar height, a transparent thumb, or a standard
//       scrollbar-width / scrollbar-color in the rule Chrome reads, which turns the ::-webkit-scrollbar styling off;
//   S3  a page stylesheet still sets its own horizontal overflow on a chart, so two scroll boxes nest or one is unmarked.
// The live Chrome readback (the drawn scrollbar's height, and the last model reached at the end of the scroll) is AC4's
// second proof, run on the page.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupedBars, RankedBars } from '@/theme/design-system/charts';

const ROOT = path.resolve(__dirname, '../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const KIT_CSS = 'src/theme/design-system/charts/chart-scroll.css';
const PAGE_CSS = ['src/styles/seven-page-design.css', 'src/styles/editorial.css', 'src/styles/local-dashboard.css'];

/** Every declaration of every rule whose selector names the given class, in one stylesheet. */
function declarations(css: string, className: string): Array<{ selector: string; prop: string; value: string }> {
  const out: Array<{ selector: string; prop: string; value: string }> = [];
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selector.includes(className)) return;
    rule.walkDecls((decl) => { out.push({ selector: rule.selector, prop: decl.prop, value: decl.value }); });
  });
  return out;
}

const items = Array.from({ length: 13 }, (_, index) => ({ key: `m${index}`, name: `model-${index}`, value: 13 - index,
  display: String(13 - index), basis: 'measured' as const, color: 'var(--ds-field-model)' }));

/** Each page stylesheet rule that gives a chart its own horizontal scroll. */
function pageChartScrolls(sheets: ReadonlyArray<{ file: string; css: string }>): string[] {
  const chartSelector = /\.(rb-chart|rb-plot|gdb-plot|ins-bars|local-model-usage)\b/;
  return sheets.flatMap(({ file, css }) => {
    const hits: string[] = [];
    postcss.parse(css).walkDecls(/^overflow(-x)?$/, (decl) => {
      const selector = (decl.parent as postcss.Rule).selector ?? '';
      if (chartSelector.test(selector) && /auto|scroll/.test(decl.value)) hits.push(`${file}: ${selector} { ${decl.prop}: ${decl.value} }`);
    });
    return hits;
  });
}

describe('OMN-23330 AC4: wide charts scroll in the kit container, with a scrollbar always drawn', () => {
  it('S1: ranked bars and grouped bars draw their plot inside the kit scroll container', () => {
    const ranked = render(<RankedBars layout="vertical" many="scroll" label="Model usage" unit="runs" items={items} />);
    expect(ranked.container.querySelector('.ds-chart-scroll .rb-plot')).not.toBeNull();
    ranked.unmount();
    const grouped = render(<GroupedBars label="Tokens by model" groups={items.map((item) => ({ key: item.key, label: item.name, name: item.name,
      values: [{ key: 'in', label: 'in', value: item.value, display: item.display, color: 'var(--ds-field-tokens-in)', tone: 'tokens-in' }] }))} />);
    expect(grouped.container.querySelector('.ds-chart-scroll .gdb-plot')).not.toBeNull();
  });

  it('S2: the kit container scrolls sideways and its scrollbar is always drawn', () => {
    const css = read(KIT_CSS);
    const rules = declarations(css, 'ds-chart-scroll');
    const value = (selector: RegExp, prop: string) => rules.find((d) => selector.test(d.selector) && d.prop === prop)?.value;
    expect(value(/^\.ds-chart-scroll$/, 'overflow-x')).toBe('auto');
    expect(Number.parseFloat(value(/::-webkit-scrollbar$/, 'height') ?? '0')).toBeGreaterThanOrEqual(6);
    const thumb = value(/::-webkit-scrollbar-thumb$/, 'background') ?? value(/::-webkit-scrollbar-thumb$/, 'background-color');
    expect(thumb).toBeTruthy();
    expect(thumb).not.toMatch(/transparent|none/);
    // Chrome turns ::-webkit-scrollbar styling off once these are set; they may appear only for engines without it.
    postcss.parse(css).walkDecls(/^scrollbar-(width|color)$/, (decl) => {
      const guarded = decl.parent?.parent?.type === 'atrule' && /not selector\(::-webkit-scrollbar\)/.test((decl.parent.parent as postcss.AtRule).params);
      expect({ prop: decl.prop, guarded }).toEqual({ prop: decl.prop, guarded: true });
    });
  });

  it('S3: no page stylesheet sets its own horizontal overflow on a chart', () => {
    expect(pageChartScrolls(PAGE_CSS.map((file) => ({ file, css: read(file) })))).toEqual([]);
  });

  it('control: the same check finds a planted page-level chart scroll, and passes a non-chart one', () => {
    expect(pageChartScrolls([{ file: 'planted.css', css: '.x .local-model-usage--upright { overflow-x: auto; } .local-runs-wrap { overflow-x: auto; }' }]))
      .toEqual(['planted.css: .x .local-model-usage--upright { overflow-x: auto }']);
  });
});
