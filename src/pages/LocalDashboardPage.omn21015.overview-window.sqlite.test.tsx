// Source-by-mode decision, 2026-10-20: restored pre-D1 controls for catalogue-declared SQLite backing.
// @vitest-environment jsdom
// OMN-21015 AC7 (requirement OV-3): the Overview's headline tiles switch between today (UTC) and all time, each
// reading the metering-summary.v1 row the runtime serves for that window. The fold serves one `all` row and one `day`
// row per UTC date that has runs (window_start is that date, YYYY-MM-DD); "today" is the day row for today's date.
//
// Failure modes, each with a test below:
//   W1  the tiles do not change with the switch (the criterion's falsifier)
//   W2  a today figure is summed or derived in the browser instead of read from today's row
//   W3  a day with no runs shows another day's row, or reads Not measured, instead of the zero it is (Lakshman,
//       live review 2026-10-25: a UTC day with no served day row ran nothing; "instead of not measured say 0")
//   W4  "today" is taken from the reader's local date rather than the UTC date
//   W5  after a baseline change two rows exist for today and one is picked silently, or the older one is shown
//   W6  one card moves to today while another on the same page stays on all time, so the figures disagree
//   W7  switching back does not restore the all-time figures
//   W8  the switch is offered on a page whose figures it does not govern
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const METERING = 'onex.snapshot.projection.metering-summary.v1';

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
    rows: [{ topic: 'onex.snapshot.projection.cost.savings-overview.v1', reachability: 'refused', backing: 'not_in_local_store', refusal: 'projection_table_missing' }, ...[...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' }))],
  }),
}));

import { LocalDashboardPage } from './LocalDashboardPage';

const BASE = {
  baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0', baseline_state: 'resolved',
  runs_unknown_tokens: 0, runs_unknown_spend: 0,
};
// The three rows deliberately do not add up: all-time is not yesterday plus today, so a figure summed in the browser
// from the day rows (10.70) differs from the served all-time spend (12.30) and from today's (0.70).
const ALL_ROW = {
  ...BASE, window_kind: 'all', window_start: '', as_of: '2026-10-09T12:00:00Z', runs_total: 23, runs_measured: 23,
  tokens_in: 5756, tokens_out: 378, spend_usd: 12.3000, counterfactual_usd: 15.292000, savings_usd: 2.992000,
  savings_per_measured_run_usd: '0.130000',
};
const YESTERDAY_ROW = {
  ...BASE, window_kind: 'day', window_start: '2026-10-08', as_of: '2026-10-08T23:50:00Z', runs_total: 20,
  runs_measured: 20, tokens_in: 5000, tokens_out: 300, spend_usd: 10.00, counterfactual_usd: 12.000,
  savings_usd: 2.000, savings_per_measured_run_usd: '0.100000',
};
const TODAY_ROW = {
  ...BASE, window_kind: 'day', window_start: '2026-10-09', as_of: '2026-10-09T12:00:00Z', runs_total: 3,
  runs_measured: 3, tokens_in: 756, tokens_out: 78, spend_usd: 0.7000, counterfactual_usd: 1.9000,
  savings_usd: 1.2000, savings_per_measured_run_usd: '0.400000',
};

async function open(pageName: 'overview' | 'usage', rows: unknown[]): Promise<void> {
  harness.reachable = new Set([METERING]);
  harness.answer = (topic) => Promise.resolve(topic === METERING ? rows : []);
  render(<LocalDashboardPage pageName={pageName} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function figure(title: string): string {
  const article = screen.getByRole('heading', { name: title }).closest('article');
  if (article === null) throw new Error(`no ${title} card on the page`);
  return article.querySelector('.local-dashboard-metric')?.textContent ?? '';
}

function caption(title: string): string {
  const article = screen.getByRole('heading', { name: title }).closest('article');
  return article?.querySelector('.local-dashboard-caption')?.textContent ?? '';
}

// OMN-21166: the window is a two-button switch.
const chooseWindow = (value: 'all' | 'today') =>
  fireEvent.click(screen.getByRole('radio', { name: value === 'today' ? 'Today (UTC)' : 'All time' }));

describe('OMN-21015 AC7: the Overview tiles switch between today (UTC) and all time', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:05:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('opens on all time, as it always has', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    expect(screen.getByRole('radio', { name: 'All time' })).toHaveAttribute('aria-checked', 'true');
    expect(figure('Actual spend')).toBe('$12.30');
    expect(figure('Agent calls')).toBe('23');
  });

  it("W1, W2: today shows today's served row, not a sum of rows", async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe('$0.70');
    expect(figure('Agent calls')).toBe('3');
    expect(figure('Tokens processed')).toBe('834');
    expect(figure('Savings')).toBe('$1.20');
  });

  // OMN-21166 live review 2026-10-25: the secondary metrics left Overview, so the four headline cards are the page's
  // metering cards.
  it('W6: every metering card on the page moves to the same window', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(['Actual spend', 'Savings', 'Agent calls', 'Tokens processed'].map(figure)).toEqual(['$0.70', '$1.20', '3', '834']);
  });

  it('W7: all time comes back when chosen again', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    chooseWindow('all');
    expect(['Actual spend', 'Savings', 'Agent calls', 'Tokens processed'].map(figure)).toEqual(['$12.30', '$2.99', '23', '6.13K']);
  });

  it("W3: a day with no runs is that day's zero, says so, and never shows yesterday's figures", async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW]);
    chooseWindow('today');
    expect(['Actual spend', 'Savings', 'Agent calls', 'Tokens processed'].map(figure)).toEqual(['$0.00', '$0.00', '0', '0']);
    expect(screen.getAllByText('No runs today (UTC)').length).toBeGreaterThan(0);
    for (const title of ['Actual spend', 'Savings', 'Agent calls', 'Tokens processed']) {
      expect(figure(title)).not.toMatch(/10\.00|5\.3K|20|2\.00/);
    }
  });

  it('W4: today is the UTC date, also in the first minutes after UTC midnight', async () => {
    vi.setSystemTime(new Date('2026-10-09T00:04:00Z'));
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe('$0.70');
  });

  it("W3: another day's row is never today's, even when it was refreshed later", async () => {
    const refreshedLate = { ...YESTERDAY_ROW, as_of: '2026-10-09T12:04:00Z' };
    await open('overview', [ALL_ROW, refreshedLate, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe('$0.70');
    expect(figure('Agent calls')).toBe('3');
  });

  it("W5: after a baseline change, today reads the row refreshed last", async () => {
    const older = { ...TODAY_ROW, baseline_model: 'claude-opus-4-6', as_of: '2026-10-09T09:00:00Z', savings_usd: 9.9000 };
    await open('overview', [ALL_ROW, older, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Savings')).toBe('$1.20');
    expect(caption('Savings')).toContain('claude-sonnet-5-5');
  });

  it('W5: two baselines refreshed at the same moment are refused by name, not picked', async () => {
    const twin = { ...TODAY_ROW, baseline_model: 'claude-opus-4-6', savings_usd: 9.9000 };
    await open('overview', [ALL_ROW, twin, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Savings')).toBe('Not measured: 2 baseline models');
  });

  it('W8: the Usage page offers no such switch', async () => {
    await open('usage', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    expect(screen.queryByRole('radiogroup', { name: 'Figures for' })).toBeNull();
  });
});
