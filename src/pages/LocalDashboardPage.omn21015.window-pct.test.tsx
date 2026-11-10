// @vitest-environment jsdom
// OMN-21015 AC7 beside OMN-20008 AC5: the Savings card's percentage line is part of the Savings tile, so it follows
// the window the Overview is switched to. Both changes read the row pickMeteringRow hands the card; this file pins
// that the line comes from that same row, on the card and on the page.
//
// Failure modes, each with a test below:
//   Q1  today is chosen and the line still shows the all-time ratio beside today's saving (two windows in one tile)
//   Q2  all time is chosen and the line shows a day row's ratio
//   Q3  today's row serves no ratio and the line falls back to the all-time ratio instead of going away
//   Q4  today has no row (no runs, so a zero day: Lakshman 2026-10-25) and a percentage line is shown anyway
//   Q5  on the page, the switch moves the figure but not the line under it, or does not bring the line back
//   Q6  today is chosen and a panel that reads another exposure (Run locally, Tier mix) still shows all-time counts
//       with nothing saying so, beside tiles that show today's (seen on a lab store of two real days, 2026-10-14)
//   Q7  the all-time note is shown on a tile that does follow the window, or stays after all time is chosen again
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocalPageConfig } from '../layout/local-page-loader';

const METERING = 'onex.snapshot.projection.metering-summary.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
// A store with these totals has runs: one decisions row keeps Overview out of its no-runs-yet page.
const DECISION = { correlation_id: 'c-1', created_at: '2026-10-09T11:00:00Z' };
const PCT = 'savings_pct_of_counterfactual';

