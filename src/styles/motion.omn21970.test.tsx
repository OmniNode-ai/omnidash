// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
/**
 * OMN-21970 AC9: the three CSS motion families run only when motion is allowed, and stop under reduced motion.
 * (The fourth family, the card count-up, is CountUpText.omn21970.test.tsx.)
 *
 * jsdom does not run CSS animations, so these read the shipped stylesheet. Failure modes, each with a test below:
 *   M1  rise-in, grow-in or hover motion is declared outside the no-preference block, so it runs for a reader who
 *       asked for reduced motion
 *   M2  the reduce block does not switch a family off, so a cascade from elsewhere could still animate it
 *   M3  a keyframe a family names is missing, so the family silently does nothing
 *   M4  the line draw-in has no pathLength, so its 1-unit dash turns the line into dots instead of drawing it
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'seven-page-design.css'), 'utf8');
// OMN-22168 AC3: the drawn line moved into the chart kit.
const charts = readFileSync(resolve(__dirname, '../theme/design-system/charts/LinePlot.tsx'), 'utf8');

/** The body of the first `@media <query> {` block that follows the OMN-21970 AC9 banner, found by brace counting. */
function mediaBlock(query: string): string {
  const banner = css.indexOf('OMN-21970 AC9');
  expect(banner, 'the AC9 section').toBeGreaterThan(0);
  const start = css.indexOf(`@media ${query} {`, banner);
  expect(start, `@media ${query}`).toBeGreaterThan(0);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') { depth -= 1; if (depth === 0) return css.slice(start, index + 1); }
  }
  throw new Error(`unclosed @media ${query}`);
}
const motion = () => mediaBlock('(prefers-reduced-motion: no-preference)');
const reduce = () => mediaBlock('(prefers-reduced-motion: reduce)');
const outsideBlocks = () => css.slice(css.indexOf('OMN-21970 AC9')).replace(motion(), '').replace(reduce(), '');

describe('OMN-21970 AC9: CSS motion families', () => {
  it('M3: every keyframe the families name is defined', () => {
    for (const name of ['omn-rise-in', 'omn-grow-y', 'omn-draw']) expect(css).toContain(`@keyframes ${name}`);
  });

  it('M1 rise-in: cards and panels rise in, inside the no-preference block only', () => {
    expect(motion()).toMatch(/\.local-dashboard-panel,\s*\.ev-root \.panel\s*\{\s*animation: omn-rise-in /);
    expect(outsideBlocks()).not.toMatch(/animation: omn-rise-in/);
  });
  it('M2 rise-in: reduced motion switches it off', () => {
    expect(reduce()).toMatch(/\.local-dashboard-panel,\s*\.ev-root \.panel,[^{]*\{\s*animation: none !important/);
  });

  it('M1 grow-in: bars grow from their axis and the line draws, inside the no-preference block only', () => {
    expect(motion()).toMatch(/\.gdb-bar\.ins-seg\s*\{[^}]*transform-origin: 50% 100%;[^}]*animation: omn-grow-y /);
    expect(motion()).toMatch(/\.od-draw\s*\{[^}]*animation: omn-draw [^;]*both;/);
    expect(outsideBlocks()).not.toMatch(/animation: omn-(grow-y|draw)/);
  });
  it('M2 grow-in: reduced motion switches bars and line off and draws the line whole', () => {
    expect(reduce()).toMatch(/\.gdb-bar\.ins-seg,\s*\.od-draw \{ animation: none !important; \}/);
    expect(reduce()).toMatch(/\.od-draw \{ clip-path: none; \}/);
  });
  it('M4: the line draws by a left-to-right reveal that ends on the whole line, not by a stroke dash', () => {
    // A dash measured with pathLength under vector-effect: non-scaling-stroke left the line cut short in Chrome
    // (Pass rate per day stopped before its last day, 2026-11-04); the reveal ends at inset(0) whatever the stroke.
    expect(css).toMatch(/@keyframes omn-draw \{ from \{ clip-path: inset\(0 100% 0 0\); \} to \{ clip-path: inset\(0 0 0 0\); \} \}/);
    expect(motion()).not.toMatch(/\.od-draw\s*\{[^}]*stroke-dash/);
    expect(charts).not.toMatch(/className="od-draw"[^>]*pathLength/);
  });

  // OMN-23330 AC26 (operator 2026-11-09, "hover should light it and make it best please"): a summary card lights in its own
  // colour on hover, inside the no-preference block only, and never lifts (the lift flickered under a pointer near its edge).
  it('M1 hover: a summary card lights in its own colour on hover and never lifts', () => {
    expect(motion()).toMatch(/:hover \{\s*border-color: var\(--card-accent\);[^}]*box-shadow: [^;]*var\(--card-accent\)/);
    expect(motion()).not.toMatch(/:hover \{[^}]*transform: translateY/);
    expect(outsideBlocks()).not.toMatch(/:hover \{\s*transform: translateY/);
  });
  it('M2 hover: reduced motion removes the lift and its transition', () => {
    expect(reduce()).toMatch(/:hover \{\s*transition: none !important;\s*transform: none !important;/);
  });
});
