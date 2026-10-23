/** Fixed-size source guard; the served computed-font census remains browser proof. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'postcss';
import { describe, expect, it } from 'vitest';

// These are the page-owned local destination stylesheet and its global base.
// Unused legacy selectors elsewhere are not a computed/visible-text claim.
const stylesheets = ['src/styles/globals.css', 'src/styles/local-dashboard.css'];

type SmallText = { selector: string; value: string; pixels: number };

function smallFixedText(css: string): SmallText[] {
  const small: SmallText[] = [];
  parse(css).walkDecls(/^font-size$/i, (declaration) => {
    const fixed = /^(\d+(?:\.\d+)?|\.\d+)\s*(px|rem)$/i.exec(declaration.value.trim());
    if (!fixed) return;
    // rem is relative to the browser's 16 px root; actual rendering is E2E-tested.
    const pixels = Number(fixed[1]) * (fixed[2].toLowerCase() === 'rem' ? 16 : 1);
    if (pixels < 12) {
      small.push({
        selector: declaration.parent?.toString().split('{', 1)[0].trim() ?? '<root>',
        value: declaration.value,
        pixels,
      });
    }
  });
  return small;
}

describe.each(stylesheets)('AC1 shipped local text floor: %s', (stylesheet) => {
  const css = readFileSync(resolve(__dirname, '../..', stylesheet), 'utf8');

  it('contains font declarations and no fixed font-size below 12 px', () => {
    let declarations = 0;
    parse(css).walkDecls(/^font-size$/i, () => { declarations += 1; });
    expect(declarations, 'a missing/empty stylesheet must not pass').toBeGreaterThan(0);
    expect(smallFixedText(css)).toEqual([]);
  });

  it('catches planted component overrides in rem and px, but accepts the floor', () => {
    const control = `${css}
      .omn21306-control-rem { font-size: 0.6875rem; }
      .omn21306-control-px { font-size: 10px; }
      .omn21306-control-floor { font-size: 12px; }`;
    expect(smallFixedText(control).filter(({ selector }) => selector.startsWith('.omn21306-control-')))
      .toEqual([
        { selector: '.omn21306-control-rem', value: '0.6875rem', pixels: 11 },
        { selector: '.omn21306-control-px', value: '10px', pixels: 10 },
      ]);
  });
});
