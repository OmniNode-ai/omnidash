// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
/**
 * OMN-21970 AC5, AC6: every model is coloured by its tier with the product owner's palette.
 *
 * Each test names the failure it catches:
 * - a tier token drifts from the palette in either theme (AC5);
 * - a tier the palette does not name (cheap_frontier, cheap_cloud, an unknown tier) falls back to a hash colour (AC6);
 * - a model is coloured by its name instead of the tier it ran under, so Model usage and Tier mix disagree (AC5);
 * - a model that ran under two tiers flips colour with row order instead of taking the tier most of its runs used.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelTierColor, modelTiersFrom, tierColor } from './dashboard-colors';

const PALETTE: Record<string, [light: string, dark: string]> = {
  local: ['#2a78d6', '#3987e5'],
  harness: ['#eb6834', '#d95926'],
  frontier: ['#1baf7a', '#199e70'],
  cloud: ['#6250d6', '#9085e9'],
  customer_keys: ['#e87ba4', '#d55181'],
  claude: ['#008300', '#008300'],
  none: ['#a3a7ad', '#6b6e73'],
};
// AC6: the tiers the palette does not name take the colour of the tier they are a kind of.
const SAME_AS: Record<string, string> = { cheap_frontier: 'frontier', cheap_cloud: 'cloud' };

const css = readFileSync(resolve(__dirname, '../design-system/tokens.css'), 'utf8');
// Every block with this selector, in file order; a later declaration of a token wins, as in the browser.
const block = (selector: string) => {
  const bodies: string[] = [];
  for (let start = css.indexOf(`${selector} {`); start >= 0; start = css.indexOf(`${selector} {`, start + 1)) {
    bodies.push(css.slice(start, css.indexOf('}', start)));
  }
  expect(bodies.length, `${selector} block`).toBeGreaterThan(0);
  return bodies.join('\n');
};
const tokenValue = (body: string, token: string) => {
  const matches = [...body.matchAll(new RegExp(`${token}:\\s*([^;]+);`, 'g'))];
  return matches.length ? matches[matches.length - 1][1].trim().toLowerCase() : null;
};
const tokenOf = (tier: string) => /^var\((--[a-z-]+)\)$/.exec(tierColor(tier))?.[1] ?? null;

describe('tier colours follow the palette (OMN-21970)', () => {
  const light = block(':root');
  const dark = block('[data-theme="dark"]');

  for (const [tier, [hexLight, hexDark]] of Object.entries(PALETTE)) {
    it(`${tier} is ${hexLight} in light and ${hexDark} in dark`, () => {
      const token = tokenOf(tier);
      expect(token, `${tier} resolves to a CSS token`).not.toBeNull();
      expect(tokenValue(light, token!)).toBe(hexLight);
      expect(tokenValue(dark, token!)).toBe(hexDark);
    });
  }

  for (const [tier, like] of Object.entries(SAME_AS)) {
    it(`${tier}, which the palette does not name, takes ${like}'s colour`, () => {
      expect(tierColor(tier)).toBe(tierColor(like));
    });
  }

  it('an unknown or unrouted tier takes the palette\'s "none" colour, never a hash colour', () => {
    for (const tier of ['not_tier_routed', 'some_new_tier', '', 'Not recorded']) {
      expect(tierColor(tier)).toBe(tierColor('none'));
      expect(tierColor(tier)).not.toMatch(/oklch/);
    }
  });
});

describe('a model takes its tier\'s colour (OMN-21970)', () => {
  it('Model usage and Tier mix give a model and its tier the same colour', () => {
    const tiers = modelTiersFrom([
      { model_name: 'qwen3.8-27b', cost_tier_name: 'local' },
      { model_name: 'gemini-3.5-flash-lite', cost_tier_name: 'customer_keys' },
    ]);
    expect(modelTierColor('qwen3.8-27b', tiers)).toBe(tierColor('local'));
    expect(modelTierColor('gemini-3.5-flash-lite', tiers)).toBe(tierColor('customer_keys'));
  });

  it('reads model_name, model_id or model, so decisions and usage rows both teach the map', () => {
    const tiers = modelTiersFrom([
      { model_id: 'glm-5', cost_tier_name: 'cheap_cloud' },
      { model: 'claude-sonnet-5-5', cost_tier_name: 'claude' },
    ]);
    expect(modelTierColor('glm-5', tiers)).toBe(tierColor('cloud'));
    expect(modelTierColor('claude-sonnet-5-5', tiers)).toBe(tierColor('claude'));
  });

  it('a model that ran under two tiers takes the tier most of its runs used, whatever the row order', () => {
    const rows = [
      { model_name: 'm', cost_tier_name: 'cloud' },
      { model_name: 'm', cost_tier_name: 'local' },
      { model_name: 'm', cost_tier_name: 'local' },
    ];
    expect(modelTierColor('m', modelTiersFrom(rows))).toBe(tierColor('local'));
    expect(modelTierColor('m', modelTiersFrom([...rows].reverse()))).toBe(tierColor('local'));
  });

  it('the model-routing row places every model of every run, weighted by its count, beyond the newest 500 decisions', () => {
    // The served model-routing row: by_tier.tiers[].models[] over the whole history, not a row cap.
    const routing = {
      by_tier: {
        tiers: [
          { cost_tier_name: 'local', models: [{ model_name: 'qwen', count: 1809 }] },
          { cost_tier_name: 'cheap_frontier', models: [{ model_name: 'inkling', count: 35 }, { model_name: 'gemini', count: 28 }] },
          { cost_tier_name: 'cheap_cloud', models: [{ model_name: 'gemini', count: 25 }] },
        ],
      },
    };
    // A model seen only in old runs has no decisions row at all, yet the routing row places it.
    const tiers = modelTiersFrom([routing, { model_name: 'gemini', cost_tier_name: 'cheap_cloud' }]);
    expect(modelTierColor('inkling', tiers)).toBe(tierColor('frontier'));
    expect(modelTierColor('qwen', tiers)).toBe(tierColor('local'));
    // 28 runs under cheap_frontier outweigh 25 + 1 under cheap_cloud.
    expect(modelTierColor('gemini', tiers)).toBe(tierColor('cheap_frontier'));
  });

  it('a model no row places in a tier takes the "none" colour, never a hash colour', () => {
    expect(modelTierColor('never-seen', modelTiersFrom([]))).toBe(tierColor('none'));
  });
});