const harness = vi.hoisted(() => ({
  reachable: new Set<string>(),
  answer: (_topic: string): Promise<unknown[]> => Promise.resolve([]),
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const rows = await harness.answer(topic);
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({
    rows: [...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' })),
  }),
}));

import { LocalDashboardPage, MeteringTotalCard } from './LocalDashboardPage';

type Config = Parameters<typeof MeteringTotalCard>[0]['config'];

const page = loadLocalPageConfig('overview');
const overviewSavings = page.components.find((candidate) => candidate.component_id === 'overview-savings')!;
// OMN-23330 AC1/AC2 (Lakshman 2026-11-10, "All on metering"): the mounted Savings card is this metering card again.
const savings = overviewSavings;
const config = page.dashboard.widgets.find((widget) => widget.data_source === 'overview-savings')?.config as Config;

const NOW = Date.parse('2026-10-09T12:05:00Z');
const BASE = {
  baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0', baseline_state: 'resolved',
  runs_unknown_tokens: 0, runs_unknown_spend: 0,
};
// Three different ratios, so a line read from the wrong row names the wrong percentage.
const ALL_ROW = {
  ...BASE, window_kind: 'all', window_start: '', as_of: '2026-10-09T12:00:00Z', runs_total: 23, runs_measured: 23,
  tokens_in: 5756, tokens_out: 378, spend_usd: 0.0123, counterfactual_usd: 0.0212, savings_usd: '0.0089', [PCT]: '0.42',
};
const YESTERDAY_ROW = {
  ...BASE, window_kind: 'day', window_start: '2026-10-08', as_of: '2026-10-08T23:50:00Z', runs_total: 20,
  runs_measured: 20, tokens_in: 5000, tokens_out: 300, spend_usd: 0.01, counterfactual_usd: 0.0111,
  savings_usd: '0.0011', [PCT]: '0.10',
};
const TODAY_ROW = {
  ...BASE, window_kind: 'day', window_start: '2026-10-09', as_of: '2026-10-09T12:00:00Z', runs_total: 3,
  runs_measured: 3, tokens_in: 756, tokens_out: 78, spend_usd: 0.0009, counterfactual_usd: 0.0012,
  savings_usd: '0.0003', [PCT]: '0.25',
};

const LINE = (pct: number) => `${pct}% below the claude-sonnet-5-5 baseline (modelled)`;
const ANY_LINE = /\d+% (below|above) the .+? baseline \(modelled\)/;

function card(rows: readonly unknown[], window: 'all' | 'today'): string[] {
  const { container } = render(
    <MeteringTotalCard component={savings} config={config} rows={rows} window={window} now={NOW} />,
  );
  return [...container.querySelectorAll('p')].map((p) => p.textContent ?? '');
}

describe('OMN-21015 AC7: the Savings percentage line follows the chosen window', () => {
  it("Q1: today shows today's ratio beside today's saving, not the all-time ratio", () => {
    const shown = card([ALL_ROW, YESTERDAY_ROW, TODAY_ROW], 'today');
    expect(shown[0]).toBe('$0.0003');
    expect(shown).toContain(LINE(25));
    expect(shown.join('\n')).not.toContain(LINE(42));
    expect(shown.join('\n')).not.toContain(LINE(10));
  });

  it("Q2: all time shows the all-time ratio, not a day row's", () => {
    const shown = card([TODAY_ROW, YESTERDAY_ROW, ALL_ROW], 'all');
    expect(shown[0]).toBe('$0.0089');
    expect(shown).toContain(LINE(42));
    expect(shown.join('\n')).not.toContain(LINE(25));
    expect(shown.join('\n')).not.toContain(LINE(10));
  });

  it('Q3: a today row that serves no ratio shows no line, never the all-time one', () => {
    const shown = card([ALL_ROW, { ...TODAY_ROW, [PCT]: null }], 'today');
    expect(shown[0]).toBe('$0.0003');
    expect(shown.join('\n')).not.toMatch(ANY_LINE);
  });

  it('Q4: a day with no row is a zero day, says so, and shows no percentage line', () => {
    const shown = card([ALL_ROW, YESTERDAY_ROW], 'today');
    expect(shown[0]).toBe('$0.00');
    expect(shown).toContain('No runs today (UTC)');
    expect(shown.filter(line => /below|above/.test(line))).toEqual([]);
  });
});

describe('OMN-21015 AC7: the Overview page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(NOW));
    // OMN-21166 part 19 AC136 keeps Overview's window in the address, which jsdom carries from test to test.
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => { vi.useRealTimers(); });

  // OMN-21970 AC9/AC10 (Lakshman 2026-11-02): the radios sit in the list the "Figures for …" button opens (as openWindows()
  // in LocalDashboardPage.omn21015.overview-window.test.tsx); choosing one closes it again.
  const chooseWindow = (value: 'all' | 'today') => {
    const trigger = screen.getByRole('button', { name: /^Figures for/ });
    if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('radio', { name: value === 'today' ? 'Today (UTC)' : 'All time' }));
    expect(screen.queryByRole('radiogroup', { name: 'Figures for' })).toBeNull();
  };

  const panel = () => screen.getByRole('heading', { name: 'Savings' }).closest('article') as HTMLElement;

  it('Q5: the switch moves the figure and its line together, and brings both back; the old aggregate never shows', async () => {
    harness.reachable = new Set([METERING, OVERVIEW, DECISIONS]);
    harness.answer = (topic) => Promise.resolve(topic === OVERVIEW
      ? [{ window: 'all', captured_at: '2026-10-09T12:00:00Z', total_savings_usd: '7.77' }]
      : topic === METERING ? [ALL_ROW, YESTERDAY_ROW, TODAY_ROW] : topic === DECISIONS ? [DECISION] : []);
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const text = () => panel().textContent?.replaceAll('\u2011', '-') ?? '';
    expect(panel().querySelector('.local-dashboard-metric')?.textContent).toBe('$0.0089');
    expect(text()).toContain(LINE(42));
    chooseWindow('today');
    expect(panel().querySelector('.local-dashboard-metric')?.textContent).toBe('$0.0003');
    expect(text()).toContain(LINE(25));
    expect(text()).not.toContain(LINE(42));
    chooseWindow('all');
    expect(panel().querySelector('.local-dashboard-metric')?.textContent).toBe('$0.0089');
    expect(text()).toContain(LINE(42));
    expect(text()).not.toContain('$7.77');
  });

  const NOTE = 'All time: this panel does not follow the window above.';
  // OMN-22168: the four Overview charts are tabs, each drawn when its tab is chosen; the chart's panel is read after
  // choosing its tab.
  const article = (title: string) => {
    const tab = screen.queryByRole('tab', { name: title });
    if (tab) fireEvent.click(tab);
    return screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;
  };
  // By the exposure each panel is bound to in overview.contracts.yaml: metering-summary.v1 has a row per window, the
  // decisions, model-routing and quality-gate exposures do not.
  // OMN-21166 live review 2026-10-25: Overview is the four headline cards and Delegation Quality, Runs and Tokens per
  // day (which follow the window), then Model usage and Tier mix (all time). Delegation Quality is a headline card
  // whose all-time note is in its hover.
  const FOLLOWS = ['Actual spend', 'Savings', 'Agent calls', 'Tokens processed', 'Runs per day', 'Tokens per day'];
  const DOES_NOT = ['Model usage', 'Tier mix'];

  async function openOverview() {
    harness.reachable = new Set([METERING, OVERVIEW, DECISIONS]);
    harness.answer = (topic) => Promise.resolve(topic === OVERVIEW ? [{ window: 'all', captured_at: '2026-10-09T12:00:00Z', total_savings_usd: '7.77' }]
      : topic === METERING ? [ALL_ROW, YESTERDAY_ROW, TODAY_ROW] : topic === DECISIONS ? [DECISION] : []);
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  }

  it('Q6: with today chosen, every panel that does not follow the window says it shows all time', async () => {
    await openOverview();
    chooseWindow('today');
    for (const title of DOES_NOT) expect(article(title).textContent, title).toContain(NOTE);
  });

  it('Q7: the note is never on a panel that follows the window, and goes when all time is chosen', async () => {
    await openOverview();
    for (const title of [...FOLLOWS, ...DOES_NOT]) expect(article(title).textContent, title).not.toContain(NOTE);
    chooseWindow('today');
    for (const title of FOLLOWS) expect(article(title).textContent, title).not.toContain(NOTE);
    chooseWindow('all');
    for (const title of [...FOLLOWS, ...DOES_NOT]) expect(article(title).textContent, title).not.toContain(NOTE);
  });
});
