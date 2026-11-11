// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 AC33 (operator, chat 2026-11-11: chosen from a benchmark of 20 open-source dashboards): each Overview headline
// card's change against the previous window is coloured by what it means. Savings and Delegation Quality: a rise is good,
// a fall a warning. Actual spend: a rise is a warning, a fall good. Agent calls and Tokens processed are volume: neutral.
// "No change", "No earlier data" and "New this period" stay neutral, so a missing or zero base never shows a tone.
// Failure modes:
//   T1  a card's change has no tone, or the tone of the wrong meaning (spend up shown as good);
//   T2  a volume card (calls, tokens) is coloured;
//   T3  a phrase without a signed figure is coloured;
//   T4  the stylesheet gives a tone no colour, or the wrong token.
import { render } from '@testing-library/react';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { ChangeLine, changeMeaning } from '@/pages/local/page-headline';
import { pageStylesheet } from '@/tests/page-stylesheet';

const toneOf = (text: string, meaning: ReturnType<typeof changeMeaning>) => {
  const { container, unmount } = render(<ChangeLine text={text} meaning={meaning} />);
  const tone = container.querySelector('.local-card-change')?.getAttribute('data-tone') ?? null;
  unmount();
  return tone;
};

describe('OMN-23330 AC33: a card change wears the colour of what it means', () => {
  it('T1: each card maps to its meaning', () => {
    expect(changeMeaning('overview-spend')).toBe('up-bad');
    expect(changeMeaning('overview-savings')).toBe('up-good');
    expect(changeMeaning('overview-quality')).toBe('up-good');
    expect(changeMeaning('overview-measured')).toBe('neutral');
    expect(changeMeaning('overview-tokens')).toBe('neutral');
  });

  it('T1: a rise and a fall take the tone their meaning gives', () => {
    expect(toneOf('+12% vs previous 7 days', 'up-good')).toBe('good');
    expect(toneOf('−54% vs previous 7 days', 'up-good')).toBe('warn');
    expect(toneOf('+3.4% vs previous 7 days', 'up-bad')).toBe('warn');
    expect(toneOf('−3.4% vs previous 7 days', 'up-bad')).toBe('good');
    expect(toneOf('Last 7 days: +1.2 pts vs previous 7 days', 'up-good')).toBe('good');
    expect(toneOf('Last 7 days: −1.2 pts vs previous 7 days', 'up-good')).toBe('warn');
  });

  it('T2: a volume change stays neutral', () => {
    expect(toneOf('+70% vs previous 7 days', 'neutral')).toBeNull();
    expect(toneOf('−70% vs previous 7 days', 'neutral')).toBeNull();
  });

  it('T3: a phrase with no signed figure stays neutral, whatever the meaning', () => {
    for (const text of ['No change vs previous 7 days', 'No earlier data', 'New this period', 'Last 7 days: no change vs previous 7 days']) {
      for (const meaning of ['up-good', 'up-bad', 'neutral'] as const) expect(toneOf(text, meaning), `${text} / ${meaning}`).toBeNull();
    }
  });

  it('T4: the stylesheet colours each tone with its token, the arrow sharing it', () => {
    const rules: Record<string, string> = {};
    postcss.parse(pageStylesheet('seven-page-design')).walkRules((rule) => {
      const tone = /\.local-card-change\[data-tone="(good|warn)"\]/.exec(rule.selector)?.[1];
      rule.walkDecls('color', (decl) => { if (tone && !/arrow/.test(rule.selector)) rules[tone + (/data-theme="dark"/.test(rule.selector) ? ':dark' : '')] = decl.value; });
    });
    expect(rules.good).toBe('var(--ds-field-pass)');
    expect(rules.warn).toMatch(/var\(--ds-warn\)/);
    // The arrow is a child span with no colour of its own, so it inherits the tone.
    const arrowColour: string[] = [];
    postcss.parse(pageStylesheet('seven-page-design')).walkRules(/local-card-change-arrow/, (rule) => rule.walkDecls('color', (d) => { arrowColour.push(d.value); }));
    expect(arrowColour).toEqual([]);
  });
});
