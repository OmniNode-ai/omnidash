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
import postcss from 'postcss';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageStylesheet } from '@/tests/page-stylesheet';

const css = pageStylesheet('seven-page-design');
// OMN-22168 AC3: the drawn line moved into the chart kit.
const charts = readFileSync(resolve(__dirname, '../theme/design-system/charts/LinePlot.tsx'), 'utf8');

/**
 * OMN-23330 AC29/AC30: the motion rules are read by meaning, not by their text. The kit's rules moved into the stylesheet's
 * kit part (both parts are read, see src/tests/page-stylesheet.ts), and each override that was !important is now a copy of
 * its rule whose selector carries :not(#ds-important), which wins as the flag did; either form counts as an override.
 */
type Found = { selector: string; strong: boolean; decls: Record<string, string> };
function rulesIn(query: string | null): Found[] {
  const found: Found[] = [];
  postcss.parse(css).walkRules((rule) => {
    const media = rule.parent?.type === 'atrule' && (rule.parent as postcss.AtRule).name === 'media' ? (rule.parent as postcss.AtRule).params : null;
    if (rule.parent?.type === 'atrule' && /keyframes/.test((rule.parent as postcss.AtRule).name)) return;
    if (query !== null && media !== query) return;
    if (query === null && media !== null && /prefers-reduced-motion: no-preference/.test(media)) return;
    const decls: Record<string, string> = {};
    let strong = rule.selector.includes(':not(#ds-important)');
    rule.walkDecls((decl) => { decls[decl.prop] = decl.value; if (decl.important) strong = true; });
    found.push({ selector: rule.selector.replace(/:not\(#ds-important\)/g, '').replace(/\s+/g, ' '), strong, decls });
  });
  return found;
}
const motion = () => rulesIn('(prefers-reduced-motion: no-preference)');
const reduce = () => rulesIn('(prefers-reduced-motion: reduce)');
/** Every rule outside the no-preference block (the rest of the sheet, reduced-motion block included). */
const outsideBlocks = () => rulesIn(null);
/** A selector list's members, split at top-level commas only (never inside :is()). */
function names(rule: Found): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of rule.selector) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += char;
  }
  parts.push(current.trim());
  return parts;
}
/** A rule (or the rule and its boosted copy, which share a selector) names each selector and sets the property. */
const has = (rules: Found[], selectors: string[], prop: string, value: RegExp, strong = false) =>
  rules.some((rule) => selectors.every((one) => names(rule).some((name) => name === one || name.endsWith(` ${one}`)))
    && value.test(rule.decls[prop] ?? '') && (!strong || rule.strong));

describe('OMN-21970 AC9: CSS motion families', () => {
  it('M3: every keyframe the families name is defined', () => {
    for (const name of ['omn-rise-in', 'omn-grow-y', 'omn-draw']) expect(css).toContain(`@keyframes ${name}`);
  });

  it('M1 rise-in: cards and panels rise in, inside the no-preference block only', () => {
    expect(has(motion(), ['.local-dashboard-panel', '.ev-root .panel'], 'animation', /^omn-rise-in /)).toBe(true);
    expect(outsideBlocks().some((rule) => /omn-rise-in/.test(rule.decls.animation ?? ''))).toBe(false);
  });
  it('M2 rise-in: reduced motion switches it off', () => {
    expect(has(reduce(), ['.local-dashboard-panel', '.ev-root .panel'], 'animation', /^none$/, true)).toBe(true);
  });

  it('M1 grow-in: bars grow from their axis and the line draws, inside the no-preference block only', () => {
    expect(motion().some((rule) => names(rule).includes('.gdb-bar.ins-seg') && rule.decls['transform-origin'] === '50% 100%'
      && /^omn-grow-y /.test(rule.decls.animation ?? ''))).toBe(true);
    expect(has(motion(), ['.od-draw'], 'animation', /^omn-draw .*both$/)).toBe(true);
    expect(outsideBlocks().some((rule) => /omn-(grow-y|draw)/.test(rule.decls.animation ?? ''))).toBe(false);
  });
  it('M2 grow-in: reduced motion switches bars and line off and draws the line whole', () => {
    expect(has(reduce(), ['.gdb-bar.ins-seg', '.od-draw'], 'animation', /^none$/, true)).toBe(true);
    expect(has(reduce(), ['.od-draw'], 'clip-path', /^none$/)).toBe(true);
  });
  it('M4: the line draws by a left-to-right reveal that ends on the whole line, not by a stroke dash', () => {
    // A dash measured with pathLength under vector-effect: non-scaling-stroke left the line cut short in Chrome
    // (Pass rate per day stopped before its last day, 2026-11-04); the reveal ends at inset(0) whatever the stroke.
    expect(css).toMatch(/@keyframes omn-draw \{ from \{ clip-path: inset\(0 100% 0 0\); \} to \{ clip-path: inset\(0 0 0 0\); \} \}/);
    expect(motion().some((rule) => names(rule).includes('.od-draw') && Object.keys(rule.decls).some((prop) => prop.startsWith('stroke-dash')))).toBe(false);
    expect(charts).not.toMatch(/className="od-draw"[^>]*pathLength/);
  });

  // OMN-23330 AC26 (operator 2026-11-09, "hover should light it and make it best please"): a summary card lights in its own
  // colour on hover, inside the no-preference block only, and never lifts (the lift flickered under a pointer near its edge).
  it('M1 hover: a summary card lights in its own colour on hover and never lifts', () => {
    const hovered = motion().filter((rule) => /:hover/.test(rule.selector));
    const lit = hovered.find((rule) => rule.decls['border-color'] === 'var(--card-accent)');
    expect(lit).toBeDefined();
    // The glow is in the same rule, or in its boosted copy (same selector) where the declaration had been !important.
    expect(hovered.some((rule) => rule.selector === lit!.selector && /var\(--card-accent\)/.test(rule.decls['box-shadow'] ?? ''))).toBe(true);
    expect(motion().some((rule) => /:hover/.test(rule.selector) && /translateY/.test(rule.decls.transform ?? ''))).toBe(false);
    expect(outsideBlocks().some((rule) => /:hover/.test(rule.selector) && /translateY/.test(rule.decls.transform ?? ''))).toBe(false);
  });
  it('M2 hover: reduced motion removes the lift and its transition', () => {
    expect(reduce().some((rule) => /:hover/.test(rule.selector) && rule.decls.transition === 'none' && rule.decls.transform === 'none' && rule.strong)).toBe(true);
  });
});
