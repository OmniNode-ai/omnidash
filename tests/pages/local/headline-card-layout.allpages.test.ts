// OMN-23330 AC28 (operator 2026-11-09: "overview should match style from delegeation eviandace"): an Overview headline
// card draws its caption directly under its figure, with the same gap as a Delegation Evidence card, instead of pinning
// the caption to the foot of a card stretched by its row's tallest neighbour (measured 2026-11-09: Overview 17 to 22 px,
// Evidence 5 px). Failure mode F16: a rule pushes a headline card's caption down with margin-top: auto.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith('.css') ? [full] : [];
  });
}

/** A selector whose subject is a headline card's caption block. */
const isHeadlineCaption = (selector: string) => /\.local-overview-summary\b[^,{]*\.local-card-caption\s*$/.test(selector.trim());

function pushedDown(css: string, file: string): string[] {
  const found: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selectors.some(isHeadlineCaption)) return;
    rule.walkDecls(/^margin(-top|-block-start|-block)?$/, (decl) => {
      if (/\bauto\b/.test(decl.value)) found.push(`${path.relative(ROOT, file)}:${decl.source?.start?.line}: ${decl.prop}: ${decl.value}`);
    });
  });
  return found;
}

describe('OMN-23330 AC28: a headline card caption sits directly under its figure', () => {
  it('no stylesheet pushes a headline card caption to the card foot with an automatic top margin', () => {
    const offenders = cssFiles(path.join(ROOT, 'src')).flatMap((file) => pushedDown(readFileSync(file, 'utf8'), file));
    expect(offenders).toEqual([]);
  });

  it('positive control: the scan finds a planted automatic top margin on a headline card caption', () => {
    const planted = ':is(.local-dashboard-page, .ev-root) .local-overview-summary .local-card-caption { margin-top: auto; padding-top: 8px; }';
    expect(pushedDown(planted, path.join(ROOT, 'src/planted.css'))).toEqual(['src/planted.css:1: margin-top: auto']);
  });

  it('positive control: the scan reads real headline caption rules', () => {
    const all = cssFiles(path.join(ROOT, 'src')).map((file) => readFileSync(file, 'utf8')).join('\n');
    let rules = 0;
    postcss.parse(all).walkRules((rule) => { if (rule.selectors.some(isHeadlineCaption)) rules += 1; });
    expect(rules).toBeGreaterThan(0);
  });
});
