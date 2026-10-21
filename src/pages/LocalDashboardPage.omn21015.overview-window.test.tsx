// @vitest-environment jsdom
// D1 confirmed2026-10-20: legacy Overview all-time totals; Today explicitly unavailable.
// Preserve all-time restoration, conflicting metering days, UTC boundary, newest-row and tie controls.
// Secondary metering metrics stay on Overview under the D2 disclosure.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const METERING = 'onex.snapshot.projection.metering-summary.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const LEGACY_ALL = { window: 'all', captured_at: '2026-10-09T12:00:00Z', total_cost_usd: '0.0123', total_savings_usd: '0.002992', run_count: 23, measured_run_count: 23, tokens_total: 6134 };
const DAILY_UNAVAILABLE = 'Not measured: daily totals unavailable (UTC)';

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

async function open(pageName: 'overview' | 'usage', rows: unknown[], totals: unknown[] = [LEGACY_ALL]): Promise<void> {
  harness.reachable = new Set([METERING, OVERVIEW]);
  harness.answer = (topic) => Promise.resolve(topic === OVERVIEW ? totals : topic === METERING ? rows : []);
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
    expect(figure('Actual spend')).toBe('$0.0123');
    expect(figure('Agent calls')).toBe('23');
  });

  it('W1, W2: Today is unavailable even if metering serves daily measurements', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe(DAILY_UNAVAILABLE);
    expect(figure('Agent calls')).toBe(DAILY_UNAVAILABLE);
    expect(figure('Tokens processed')).toBe(DAILY_UNAVAILABLE);
    expect(figure('Savings')).toBe(DAILY_UNAVAILABLE);
  });

  it('W6: secondary all-time metrics remain in the Overview disclosure', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    fireEvent.click(screen.getByText('Additional runtime metrics', { selector: 'summary' }));
    expect(figure('Baseline spend')).toBe('$0.0153');
    expect(figure('Avg saving / call')).toBe('$0.000130');
    expect(caption('Avg saving / call')).toContain('Over 23 measured runs');
  });

  it('W7: all time comes back when chosen again', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    chooseWindow('all');
    expect(figure('Actual spend')).toBe('$0.0123');
  });

  it("W3: a day with no runs says so, and shows neither 0 nor yesterday's figures", async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW]);
    chooseWindow('today');
    for (const title of ['Actual spend', 'Savings', 'Agent calls', 'Tokens processed']) {
      expect(figure(title)).toBe(DAILY_UNAVAILABLE);
    }
  });

  it('W4: Today stays unavailable across the UTC date boundary', async () => {
    vi.setSystemTime(new Date('2026-10-09T00:04:00Z'));
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe(DAILY_UNAVAILABLE);
  });

  it("W3: another day's row is never today's, even when it was refreshed later", async () => {
    const refreshedLate = { ...YESTERDAY_ROW, as_of: '2026-10-09T12:04:00Z' };
    await open('overview', [ALL_ROW, refreshedLate, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe(DAILY_UNAVAILABLE);
    expect(figure('Agent calls')).toBe(DAILY_UNAVAILABLE);
  });

  it('W5: latest legacy captured_at selects All time independently of metering baselines', async () => {
    await open('overview', [ALL_ROW, TODAY_ROW], [{ ...LEGACY_ALL, captured_at: '2026-10-09T09:00:00Z', total_savings_usd: '0.0099' }, LEGACY_ALL]);
    expect(figure('Savings')).toBe('$0.0030');
    chooseWindow('today'); expect(figure('Savings')).toBe(DAILY_UNAVAILABLE);
    chooseWindow('all'); expect(figure('Savings')).toBe('$0.0030');
  });
  it('W5: tied newest legacy timestamps are refused on every card', async () => {
    await open('overview', [ALL_ROW, TODAY_ROW], [{ ...LEGACY_ALL, total_savings_usd: '0.0099' }, LEGACY_ALL]);
    for (const title of ['Actual spend', 'Agent calls', 'Tokens processed', 'Savings']) expect(figure(title)).toBe('Not measured: ambiguous overview totals');
  });

  it('W8: the Usage page offers no such switch', async () => {
    await open('usage', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    expect(screen.queryByRole('radiogroup', { name: 'Figures for' })).toBeNull();
  });
});
