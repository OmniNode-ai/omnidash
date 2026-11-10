// @vitest-environment jsdom
// OMN-23330 AC6 (the operator's 2026-11-09 review, superseding the 2026-10-25 "show them when hover" ruling for these three
// charts only): Overview's Model usage and Tier mix print each bar's run count and share, and Usage's tokens per day by
// model prints each day's total, without a pointer. Measured live 2026-11-10: every figure was in the page and in each
// bar's accessible name ("2.71K · 93.7%") but drawn with visibility: hidden until hover.
// Failure modes:
//   V1  a bar's figure is missing or wrong (count or share), or the shares do not add to 100% within rounding (F4);
//   V2  the figure is in the page but a stylesheet still hides it until hover;
//   V3  the opt-in leaks: every other ranked chart starts printing its values (the 10-25 ruling still holds there).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RankedBars } from '@/theme/design-system/charts';
import { ModelUsagePanel, TierMixPanel } from '@/pages/LocalDashboardPage';

vi.mock('wouter', async (importOriginal) => ({ ...(await importOriginal<object>()), Link: ({ children }: { children: unknown }) => children }));

const ROOT = path.resolve(__dirname, '../../..');
const CSS_FILES = ['src/styles/seven-page-design.css', 'src/styles/editorial.css', 'src/styles/local-dashboard.css',
  'src/theme/design-system/charts/chart-scroll.css'];

/** The visibility each stylesheet rule gives to the elements a selector test picks, in source order. */
function visibilityRules(test: (selector: string) => boolean): Array<{ selector: string; value: string }> {
  return CSS_FILES.flatMap((file) => {
    const out: Array<{ selector: string; value: string }> = [];
    postcss.parse(readFileSync(path.join(ROOT, file), 'utf8')).walkDecls('visibility', (decl) => {
      const rule = decl.parent as postcss.Rule;
      if (rule.selector && test(rule.selector)) out.push({ selector: rule.selector, value: decl.value });
    });
    return out;
  });
}

const MODELS = { by_model: [
  { model_name: 'Qwen3.8-27B', total_count: 2710, pct_of_total: 0.937 },
  { model_name: 'gemini-3.5-flash-lite', total_count: 53, pct_of_total: 0.018 },
  { model_name: 'thinkingmachines/inkling:free', total_count: 51, pct_of_total: 0.018 },
  { model_name: 'nvidia/nemotron', total_count: 79, pct_of_total: 0.027 },
] };
const TIERS = { by_tier: { total_tasks: 2893, tier_routed_total: 2893, not_tier_routed_count: 0, tiers: [
  { cost_tier_name: 'local', count: 2710, tier_routed: true, pct_of_tier_routed: 0.937 },
  { cost_tier_name: 'cheap_frontier', count: 107, tier_routed: true, pct_of_tier_routed: 0.037 },
  { cost_tier_name: 'cheap_cloud', count: 76, tier_routed: true, pct_of_tier_routed: 0.026 },
] } };

const figures = (container: HTMLElement) => [...container.querySelectorAll('.rb-plot > li .rb-value')].map((el) => el.textContent ?? '');
const shareOf = (text: string) => Number(/· ([\d.]+)%$/.exec(text)?.[1] ?? Number.NaN);

describe('OMN-23330 AC6: the three charts print their figures without a pointer', () => {
  it('V1: Model usage prints each model\'s runs and share, and the shares add to 100% within rounding', () => {
    const { container } = render(<ModelUsagePanel row={MODELS} />);
    expect(container.querySelector('.rb-chart')?.classList.contains('rb-chart--values')).toBe(true);
    expect(figures(container)).toEqual(['2.71K · 93.7%', '79 · 2.7%', '53 · 1.8%', '51 · 1.8%']);
    expect(Math.abs(figures(container).map(shareOf).reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(0.2);
  });

  it('V1: Tier mix prints each tier\'s runs and share, and the shares add to 100% within rounding', () => {
    // Overview draws the compact Tier mix, the ranked bars AC6 is about.
    const { container } = render(<TierMixPanel row={TIERS} compact />);
    const chart = [...container.querySelectorAll('.rb-chart')].find((el) => el.getAttribute('aria-label') === 'Runs by tier')!;
    expect(chart.classList.contains('rb-chart--values')).toBe(true);
    const drawn = [...chart.querySelectorAll('.rb-plot > li .rb-value')].map((el) => el.textContent ?? '');
    expect(drawn).toEqual(['2.71K · 93.7%', '107 · 3.7%', '76 · 2.6%']);
    expect(Math.abs(drawn.map(shareOf).reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(0.2);
  });

  it('V2: a stylesheet shows the opted-in figures and the Usage day totals, and nothing hides them again', () => {
    const shown = visibilityRules((selector) => /\.rb-chart--values\b/.test(selector) && /\.rb-value\b/.test(selector));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((rule) => rule.value === 'visible')).toBe(true);
    // The opt-in rule names one more class than the hover rule, so it wins wherever both match.
    expect(visibilityRules((selector) => /\.utc-value\b/.test(selector)).filter((rule) => rule.value === 'hidden')).toEqual([]);
  });

  it('V3: every other ranked chart keeps its figures on hover (the 2026-10-25 ruling)', () => {
    const { container } = render(<RankedBars label="Pass rate by model" unit="" layout="vertical"
      items={[{ key: 'a', name: 'a', value: 1, display: '1', basis: 'measured', color: 'red' }]} />);
    expect(container.querySelector('.rb-chart')?.classList.contains('rb-chart--values')).toBe(false);
    const hidden = visibilityRules((selector) => /\.rb-chart \.rb-plot > li > \.rb-value/.test(selector) && !/:hover|:focus/.test(selector));
    expect(hidden.map((rule) => rule.value)).toContain('hidden');
  });
});
