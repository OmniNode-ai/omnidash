// OMN-23330 AC14 (the operator's 2026-11-09 review at the narrowest window, both themes): no headline card sits alone on
// its row, chart day tracks are lighter than the bars, and the Cheap frontier colour meets 3:1 against the light theme's
// track.
// Measured on the lab 2026-11-10 with the populated fixtures: every headline grid was one column at 600 px and below
// (Overview 5 cards, Runs 6, Delegation Evidence 4, each alone on its row). The colours already met their rules at the reviewed base
// (4be1140a) and still do: the track (--ds-line) reads 1.21:1 on its panel in light and 1.22:1 in dark while every bar
// read 5.6:1 or more, and Cheap frontier reads 5.67:1 on the light track. G1 and G2 failed before this change; C1 and C2
// guard the colours so a later token change cannot break them.
// Failure modes:
//   G1  at the narrowest desktop window a rule sets a headline grid to one column, so each card sits alone on its row;
//   G2  an odd count leaves the last card alone in half a row;
//   C1  a track reads as strongly as a bar: its contrast on a panel is not below every bar colour's, in either theme;
//   C2  Cheap frontier falls under 3:1 against the light theme's track.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const STYLES = ['src/styles/dashboard-cards.css', 'src/styles/seven-page-design.css', 'src/styles/local-dashboard.css', 'src/styles/editorial.css'];

/** Each theme's token values, later declarations winning, as the cascade reads them. */
function tokens(): { light: Record<string, string>; dark: Record<string, string> } {
  const light: Record<string, string> = {}; const dark: Record<string, string> = {};
  postcss.parse(readFileSync(path.join(ROOT, 'src/theme/design-system/tokens.css'), 'utf8')).walkRules((rule) => {
    if (rule.parent?.type !== 'root') return;
    const into = rule.selector.trim() === ':root' ? light : rule.selector.trim() === '[data-theme="dark"]' ? dark : null;
    if (into) rule.walkDecls(/^--/, (decl) => { into[decl.prop] = decl.value.trim(); });
  });
  return { light, dark: { ...light, ...dark } };
}
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]!, 0);
}
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}
const hex = (value: string | undefined) => (value !== undefined && /^#[0-9a-f]{6}$/i.test(value) ? value : null);

describe('OMN-23330 AC14: the narrowest window and the chart colours', () => {
  // The narrowest desktop window is taken as 500 px (to be confirmed in the Chrome readback); phones (480 px and below)
  // keep one column, since two 136 px cards broke the earlier phone rules (18 px whole figures, 12 px text).
  const appliesAt = (params: string, width: number) => {
    const max = /max-width:\s*(\d+)px/.exec(params); const min = /min-width:\s*(\d+)px/.exec(params);
    return (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]));
  };
  it('G1: at the narrowest desktop window (500 px) no rule sets a headline grid to one column', () => {
    const single: string[] = [];
    for (const file of STYLES) {
      postcss.parse(readFileSync(path.join(ROOT, file), 'utf8')).walkAtRules('media', (media) => {
        if (!/max-width/.test(media.params) || !appliesAt(media.params, 500)) return;
        media.walkDecls('grid-template-columns', (decl) => {
          const selector = (decl.parent as postcss.Rule).selector;
          if (/\.local-overview-summary\s*($|,)/m.test(selector) && /^(minmax\(0,\s*1fr\)|1fr)$/.test(decl.value.trim())) single.push(`${file}: ${media.params}`);
        });
      });
    }
    expect(single).toEqual([]);
  });

  it('G2: at a narrow window an odd last headline card spans its row', () => {
    const spans: string[] = [];
    for (const file of STYLES) {
      postcss.parse(readFileSync(path.join(ROOT, file), 'utf8')).walkAtRules('media', (media) => {
        if (!/max-width/.test(media.params)) return;
        media.walkDecls('grid-column', (decl) => {
          const selector = (decl.parent as postcss.Rule).selector;
          if (/\.local-overview-summary\s*>\s*:last-child:nth-child\(odd\)/.test(selector) && decl.value.replace(/\s/g, '') === '1/-1') spans.push(file);
        });
      });
    }
    expect(spans.length).toBeGreaterThan(0);
  });

  it('C1: in both themes the track reads lighter on a panel than every bar colour', () => {
    for (const [theme, values] of Object.entries(tokens())) {
      const track = hex(values['--ds-line'])!;
      const bars = Object.entries(values).filter(([name]) => /^--ds-(field-tier-|chart-\d)/.test(name))
        .map(([name, value]) => [name, hex(value)] as const).filter((entry): entry is readonly [string, string] => entry[1] !== null);
      expect(bars.length).toBeGreaterThan(8);
      for (const surface of ['--ds-page', '--ds-surface']) {
        const panel = hex(values[surface])!;
        const heavier = bars.filter(([, colour]) => contrast(colour, panel) <= contrast(track, panel)).map(([name]) => `${theme} ${surface} ${name}`);
        expect(heavier).toEqual([]);
      }
    }
  });

  it('C2: Cheap frontier meets 3:1 against the light theme\'s track', () => {
    const { light } = tokens();
    expect(contrast(hex(light['--ds-field-tier-cheap-frontier'])!, hex(light['--ds-line'])!)).toBeGreaterThanOrEqual(3);
  });
});
