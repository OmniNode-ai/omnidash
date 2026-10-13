// @vitest-environment jsdom
// OMN-21015 AC7 (requirement OV-3): the Overview's headline tiles switch between today (UTC) and all time, each
// reading the metering-summary.v1 row the runtime serves for that window. The fold serves one `all` row and one `day`
// row per UTC date that has runs (window_start is that date, YYYY-MM-DD); "today" is the day row for today's date.
//
// Failure modes, each with a test below:
//   W1  the tiles do not change with the switch (the criterion's falsifier)
//   W2  a today figure is summed or derived in the browser instead of read from today's row
//   W3  a day with no runs shows 0, or another day's row, instead of saying it is not measured
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
    rows: [...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' })),
  }),
}));

import { LocalDashboardPage } from './LocalDashboardPage';

const BASE = {
  baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0', baseline_state: 'resolved',
  runs_unknown_tokens: 0, runs_unknown_spend: 0,
};
// The three rows deliberately do not add up: all-time is not yesterday plus today, so a figure summed in the browser
// from the day rows (0.0107) differs from the served all-time spend (0.0123) and from today's (0.0007).
const ALL_ROW = {
  ...BASE, window_kind: 'all', window_start: '', as_of: '2026-10-09T12:00:00Z', runs_total: 23, runs_measured: 23,
  tokens_in: 5756, tokens_out: 378, spend_usd: 0.0123, counterfactual_usd: 0.015292, savings_usd: 0.002992,
  savings_per_measured_run_usd: '0.000130',
};
const YESTERDAY_ROW = {
  ...BASE, window_kind: 'day', window_start: '2026-10-08', as_of: '2026-10-08T23:50:00Z', runs_total: 20,
  runs_measured: 20, tokens_in: 5000, tokens_out: 300, spend_usd: 0.01, counterfactual_usd: 0.012,
  savings_usd: 0.002, savings_per_measured_run_usd: '0.000100',
};
const TODAY_ROW = {
  ...BASE, window_kind: 'day', window_start: '2026-10-09', as_of: '2026-10-09T12:00:00Z', runs_total: 3,
  runs_measured: 3, tokens_in: 756, tokens_out: 78, spend_usd: 0.0007, counterfactual_usd: 0.0019,
  savings_usd: 0.0012, savings_per_measured_run_usd: '0.000400',
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

const chooseWindow = (value: 'all' | 'today') =>
  fireEvent.change(screen.getByLabelText('Figures for'), { target: { value } });

describe('OMN-21015 AC7: the Overview tiles switch between today (UTC) and all time', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:05:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('opens on all time, as it always has', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    expect((screen.getByLabelText('Figures for') as HTMLSelectElement).value).toBe('all');
    expect(figure('Actual spend')).toBe('$0.0123');
    expect(figure('Agent calls')).toBe('23');
  });

  it("W1, W2: today shows today's served row, not a sum of rows", async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe('$0.0007');
    expect(figure('Agent calls')).toBe('3');
    expect(figure('Tokens processed')).toBe('756 in · 78 out');
    expect(figure('Savings')).toBe('$0.0012');
  });

  it('W6: every metering card on the page moves to the same window', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Baseline spend')).toBe('$0.0019');
    expect(figure('Avg saving / call')).toBe('$0.000400');
    expect(caption('Avg saving / call')).toContain('Over 3 measured runs');
  });

  it('W7: all time comes back when chosen again', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    chooseWindow('all');
    expect(figure('Actual spend')).toBe('$0.0123');
    expect(figure('Avg saving / call')).toBe('$0.000130');
  });

  it("W3: a day with no runs says so, and shows neither 0 nor yesterday's figures", async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW]);
    chooseWindow('today');
    for (const title of ['Actual spend', 'Savings', 'Agent calls', 'Tokens processed', 'Avg saving / call']) {
      expect(figure(title)).toBe('Not measured: no runs today (UTC)');
    }
  });

  it('W4: today is the UTC date, also in the first minutes after UTC midnight', async () => {
    vi.setSystemTime(new Date('2026-10-09T00:04:00Z'));
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe('$0.0007');
  });

  it("W3: another day's row is never today's, even when it was refreshed later", async () => {
    const refreshedLate = { ...YESTERDAY_ROW, as_of: '2026-10-09T12:04:00Z' };
    await open('overview', [ALL_ROW, refreshedLate, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe('$0.0007');
    expect(figure('Agent calls')).toBe('3');
  });

  it("W5: after a baseline change, today reads the row refreshed last", async () => {
    const older = { ...TODAY_ROW, baseline_model: 'claude-opus-4-6', as_of: '2026-10-09T09:00:00Z', savings_usd: 0.0099 };
    await open('overview', [ALL_ROW, older, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Savings')).toBe('$0.0012');
    expect(caption('Savings')).toContain('claude-sonnet-5-5');
  });

  it('W5: two baselines refreshed at the same moment are refused by name, not picked', async () => {
    const twin = { ...TODAY_ROW, baseline_model: 'claude-opus-4-6', savings_usd: 0.0099 };
    await open('overview', [ALL_ROW, twin, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Savings')).toBe('Not measured: 2 baseline models');
  });

  it('W8: the Usage page offers no such switch', async () => {
    await open('usage', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    expect(screen.queryByLabelText('Figures for')).toBeNull();
  });
});
