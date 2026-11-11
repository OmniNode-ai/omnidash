// OMN-23330 AC29 (the operator, 2026-11-09: "why we don't have unified system and reuse the code and uniform everything"):
// every component of the design-system kit (src/theme/design-system/components and charts) is styled in one place, the
// stylesheets under src/theme/design-system, and no stylesheet elsewhere under src sets a property on a kit component's
// class. Measured 2026-11-10 before the change: 819 rules outside the kit styled one of its 166 classes (local-dashboard
// 418, seven-page-design 261, editorial 123, dashboard-cards 11, event-dash 3, field-identity 3).
// A rule styles a kit component when the subject of one of its selectors (the last compound, after the last combinator)
// names a kit class, directly or inside :is() / :where(); a kit class only in an ancestor (.panel .page-thing) styles the
// page's own element, which may stay with the page.
// Failure modes:
//   K1  a stylesheet outside src/theme/design-system has a rule whose subject is a kit class;
//   K2  the kit's class list is empty or misread (a check over no classes passes vacuously);
//   K3  the subject reader misses a planted page rule, or flags a rule that only names a kit class as an ancestor.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const KIT_DIRS = ['src/theme/design-system/components', 'src/theme/design-system/charts'];

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return files(file, pattern);
    return pattern.test(name) ? [file] : [];
  });
}

/** Every class the kit's components write: className strings and the kit's own class prefixes in their code. */
export function kitClasses(): Set<string> {
  const classes = new Set<string>();
  for (const file of KIT_DIRS.flatMap((dir) => files(path.join(ROOT, dir), /\.tsx$/)).filter((f) => !/\.(test|stories)\./.test(f))) {
    const code = readFileSync(file, 'utf8');
    // A className may be a string, a template or an expression; a class name is kebab-case, and a JavaScript name never
    // holds a hyphen, so every hyphenated word in the attribute (to the end of its line) is a class it can write.
    for (const match of code.matchAll(/className=([^\n]*)/g)) {
      for (const word of match[1]!.matchAll(/(?<![\w$.-])([a-z][a-z0-9]*(?:-[a-z0-9]+)+(?:--[a-z0-9-]+)?)/g)) classes.add(word[1]!);
    }
    for (const match of code.matchAll(/['"`]((?:ds|rb|gdb|ins|local)-[\w-]+)['"`]/g)) classes.add(match[1]!);
  }
  return classes;
}

/** Split at top-level commas (not inside :is(...) and the like). */
function splitTop(selector: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of selector) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (depth === 0 && separator.test(char)) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts;
}

/** The classes of a selector's subject: the last compound, with classes inside :is() and :where() counted, :not() not. */
export function subjectClasses(selector: string): string[] {
  return splitTop(selector, /,/).flatMap((one) => {
    const compounds = splitTop(one.trim().replace(/\s*([>+~])\s*/g, ' '), /\s/).filter(Boolean);
    const subject = (compounds.at(-1) ?? '').replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
    return [...subject.matchAll(/\.([\w-]+)/g)].map((match) => match[1]!);
  });
}

/** Rules outside the kit's folder whose subject is a kit class. */
export function kitRulesOutside(cssFiles: Array<{ file: string; css: string }>, kit: Set<string>): string[] {
  const found: string[] = [];
  for (const { file, css } of cssFiles) {
    postcss.parse(css).walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes/i.test((rule.parent as postcss.AtRule).name)) return;
      const hits = subjectClasses(rule.selector).filter((name) => kit.has(name));
      if (hits.length > 0) found.push(`${file}:${rule.source?.start?.line ?? 0} ${hits[0]}`);
    });
  }
  return found;
}

describe('OMN-23330 AC29: the kit is styled in one place', () => {
  const kit = kitClasses();

  it('K2: the kit names its classes', () => {
    expect(kit.size).toBeGreaterThan(100);
    for (const name of ['local-dashboard-panel', 'rb-chart', 'gdb-plot', 'ds-chart-scroll']) expect(kit.has(name)).toBe(true);
  });

  it('K1: no stylesheet outside src/theme/design-system styles a kit component', () => {
    const outside = files(path.join(ROOT, 'src'), /\.css$/)
      .map((file) => path.relative(ROOT, file))
      .filter((file) => !file.startsWith('src/theme/design-system/'))
      .map((file) => ({ file, css: readFileSync(path.join(ROOT, file), 'utf8') }));
    expect(outside.length).toBeGreaterThan(5);
    expect(kitRulesOutside(outside, kit)).toEqual([]);
  });

  it('K3 control: a planted page rule on a kit class is caught; a kit class as an ancestor is not', () => {
    const planted = [{ file: 'src/styles/planted.css', css: [
      '.local-dashboard-page--runs .local-dashboard-panel { padding: 4px; }',
      '@media (max-width: 600px) { .page :is(.rb-chart, .x) { gap: 0; } }',
      '.local-dashboard-panel .page-own-thing { color: red; }',
      '.page > .local-dashboard-panel:not(.x) + .page-own-thing { color: red; }',
    ].join('\n') }];
    expect(kitRulesOutside(planted, kit)).toEqual(['src/styles/planted.css:1 local-dashboard-panel', 'src/styles/planted.css:2 rb-chart']);
  });
});
