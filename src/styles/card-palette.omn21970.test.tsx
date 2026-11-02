// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
/**
 * OMN-21970 AC8 (Lakshman 2026-11-02): every summary card has its own concept colour and its own Lucide icon.
 *
 * Failure modes, each with a test below:
 *   P1  two cards on one page share a colour, or two colours on a page are too close to tell apart (OKLab < 0.10)
 *   P2  two different card concepts anywhere on the dashboard look the same (OKLab < 0.07)
 *   P3  a concept colour drops below 4.5:1 on the real card background, plain or under its 14% tint, in either theme
 *   P4  two cards on one page share an icon, or a money glyph stands for tokens
 *   P5  a card is wired to a borrowed concept (p95 duration as "age", escalated as "threshold"), so it takes another
 *       concept's colour and icon
 *   P6  the tier colours move (AC5 keeps the product owner's exact palette)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIELD_ICONS } from '@/components/dashboard/FieldIcon';
import { PANEL_CONCEPTS, RunsKpis, UsageKpis } from '@/pages/LocalDashboardPage';

const css = readFileSync(resolve(__dirname, 'field-identity.css'), 'utf8');
const blocks = (selector: string) => {
  const bodies: string[] = [];
  for (let start = css.indexOf(`${selector} {`); start >= 0; start = css.indexOf(`${selector} {`, start + 1)) {
    bodies.push(css.slice(start, css.indexOf('}', start)));
  }
  return bodies.join('\n');
};
const THEMES = { light: blocks(':root'), dark: blocks('[data-theme="dark"]') } as const;
// The real card backgrounds, read from Chrome on the dev dashboard 2026-11-02 (computed background-color).
const CARD = { light: '#fdfdfc', dark: '#161616' } as const;
const token = (theme: keyof typeof THEMES, concept: string) => {
  const matches = [...THEMES[theme].matchAll(new RegExp(`--field-${concept}:\\s*(#[0-9a-fA-F]{6})\\s*;`, 'g'))];
  return matches.length ? matches[matches.length - 1]![1]!.toLowerCase() : null;
};

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
const linear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [0, 1, 2].map(i => linear(channel(hex, i))) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const distance = (a: string, b: string) => Math.hypot(...oklab(a).map((value, i) => value - oklab(b)[i]!));
const luminance = (rgb: number[]) => 0.2126 * linear(rgb[0]!) + 0.7152 * linear(rgb[1]!) + 0.0722 * linear(rgb[2]!);
const rgb = (hex: string) => [0, 1, 2].map(i => channel(hex, i));
const contrast = (fg: string, bg: number[]) => {
  const [low, high] = [luminance(rgb(fg)), luminance(bg)].sort((a, b) => a - b) as [number, number];
  return (high + 0.05) / (low + 0.05);
};
const tinted = (accent: string, bg: string, alpha = 0.14) => rgb(accent).map((value, i) => Math.round(alpha * value + (1 - alpha) * rgb(bg)[i]!));

const accentConcepts = (container: HTMLElement) => [...container.querySelectorAll('article[data-kpi-card]')]
  .map(card => /var\(--field-([a-z0-9-]+)\)/.exec((card as HTMLElement).style.getPropertyValue('--panel-accent'))?.[1] ?? '(none)');

const NOW = Date.parse('2026-11-02T12:00:00Z');
const RUN_ROWS = Array.from({ length: 30 }, (_, index) => ({
  correlation_id: `run-${index}`, written_at: new Date(NOW - index * 3_600_000).toISOString(), terminal_ok: index % 7 === 0 ? 0 : 1,
  quality_gate_passed: index % 7 === 0 ? 0 : 1, latency_ms: 1000 + index * 50, escalation_count: index % 5 === 0 ? 1 : 0,
}));
const METERING_ALL = {
  window_kind: 'all', as_of: '2026-11-02T11:31:52Z', baseline_model: 'claude-sonnet-5-5', baseline_state: 'RESOLVED',
  pricing_manifest_version: '1.0.0', spend_usd: '0.232022', counterfactual_usd: '12.538332', savings_usd: '12.30631',
  tokens_in: 1992661, tokens_out: 855301, runs_total: 1973, runs_measured: 1915, runs_unknown_tokens: 58, runs_unknown_spend: 0,
};

function pages(): Record<string, string[]> {
  const runs = accentConcepts(render(<RunsKpis rows={RUN_ROWS} now={NOW} complete />).container);
  const usage = accentConcepts(render(<UsageKpis rows={[METERING_ALL]} />).container);
  return {
    // The four metric cards' concepts as the page assigns them, plus Delegation Quality, which uses the pass concept.
    overview: [...['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens'].map(id => PANEL_CONCEPTS[id]!), 'pass'],
    usage,
    runs,
    // Delegation Evidence's KpiStrip items (DelegationEvidencePage.tsx): Delegations, Quality pass, Savings (modelled), Tokens.
    evidence: ['calls', 'pass', 'savings', 'tokens'],
  };
}

const CONCEPTS = ['cost', 'baseline', 'savings', 'calls', 'tokens', 'tokens-in', 'tokens-out', 'pass', 'fail', 'duration', 'duration-p95', 'escalated'];

describe('OMN-21970 AC8: card colours and icons', () => {
  it('P5: Runs wires p95 duration and escalated to their own concepts; Usage and Overview read their own', () => {
    const page = pages();
    expect(page.runs).toEqual(['calls', 'pass', 'duration', 'duration-p95', 'fail', 'escalated']);
    expect(page.usage).toEqual(['cost', 'baseline', 'savings', 'tokens-in', 'tokens-out']);
    expect(page.overview).toEqual(['cost', 'savings', 'calls', 'tokens', 'pass']);
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`P1: in ${theme}, every pair of cards on one page is at least 0.10 apart`, () => {
      for (const [name, concepts] of Object.entries(pages())) {
        for (let i = 0; i < concepts.length; i += 1) {
          for (let j = i + 1; j < concepts.length; j += 1) {
            const [a, b] = [token(theme, concepts[i]!), token(theme, concepts[j]!)];
            expect(a, `${theme} --field-${concepts[i]}`).not.toBeNull();
            expect(b, `${theme} --field-${concepts[j]}`).not.toBeNull();
            expect(distance(a!, b!), `${name}: ${concepts[i]} ${a} vs ${concepts[j]} ${b}`).toBeGreaterThanOrEqual(0.10);
          }
        }
      }
    });

    it(`P2: in ${theme}, the twelve card concepts are twelve colours at least 0.07 apart`, () => {
      const hexes = CONCEPTS.map(concept => token(theme, concept));
      expect(hexes.every(Boolean), `${theme}: ${CONCEPTS.filter((_, i) => !hexes[i]).join(', ')} undefined`).toBe(true);
      expect(new Set(hexes).size).toBe(CONCEPTS.length);
      for (let i = 0; i < CONCEPTS.length; i += 1) {
        for (let j = i + 1; j < CONCEPTS.length; j += 1) {
          expect(distance(hexes[i]!, hexes[j]!), `${CONCEPTS[i]} vs ${CONCEPTS[j]}`).toBeGreaterThanOrEqual(0.07);
        }
      }
    });

    it(`P3: in ${theme}, every concept colour is at least 4.5:1 on the card, plain and under its tint`, () => {
      for (const concept of CONCEPTS) {
        const hex = token(theme, concept)!;
        expect(contrast(hex, rgb(CARD[theme])), `${concept} ${hex} on ${CARD[theme]}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(hex, tinted(hex, CARD[theme])), `${concept} ${hex} on its tint`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('P4: no two cards on a page share an icon, and tokens are not drawn with a money glyph', () => {
    // Overview's card icons come from PANEL_CONCEPTS (Delegation Quality keeps the quality glyph while it takes the pass
    // colour); the KpiStrip pages draw the icon of each card's own concept.
    const iconConcepts = { ...pages(), overview: ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens', 'overview-quality'].map(id => PANEL_CONCEPTS[id]!) };
    for (const [name, concepts] of Object.entries(iconConcepts)) {
      const icons = concepts.map(concept => FIELD_ICONS[concept]);
      expect(icons.every(Boolean), `${name}: every card concept has an icon`).toBe(true);
      expect(new Set(icons).size, `${name}: ${concepts.join(', ')}`).toBe(concepts.length);
    }
    expect(FIELD_ICONS.tokens).not.toBe(FIELD_ICONS.cost);
    expect(FIELD_ICONS.tokens?.displayName ?? '').not.toMatch(/Coin|Dollar|Banknote/);
  });

  it('P6: the tier colours are not touched by the card palette', () => {
    expect(token('light', 'tier-local')).toBe('#2a78d6');
    expect(token('dark', 'tier-local')).toBe('#3987e5');
    expect(token('light', 'tier-claude')).toBe('#008300');
  });
});
