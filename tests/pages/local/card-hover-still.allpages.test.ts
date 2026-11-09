// OMN-23330 AC26 (operator 2026-11-09: "these cards blink when hover"): a headline card on Overview and Delegation
// Evidence keeps its position and size while hovered. A hover that lifted the card 3px moved it out from under a
// pointer resting near its bottom edge; the hover then ended, the card dropped back under the pointer, and the cycle
// repeated as a flicker. The hover may change only colour, border and glow.
// Failure mode F14: a rule for a hovered headline card sets a property that moves or resizes the card.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const MOVES = /^(transform|translate|scale|rotate|margin(-.*)?|padding(-.*)?|top|bottom|left|right|inset(-.*)?|width|height|min-height|max-height)$/;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith('.css') ? [full] : [];
  });
}

/** A selector whose subject is a hovered headline card: the panel directly inside .local-overview-summary, hovered. */
const hoversHeadlineCard = (selector: string) =>
  /\.local-overview-summary\s*>\s*\.local-dashboard-panel(?:\.[\w-]+|:not\([^)]*\))*:hover\s*$/.test(selector.trim());

function offendingDeclarations(css: string, file: string): string[] {
  const found: string[] = [];
  postcss.parse(css).walkRules((rule: Rule) => {
    const hovered = rule.selectors.filter(hoversHeadlineCard);
    if (hovered.length === 0) return;
    rule.walkDecls((decl) => {
      if (MOVES.test(decl.prop) && !/^(none|0|0px)$/.test(decl.value.replace(/\s*!important$/, '').trim())) {
        found.push(`${path.relative(ROOT, file)}:${decl.source?.start?.line}: ${decl.prop}: ${decl.value}`);
      }
    });
  });
  return found;
}

describe('OMN-23330 AC26: a hovered headline card never moves or resizes', () => {
  it('no stylesheet rule for a hovered headline card sets a moving or resizing property', () => {
    const offenders = cssFiles(path.join(ROOT, 'src')).flatMap((file) => offendingDeclarations(readFileSync(file, 'utf8'), file));
    expect(offenders).toEqual([]);
  });

  it('positive control: the scan finds a planted lift on a hovered headline card, and ignores a glow', () => {
    const planted = `:is(.local-dashboard-page, .ev-root) .local-overview-surface > .local-overview-summary > .local-dashboard-panel.local-dashboard-panel:hover {
      transform: translateY(-3px); box-shadow: 0 0 0 1px red; border-color: red; }`;
    expect(offendingDeclarations(planted, path.join(ROOT, 'src/planted.css'))).toEqual(['src/planted.css:2: transform: translateY(-3px)']);
  });

  it('positive control: the scan reads the real stylesheets (it finds the headline card rules at all)', () => {
    const all = cssFiles(path.join(ROOT, 'src')).map((file) => readFileSync(file, 'utf8')).join('\n');
    let hoverRules = 0;
    postcss.parse(all).walkRules((rule) => { if (rule.selectors.some(hoversHeadlineCard)) hoverRules += 1; });
    expect(hoverRules).toBeGreaterThan(0);
  });
});
