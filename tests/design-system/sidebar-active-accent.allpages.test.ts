// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// OMN-23330 follow-up (operator review of the live sidebar, 2026-11-11): "selected tabs should be visually visible" and
// "color on BG side bar selected should follow the icons colors". Each sidebar page already has its own colour
// (--ds-destination-accent, the colour its icon wears); the selected item was the same plain grey fill (--ds-surface-2)
// for every page, with its name and icon in plain ink, set at id weight in two stylesheets. This replaces the
// 2026-11-03 "01 + 20" grey fill, and the app frame's stylesheet is the one place the selected item is styled.
// Failure modes:
//   S1  the selected item's fill is not drawn from its page colour;
//   S2  the selected item's name or icon is not drawn from its page colour;
//   S3  hovering the selected item drops the page colour;
//   S4  another stylesheet also sets the selected item's fill, so the two compete and one silently wins (measured live
//       2026-11-11: the grey at id weight in seven-page-design.css won over the tinted rule).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../src');
const OWNER = path.join(SRC, 'styles/frame/editorial.css');

function rulesOf(file: string) {
  const rules: Array<{ selector: string; decls: Record<string, string> }> = [];
  postcss.parse(readFileSync(file, 'utf8')).walkRules(rule => {
    const decls: Record<string, string> = {};
    rule.walkDecls(decl => { decls[decl.prop] = decl.value; });
    rules.push({ selector: rule.selector, decls });
  });
  return rules;
}
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? cssFiles(full) : name.endsWith('.css') && !name.startsWith('._') ? [full] : [];
  });
}
/** A selector part whose subject is the selected sidebar item itself (resting or hovered), not a part inside it. */
const ACTIVE = String.raw`\.mvp-nav-item(?:\.active|:is\(\.active[^)]*\))`;
const isItem = (part: string) => new RegExp(String.raw`\.sidebar\b[^,]*${ACTIVE}(:hover)?(:not\(#ds-important\))?(:hover)?(:not\(#ds-important\))?$`).test(part.trim());
/** A selector list split at its top-level commas, never inside :is(...) or :not(...). */
const parts = (selector: string) => selector.split(/,(?![^(]*\))/);
const owner = rulesOf(OWNER);

describe('OMN-23330: the selected sidebar item wears its page colour', () => {
  it('S1 S3: its fill, resting and hovered, is mixed from the page colour', () => {
    const fills = owner.filter(rule => parts(rule.selector).some(isItem) && rule.decls.background !== undefined);
    expect(fills.length).toBeGreaterThanOrEqual(2);
    for (const rule of fills) expect(rule.decls.background, rule.selector).toContain('var(--ds-destination-accent)');
    expect(fills.some(rule => /:hover/.test(rule.selector))).toBe(true);
  });

  it('S2: its name and its icon are drawn from the page colour', () => {
    const name = owner.filter(rule => new RegExp(String.raw`${ACTIVE}[^,]*\.dash-name`).test(rule.selector) && rule.decls.color !== undefined);
    const icon = owner.filter(rule => new RegExp(String.raw`${ACTIVE}[^,]* svg`).test(rule.selector) && rule.decls.color !== undefined);
    expect(name.length).toBeGreaterThan(0);
    expect(icon.length).toBeGreaterThan(0);
    for (const rule of [...name, ...icon]) expect(rule.decls.color, rule.selector).toContain('var(--ds-destination-accent)');
  });

  it('S4: no other stylesheet sets the selected item\'s fill', () => {
    const others = cssFiles(SRC).filter(file => file !== OWNER).flatMap(file => rulesOf(file)
      .filter(rule => parts(rule.selector).some(isItem) && (rule.decls.background !== undefined || rule.decls['background-color'] !== undefined))
      .map(rule => `${path.relative(SRC, file)}: ${rule.selector.replace(/\s+/g, ' ').slice(0, 120)}`));
    expect(others).toEqual([]);
  });
});
