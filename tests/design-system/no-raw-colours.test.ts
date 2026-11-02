// @vitest-environment node
/**
 * OMN-22168 AC1: every colour omnidash draws is defined once in src/design-system/tokens.css, for light and dark, and
 * no other .ts, .tsx or .css under src holds a raw colour literal. Failure modes this catches:
 *   1. a page or component writes a hex, rgb(), hsl() or oklch() colour instead of a token;
 *   2. a second token file appears inside src/design-system beside tokens.css;
 *   3. the scanner itself goes blind (the planted controls below fail first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, TOKENS_FILE, colourLiterals, read, scanAll, summarise } from './scan';

describe('OMN-22168 AC1: one source for colour', () => {
  it('control: a literal planted on a page is caught, in every form', () => {
    const planted = '.card { color: #1b1a16; background: rgba(0, 0, 0, .5); border-color: hsl(10 20% 30%); fill: oklch(0.6 0.1 250); }';
    expect(colourLiterals('src/pages/Planted.css', planted).map(h => h.text)).toEqual(['#1b1a16', 'rgba(0', 'hsl(1', 'oklch(0']);
    expect(colourLiterals('src/pages/Planted.tsx', "const c = '#2a78d6';")).toHaveLength(1);
  });

  it('control: a three.js number and a named colour are caught', () => {
    expect(colourLiterals('src/pages/Planted.tsx', 'scene.background = new THREE.Color(0x02040a);')).toHaveLength(1);
    expect(colourLiterals('src/pages/Planted.tsx', "const s = { color: 'white' };")).toHaveLength(1);
    expect(colourLiterals('src/pages/Planted.css', '.a { color: white; border: 1px solid black; }')).toHaveLength(2);
    expect(colourLiterals('src/pages/Planted.css', '.white-space { white-space: nowrap; }')).toEqual([]);
    expect(colourLiterals('src/pages/Planted.tsx', "tone?: 'blue' | 'green'; const t = tone ?? 'blue';")).toEqual([]);
    expect(colourLiterals('src/pages/Planted.tsx', '<path stroke="white" />')).toHaveLength(1);
  });

  it('control: a literal inside src/design-system but outside tokens.css is caught', () => {
    expect(colourLiterals('src/design-system/components/Card.css', '.x { color: #fff; }')).toHaveLength(1);
  });

  it('control: comments, anchors and var() reads are not colours', () => {
    const text = "/* was #f4f0e3 */\n.a { color: var(--ds-ink); }\n// #2a78d6 in a note\nconst href = '#settings-providers';\nconst id = 'add';";
    expect(colourLiterals('src/pages/Planted.tsx', text)).toEqual([]);
  });

  it('tokens.css exists and defines light and dark', () => {
    expect(existsSync(join(ROOT, TOKENS_FILE)), TOKENS_FILE).toBe(true);
    const css = read(TOKENS_FILE);
    expect(css).toMatch(/:root\s*\{/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*\{/);
  });

  it('no file under src other than tokens.css holds a raw colour', () => {
    const hits = scanAll(colourLiterals);
    expect(hits, summarise(hits)).toEqual([]);
  });
});
