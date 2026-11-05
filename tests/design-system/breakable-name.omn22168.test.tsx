import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { breakableName } from '@/theme/design-system/charts/RankedBars';

/**
 * OMN-22168 (live review 2026-11-04): on Overview's Model usage a model id such as thinkingmachines/inkling:free wrapped
 * in the middle of a word ("thinkingma / chines/inkl / ing:free"). The name now wraps at its joins.
 * Failure modes: N1 the text a reader or a test reads changes; N2 a join gets no break opportunity, or a plain name gets
 * one; N3 the Model usage rule lets the browser break anywhere again, which fills each line to the last letter.
 */
const css = readFileSync(resolve(__dirname, '../../src/styles/seven-page-design.css'), 'utf8');
// Each call reads its own render, so several names in one test never match each other.
const shown = (name: string) => render(<span>{breakableName(name)}</span>).container.firstElementChild as HTMLElement;

describe('a model name wraps at its joins (OMN-22168)', () => {
  it('N1: the name reads exactly as served', () => {
    for (const name of ['thinkingmachines/inkling:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'Qwen3.8-27B', 'local_model']) {
      expect(shown(name).textContent).toBe(name);
    }
  });

  it('N2: a break opportunity follows every slash, colon, hyphen and underscore, and nothing else', () => {
    const el = shown('google/gemma-4_31b:free');
    const before = [...el.querySelectorAll('wbr')].map(wbr => wbr.previousSibling?.textContent?.slice(-1));
    expect(before).toEqual(['/', '-', '_', ':']);
    expect(shown('Qwen38').querySelectorAll('wbr')).toHaveLength(0);
  });

  it('N3: Model usage names break at those opportunities, a word only when it cannot fit', () => {
    const rule = css.match(/\.local-model-usage \.rb-chart \.rb-name \{[^}]*\}/)?.[0] ?? '';
    expect(rule, 'the Model usage name rule').not.toBe('');
    expect(rule).toContain('overflow-wrap: break-word');
    expect(rule).not.toContain('overflow-wrap: anywhere');
  });
});
