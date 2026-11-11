// @vitest-environment jsdom
// OMN-23330 AC1/AC2 (Lakshman 2026-11-10, "All on metering"): Overview's headline reads metering-summary.v1 again, so
// Today reads today's served day row, as it did before the 2026-10-20 D1 aggregate source made it unavailable. The
// old aggregate is still served here with conflicting figures: no window may show them. Kept controls: no browser sum
// of day rows, the UTC boundary, another day's late refresh, the newest row and baseline ties.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const METERING = 'onex.snapshot.projection.metering-summary.v1';
const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
/** The retired aggregate, served with figures no Overview card may show. */
const LEGACY_ALL = { window: 'all', captured_at: '2026-10-09T12:00:00Z', total_cost_usd: '55.5000', total_savings_usd: '9.900000', run_count: 99, measured_run_count: 99, tokens_total: 9999 };

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

// OMN-21970 AC9: the window is one button ("Figures for …") that opens the list of windows.
function openWindows() {
  const trigger = screen.queryByRole('button', { name: /^Figures for/ });
  if (trigger && trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
}

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

async function open(pageName: 'overview' | 'usage', rows: unknown[], totals: unknown[] = [LEGACY_ALL]): Promise<void> {
  harness.reachable = new Set([METERING, OVERVIEW, DECISIONS]);
  harness.answer = (topic) => Promise.resolve(topic === OVERVIEW ? totals : topic === METERING ? rows
    : topic === DECISIONS ? [{ correlation_id: 'c-1', created_at: '2026-10-09T11:00:00Z' }] : []);
  render(<LocalDashboardPage pageName={pageName} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function figure(title: string): string {
  const article = screen.getByRole('heading', { name: title }).closest('article');
  if (article === null) throw new Error(`no ${title} card on the page`);
  return article.querySelector('.local-dashboard-metric')?.textContent ?? '';
}

// OMN-21166: the window was a button switch; OMN-21970 AC9 put the same radios inside one dropdown.
const chooseWindow = (value: 'all' | 'today') => {
  openWindows();
  fireEvent.click(screen.getByRole('radio', { name: value === 'today' ? 'Today (UTC)' : 'All time' }));
};

describe('OMN-21015 AC7: the Overview tiles switch between today (UTC) and all time', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:05:00Z'));

    // OMN-21166 part 19 AC136 keeps Overview's window in the address, which jsdom carries from test to test.
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => { vi.useRealTimers(); });

  it('opens on all time, as it always has', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    expect(screen.getByRole('button', { name: 'Figures for All time' })).toBeTruthy();
    openWindows();
    expect(screen.getByRole('radio', { name: 'All time' })).toHaveAttribute('aria-checked', 'true');
    expect(figure('Actual spend')).toBe('$12.30');
    expect(figure('Agent calls')).toBe('23');
  });

  it("W1, W2: today shows today's served row, not a sum of rows and not the old aggregate", async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe('$0.70');
    expect(figure('Agent calls')).toBe('3');
    expect(figure('Tokens processed')).toBe('834');
    expect(figure('Savings')).toBe('$1.20');
  });

  // OMN-21166 live review 2026-10-25: the secondary metrics left Overview ("delete them"); the four headline cards
  // are its metering cards, and all time shows each one's all-time figure, never the old aggregate's.
  it('W6: the headline cards all read all time together', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    expect(screen.queryByText('Additional runtime metrics')).toBeNull();
    expect(['Actual spend', 'Savings', 'Agent calls', 'Tokens processed'].map(figure)).toEqual(['$12.30', '$2.99', '23', '6.13K']);
    expect(document.body.textContent).not.toMatch(/55\.50|9\.90|9\.99K/);
  });

  it('W7: all time comes back when chosen again', async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    chooseWindow('today');
    chooseWindow('all');
    expect(figure('Actual spend')).toBe('$12.30');
  });

  // Lakshman 2026-10-25: a chosen day with no served row is a day with no runs. It reads as zero, never yesterday's.
  it("W3: a day with no runs reads as no runs, never yesterday's figures", async () => {
    await open('overview', [ALL_ROW, YESTERDAY_ROW]);
    chooseWindow('today');
    expect(figure('Actual spend')).toBe('$0.00');
    expect(figure('Agent calls')).toBe('0');
    for (const title of ['Actual spend', 'Savings', 'Agent calls', 'Tokens processed']) expect(figure(title)).not.toMatch(/10\.00|^20$|5\.3K/);
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

  it('W5: the newest all-time row is All time, whatever the served order', async () => {
    await open('overview', [{ ...ALL_ROW, as_of: '2026-10-09T09:00:00Z', savings_usd: 9.9 }, ALL_ROW, TODAY_ROW]);
    expect(figure('Savings')).toBe('$2.99');
    chooseWindow('today'); expect(figure('Savings')).toBe('$1.20');
    chooseWindow('all'); expect(figure('Savings')).toBe('$2.99');
  });
  it('W5: two baselines refreshed at the same moment are refused by name on every card', async () => {
    await open('overview', [{ ...ALL_ROW, baseline_model: 'claude-opus-4-6', savings_usd: 9.9 }, ALL_ROW, TODAY_ROW]);
    for (const title of ['Actual spend', 'Agent calls', 'Tokens processed', 'Savings']) expect(figure(title)).toBe('Not measured: 2 baseline models');
  });

  it('W8: the Usage page offers no such switch', async () => {
    await open('usage', [ALL_ROW, YESTERDAY_ROW, TODAY_ROW]);
    expect(screen.queryByRole('radiogroup', { name: 'Figures for' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Figures for/ })).toBeNull();
  });
});
