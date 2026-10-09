// @vitest-environment jsdom
// OMN-20758: the Overview titles three metrics as the demo mockup does -- Actual spend, Agent calls, Tokens processed --
// over the same served figures the cards showed as Spend, Measured runs and Tokens in and out.
//
// Failure modes, each with a test below:
//   T1  a renamed card is missing, or shows a different figure than the served row's field it always showed
//       (spend_usd, runs_measured, tokens_in and tokens_out of metering-summary.v1's all-time row);
//   T2  any of the three old titles still renders on the Overview;
//   T3  a renamed card keeps its own caption (Agent calls keeps the run-class line), so only the title moved.
import { act, render, screen, within } from '@testing-library/react';
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

// An all-time row shaped like the 2026-10-09 re-walk's: 23 runs, tokens and a spend the cards must show as served.
const ALL_ROW = {
  window_kind: 'all', window_start: '', as_of: '2026-10-09T12:00:00Z', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1.0.0', baseline_state: 'resolved', runs_total: 23, runs_measured: 23,
  runs_unknown_tokens: 0, runs_unknown_spend: 0, tokens_in: 5756, tokens_out: 378, spend_usd: 0.0123,
  counterfactual_usd: 0.015292, savings_usd: 0.002992, savings_per_measured_run_usd: 0.00013,
};

async function overview(): Promise<void> {
  harness.reachable = new Set([METERING]);
  harness.answer = (topic) => Promise.resolve(topic === METERING ? [ALL_ROW] : []);
  render(<LocalDashboardPage pageName="overview" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function card(title: string): HTMLElement {
  const article = screen.getByRole('heading', { name: title }).closest('article');
  if (article === null) throw new Error(`no ${title} card on the Overview`);
  return article as HTMLElement;
}

const figure = (title: string) => card(title).querySelector('.local-dashboard-metric')?.textContent ?? '';

describe('OMN-20758 Overview titles match the demo mockup', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-09T12:05:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('T1: Actual spend shows the served spend_usd', async () => {
    await overview();
    expect(figure('Actual spend')).toBe('$0.0123');
  });

  it('T1: Agent calls shows the served runs_measured', async () => {
    await overview();
    expect(figure('Agent calls')).toBe('23');
  });

  it('T1: Tokens processed shows the served tokens in and out', async () => {
    await overview();
    expect(figure('Tokens processed')).toBe('5,756 in · 378 out');
  });

  it('T2: none of the old titles renders', async () => {
    await overview();
    for (const old of ['Spend', 'Measured runs', 'Tokens in and out']) {
      expect(screen.queryByRole('heading', { name: old })).toBeNull();
    }
  });

  it('T3: Agent calls keeps its run-class caption', async () => {
    await overview();
    expect(within(card('Agent calls')).getByText(/^Of 23 runs/)).toBeInTheDocument();
  });
});
