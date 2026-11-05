// OMN-22168 (Lakshman 2026-11-05, "define 5 colors 0 to 20% then 21 to 40 and so on, unique, logical and different
// colors", then "visually unique color"): a pass rate is drawn as a pill in one of five bands. Failure modes, each
// caught below:
//   B1  a band has no pill colour or no ink in a theme, so its pill falls back to a borrowed colour;
//   B2  a band's ink reads under 4.5:1 on its pill (a 14% tint of the band over the surface) in a theme;
//   B3  a rate lands in the wrong band at a boundary (20% and 21%, 40% and 41%, 60% and 61%, 80% and 81%);
//   B4  a rate with no verdicts gets a band (a colour that claims a pass rate nobody measured);
//   B5  two bands share a colour, so the five cannot be told apart.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASS_BANDS, passBand } from '@/pages/local/plain-text';

const css = readFileSync(resolve(__dirname, '../../src/theme/design-system/tokens.css'), 'utf8');
const declared = (selectorTest: (selector: string) => boolean) => {
  const tokens = new Map<string, string>();
  for (const block of css.matchAll(/^([^\n{]+)\{([\s\S]*?)^\}/gm)) {
    if (!selectorTest(block[1]!.trim())) continue;
    for (const entry of block[2]!.matchAll(/(--ds-[a-z0-9-]+):\s*([^;]+);/g)) tokens.set(entry[1]!, entry[2]!.trim());
  }
  return tokens;
};
const LIGHT = declared(selector => selector.startsWith(':root'));
const DARK = new Map([...LIGHT, ...declared(selector => selector === '[data-theme="dark"]')]);

const luminance = (hex: string) => {
  const channel = (i: number) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
// The pill's paint: color-mix(in srgb, band 14%, surface), as seven-page-design.css draws it.
const tint = (band: string, surface: string) => '#' + [1, 3, 5].map(i => Math.round(parseInt(band.slice(i, i + 2), 16) * 0.14
  + parseInt(surface.slice(i, i + 2), 16) * 0.86).toString(16).padStart(2, '0')).join('');
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe('OMN-22168: pass rates in five bands', () => {
  for (const [theme, tokens] of [['light', LIGHT], ['dark', DARK]] as const) {
    it(`B1, B2, B5: ${theme}: every band has a pill colour and an ink at 4.5:1, and no two bands share a colour`, () => {
      const pills = PASS_BANDS.map(({ band }) => {
        const pill = tokens.get(`--ds-pass-band-${band}`);
        const ink = tokens.get(`--ds-pass-band-${band}-ink`);
        expect(pill, `${theme} --ds-pass-band-${band}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(ink, `${theme} --ds-pass-band-${band}-ink`).toMatch(/^#[0-9a-f]{6}$/i);
        const surface = tokens.get('--ds-surface')!;
        expect(contrast(tint(pill!, surface), ink!), `${theme} band ${band} ink on its pill`).toBeGreaterThanOrEqual(4.5);
        return pill!.toLowerCase();
      });
      expect(new Set(pills).size, `${theme}: five different pill colours`).toBe(5);
    });
  }

  it('B3: each rate lands in its band at every boundary, by the whole percent', () => {
    const at = (percent: number) => passBand(percent, 100);
    expect([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(at)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(passBand(1, 3)).toBe(2); // 33%
    expect(passBand(2, 3)).toBe(4); // 67%
  });

  it('B4: a rate with no verdicts has no band', () => {
    expect(passBand(0, 0)).toBeUndefined();
  });
});
