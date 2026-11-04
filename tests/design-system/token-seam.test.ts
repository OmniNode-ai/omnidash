// @vitest-environment node
/**
 * OMN-22168 AC5: pages read only --ds-* custom properties, so the token source can switch to OmniUI's exported tokens
 * (OMN-21848) with no page change. A file may also read a property it sets itself (a component-local value). Failure
 * modes this catches:
 *   1. a page reads an old token family (--ed-*, --st-*, --ink, --line, --field-*) instead of --ds-*;
 *   2. tokens.css stops defining a --ds-* token that something reads;
 *   3. the scanner itself goes blind (the planted controls fail first).
 */
import { describe, expect, it } from 'vitest';
import { TOKENS_FILE, componentKnobs, foreignProperties, read, scanAll, sourceFiles, stripComments, summarise } from './scan';

describe('OMN-22168 AC5: pages read only --ds-* tokens', () => {
  it('control: a planted read of an old token is caught', () => {
    expect(foreignProperties('src/pages/Planted.css', '.a { color: var(--ed-ink); border-color: var(--line); }').map(h => h.text)).toEqual(['--ed-ink', '--line']);
  });

  it('control: a property the file sets for itself, and --ds-* reads, pass', () => {
    const css = '.bar { --bar-size: 40%; height: var(--bar-size); color: var(--ds-ink); }';
    expect(foreignProperties('src/pages/Planted.css', css)).toEqual([]);
    const tsx = "<span style={{ '--rb-size': scaled } as CSSProperties} />; const s = 'height: var(--rb-size)';";
    expect(foreignProperties('src/pages/Planted.tsx', tsx)).toEqual([]);
  });

  it('control: a knob set inline in TypeScript may be read by a stylesheet, but never under a --ds-* name', () => {
    expect(foreignProperties('src/pages/Planted.css', '.bar { height: var(--rb-size); }', new Set(['--rb-size']))).toEqual([]);
    expect(foreignProperties('src/pages/Planted.css', '.bar { height: var(--rb-size); }')).toHaveLength(1);
    expect([...componentKnobs()].filter(k => k.startsWith('--ds-'))).toEqual([]);
  });

  it('no file outside src/theme/design-system reads a non --ds-* property it does not set', () => {
    const allowed = componentKnobs();
    const hits = scanAll((path, text) => foreignProperties(path, text, allowed));
    expect(hits, summarise(hits)).toEqual([]);
  });

  it('every --ds-* token read anywhere is defined in tokens.css', () => {
    const defined = new Set([...stripComments(TOKENS_FILE, read(TOKENS_FILE)).matchAll(/(--ds-[a-zA-Z0-9-_]+)\s*:/g)].map(m => m[1]));
    const missing = new Set<string>();
    for (const path of sourceFiles()) for (const m of read(path).matchAll(/var\(\s*(--ds-[a-zA-Z0-9-_]+)/g)) if (!defined.has(m[1]) && !m[1]!.endsWith('-')) missing.add(`${m[1]} (${path})`);
    expect([...missing]).toEqual([]);
  });
});
