// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
/**
 * OMN-21970 AC5, AC6: every model is coloured by its tier with the product owner's palette.
 *
 * Each test names the failure it catches:
 * - a tier token drifts from the palette in either theme (AC5);
 * - a tier the palette does not name (an unknown tier) falls back to a hash colour (AC6), or a cheap tier loses its own
 *   lighter shade of its family (product owner 2026-11-03);
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
// AC6 (product owner 2026-11-03, DM thread 1793225207.602179): cheap_frontier and cheap_cloud keep their family's colour
// but a lighter shade, told apart from it and checked like the rest of the palette (shades.check below). In light
// mode no lighter frontier shade passes that check (an exhaustive sRGB search, Codex review 2026-11-03 03:32Z), so
// light cheap_frontier keeps the frontier colour until the product owner chooses one.
const CHEAP: Record<string, { family: string; light: string | 'family'; dark: string }> = {
  cheap_frontier: { family: 'frontier', light: 'family', dark: '#47be8e' },
  cheap_cloud: { family: 'cloud', light: '#8980fd', dark: '#afa8fd' },
};

const css = readFileSync(resolve(__dirname, '../theme/design-system/tokens.css'), 'utf8');
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
const oklab = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [l, m, s] = [0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!, 0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!,
    0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!].map(Math.cbrt);
  return [0.2104542553 * l! + 0.793617785 * m! - 0.0040720468 * s!, 1.9779984951 * l! - 2.428592205 * m! + 0.4505937099 * s!,
    0.0259040371 * l! + 0.7827717662 * m! - 0.808675766 * s!] as const;
};
const lightness = (hex: string) => oklab(hex)[0];
const hue = (hex: string) => { const [, a, b] = oklab(hex); return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360; };
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

  for (const [tier, shade] of Object.entries(CHEAP)) {
    it(`${tier} is its own token, a lighter shade of ${shade.family} where one passes the palette check`, () => {
      const token = tokenOf(tier);
      expect(token, `${tier} resolves to its own CSS token`).toBe(`--ds-field-tier-${tier.replace('_', '-')}`);
      const [familyLight, familyDark] = PALETTE[shade.family]!;
      const resolve = (body: string, value: string | null) => (value?.startsWith('var(') ? tokenValue(body, value.slice(4, -1)) : value);
      expect(resolve(light, tokenValue(light, token!))).toBe(shade.light === 'family' ? familyLight : shade.light);
      expect(resolve(dark, tokenValue(dark, token!))).toBe(shade.dark);
      for (const [hex, family] of [[shade.light, familyLight], [shade.dark, familyDark]] as const) {
        if (hex === 'family') continue;
        expect(lightness(hex), `${hex} is lighter than ${family}`).toBeGreaterThan(lightness(family));
        expect(Math.abs(hue(hex) - hue(family)), `${hex} keeps ${family}'s hue`).toBeLessThan(2);
      }
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
    expect(modelTierColor('glm-5', tiers)).toBe(tierColor('cheap_cloud'));
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
    expect(modelTierColor('inkling', tiers)).toBe(tierColor('cheap_frontier'));
    expect(modelTierColor('qwen', tiers)).toBe(tierColor('local'));
    // 28 runs under cheap_frontier outweigh 25 + 1 under cheap_cloud.
    expect(modelTierColor('gemini', tiers)).toBe(tierColor('cheap_frontier'));
  });

  it('a model no row places in a tier takes the "none" colour, never a hash colour', () => {
    expect(modelTierColor('never-seen', modelTiersFrom([]))).toBe(tierColor('none'));
  });
});
