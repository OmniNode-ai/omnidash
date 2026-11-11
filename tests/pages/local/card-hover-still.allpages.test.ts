// OMN-23330 AC26 (operator 2026-11-09: "these cards blink when hover"; "when hover one card to next why cards blink in
// overview"; then "hover should light it and make it best please"): a headline card on Overview and Delegation Evidence
// lights up in its own colour when hovered (accent border and a soft accent glow) and never moves or changes size. It
// lights within 120 ms and starts to fade only after a hold of at least 80 ms, so moving the pointer across the 12 px gap
// to the next card hands the light over with no moment where neither card is lit.
// History: a 3px hover lift flickered under a pointer near the card's edge; a glow that faded out at once blinked in the
// gap. Failure mode F14: a hovered card moves or resizes, does not light, or goes dark before the next card lights.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const MOVES = /^(transform|translate|scale|rotate|margin(-.*)?|padding(-.*)?|top|bottom|left|right|inset(-.*)?|width|height|min-height|max-height)$/;
const CARD = /\.local-overview-summary\s*>\s*\.local-dashboard-panel(?:\.[\w-]+|:not\([^)]*\))*/;
// OMN-23330 AC30: a declaration that was !important lives in a copy of its rule ending :not(#ds-important); it is the same rule.
const hovered = (selector: string) => new RegExp(`${CARD.source}:hover(?::not\\(#ds-important\\))?\\s*$`).test(selector.trim());
const resting = (selector: string) => new RegExp(`${CARD.source}\\s*$`).test(selector.trim());

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith('.css') ? [full] : [];
  });
}

/** Rules outside a reduced-motion block (which may switch the light at once), with where each sits. */
function cardRules(css: string, file: string) {
  const out: Array<{ rule: Rule; where: string; hover: boolean }> = [];
  postcss.parse(css).walkRules((rule) => {
    let parent = rule.parent;
    while (parent && parent.type !== 'root') {
      if (parent.type === 'atrule' && /prefers-reduced-motion:\s*reduce/.test((parent as AtRule).params)) return;
      parent = parent.parent;
    }
    const isHover = rule.selectors.some(hovered);
    if (!isHover && !rule.selectors.some(resting)) return;
    out.push({ rule, where: `${path.relative(ROOT, file)}:${rule.source?.start?.line}`, hover: isHover });
  });
  return out;
}

/** "border-color 220ms ease 90ms, box-shadow 220ms ease 90ms" to { property: [duration, delay] } in ms. */
function transitions(value: string): Record<string, [number, number]> {
  const ms = (token: string) => (token.endsWith('ms') ? Number.parseFloat(token) : Number.parseFloat(token) * 1000);
  return Object.fromEntries(value.split(',').map((part) => {
    const tokens = part.trim().split(/\s+/);
    const times = tokens.filter((token) => /^-?[\d.]+m?s$/.test(token)).map(ms);
    return [tokens[0]!, [times[0] ?? 0, times[1] ?? 0]];
  }));
}

function check(css: string, file = path.join(ROOT, 'src/planted.css')) {
  const rules = cardRules(css, file);
  const moves: string[] = []; let lit = false; let hoverTransition: Record<string, [number, number]> | null = null;
  let restTransition: Record<string, [number, number]> | null = null;
  for (const { rule, where, hover } of rules) {
    rule.walkDecls((decl) => {
      const value = decl.value.replace(/\s*!important$/, '').trim();
      if (hover && MOVES.test(decl.prop) && !/^(none|0|0px)$/.test(value)) moves.push(`${where}: ${decl.prop}: ${decl.value}`);
      if (hover && decl.prop === 'box-shadow' && value.includes('var(--card-accent)')) lit = true;
      if (decl.prop === 'transition') {
        if (hover) hoverTransition = transitions(value);
        else restTransition = transitions(value);
      }
    });
  }
  const hoverBorder = rules.some(({ rule, hover }) => hover && rule.nodes.some((node) => node.type === 'decl' && /^border(-color)?$/.test(node.prop) && node.value.includes('var(--card-accent)')));
  return { moves, lit: lit && hoverBorder, hoverTransition, restTransition };
}

const real = () => {
  const files = cssFiles(path.join(ROOT, 'src'));
  return check(files.map((file) => readFileSync(file, 'utf8')).join('\n'), path.join(ROOT, 'src/all.css'));
};

describe('OMN-23330 AC26: a hovered headline card lights up, never moves, and hands the light over without a dark gap', () => {
  it('no rule for a hovered headline card moves it or changes its size', () => {
    expect(real().moves).toEqual([]);
  });

  it('a hovered headline card lights in its own colour: an accent border and an accent glow', () => {
    expect(real().lit).toBe(true);
  });

  it('no !important border colour on a headline card blocks the hover: each reads --card-border, which the hover sets to the accent', () => {
    // Live 2026-11-09: editorial.css pinned the border with !important, so the hover's border-color never applied.
    const all = cssFiles(path.join(ROOT, 'src')).map((file) => [file, readFileSync(file, 'utf8')] as const);
    const pinned: string[] = []; let hoverSets = false;
    for (const [file, css] of all) {
      postcss.parse(css).walkDecls(/^border(-color)?$/, (decl) => {
        const rule = decl.parent as Rule;
        if (!decl.important || !rule.selectors?.some((s) => /\.local-overview-summary\s*>\s*(article)?\.local-dashboard-panel/.test(s))) return;
        if (!decl.value.includes('var(--card-border')) pinned.push(`${path.relative(ROOT, file)}:${decl.source?.start?.line}: ${decl.prop}: ${decl.value}`);
      });
      postcss.parse(css).walkDecls('--card-border', (decl) => {
        if ((decl.parent as Rule).selectors?.some(hovered) && decl.value.includes('var(--card-accent)')) hoverSets = true;
      });
    }
    expect(pinned).toEqual([]);
    expect(hoverSets).toBe(true);
  });

  it('the light comes on within 120 ms', () => {
    const t = real().hoverTransition;
    expect(t).not.toBeNull();
    for (const prop of ['border-color', 'box-shadow']) {
      expect(t![prop], prop).toBeDefined();
      expect(t![prop]![0] + t![prop]![1], prop).toBeLessThanOrEqual(120);
    }
  });

  it('the light holds at least 80 ms before it fades, so the next card lights first', () => {
    const t = real().restTransition;
    expect(t).not.toBeNull();
    for (const prop of ['border-color', 'box-shadow']) {
      expect(t![prop], prop).toBeDefined();
      expect(t![prop]![1], prop).toBeGreaterThanOrEqual(80);
    }
  });

  it('controls: a planted lift, an unlit hover and an instant fade are each caught', () => {
    const card = ':is(.local-dashboard-page, .ev-root) .local-overview-surface > .local-overview-summary > .local-dashboard-panel.local-dashboard-panel';
    const lift = check(`${card}:hover { transform: translateY(-3px); border-color: var(--card-accent); box-shadow: 0 0 8px var(--card-accent); }`);
    expect(lift.moves).toEqual(['src/planted.css:1: transform: translateY(-3px)']);
    expect(check(`${card}:hover { box-shadow: none; }`).lit).toBe(false);
    expect(check(`${card} { transition: border-color 200ms ease, box-shadow 200ms ease; }`).restTransition!['box-shadow']![1]).toBe(0);
  });
});
