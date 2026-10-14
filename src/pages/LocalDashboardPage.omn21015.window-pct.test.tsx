// @vitest-environment jsdom
// OMN-21015 AC7 beside OMN-20008 AC5: the Savings card's percentage line is part of the Savings tile, so it follows
// the window the Overview is switched to. Both changes read the row pickMeteringRow hands the card; this file pins
// that the line comes from that same row, on the card and on the page.
//
// Failure modes, each with a test below:
//   Q1  today is chosen and the line still shows the all-time ratio beside today's saving (two windows in one tile)
//   Q2  all time is chosen and the line shows a day row's ratio
//   Q3  today's row serves no ratio and the line falls back to the all-time ratio instead of going away
//   Q4  today has no row and a line is shown anyway, under "Not measured"
//   Q5  on the page, the switch moves the figure but not the line under it, or does not bring the line back
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocalPageConfig } from '../layout/local-page-loader';

const METERING = 'onex.snapshot.projection.metering-summary.v1';
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
const savings = page.components.find((candidate) => candidate.component_id === 'overview-savings')!;
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

  it('Q4: a day with no row says so and shows no line', () => {
    const shown = card([ALL_ROW, YESTERDAY_ROW], 'today');
    expect(shown).toEqual(['Not measured: no runs today (UTC)']);
  });
});

describe('OMN-21015 AC7: the Overview page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => { vi.useRealTimers(); });

  const chooseWindow = (value: 'all' | 'today') =>
    fireEvent.change(screen.getByLabelText('Figures for'), { target: { value } });

  const panel = () => screen.getByRole('heading', { name: 'Savings' }).closest('article') as HTMLElement;

  it('Q5: the switch moves the figure and its line together, and all time brings both back', async () => {
    harness.reachable = new Set([METERING]);
    harness.answer = (topic) => Promise.resolve(topic === METERING ? [ALL_ROW, YESTERDAY_ROW, TODAY_ROW] : []);
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(panel().querySelector('.local-dashboard-metric')?.textContent).toBe('$0.0089');
    expect(panel().textContent).toContain(LINE(42));

    chooseWindow('today');
    expect(panel().querySelector('.local-dashboard-metric')?.textContent).toBe('$0.0003');
    expect(panel().textContent).toContain(LINE(25));
    expect(panel().textContent).not.toContain(LINE(42));

    chooseWindow('all');
    expect(panel().querySelector('.local-dashboard-metric')?.textContent).toBe('$0.0089');
    expect(panel().textContent).toContain(LINE(42));
    expect(panel().textContent).not.toContain(LINE(25));
  });
});
