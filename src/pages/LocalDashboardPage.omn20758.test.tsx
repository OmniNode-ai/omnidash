// @vitest-environment jsdom
// OMN-20758: the Overview titles three metrics as the demo mockup does -- Actual spend, Agent calls, Tokens processed --
// over the same served figures the cards showed as Spend, Measured runs and Tokens in and out.
//
// Failure modes, each with a test below:
//   T1  a renamed card is missing, or shows a different figure than the served row's field it always showed
//       (total_cost_usd, measured_run_count and tokens_total of the approved legacy all row);
//   T2  any of the three old titles still renders on the Overview;
//   T3  a renamed card keeps its own caption (Agent calls keeps the run-class line), so only the title moved.
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OVERVIEW = 'onex.snapshot.projection.cost.savings-overview.v1';

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
const ALL_ROW = { window: 'all', captured_at: '2026-10-09T12:00:00Z', total_cost_usd: 0.0123,
  run_count: 25, measured_run_count: 23, unknown_run_count: 2, tokens_total: 6134, total_savings_usd: 0.002992 };

async function overview(): Promise<void> {
  harness.reachable = new Set([OVERVIEW]);
  harness.answer = (topic) => Promise.resolve(topic === OVERVIEW ? [ALL_ROW] : []);
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

  it('T1: Actual spend shows the served total_cost_usd', async () => {
    await overview();
    expect(figure('Actual spend')).toBe('$0.01');
  });

  // OMN-21166 AC37: Agent calls is every call, the served run_count; the measured count is its breakdown (T3).
  it('T1: Agent calls shows the served run_count', async () => {
    await overview();
    expect(figure('Agent calls')).toBe('25');
  });

  it('T1: Tokens processed shows the served combined tokens_total', async () => {
    await overview();
    expect(figure('Tokens processed')).toBe('6.13K');
  });

  it('T2: none of the old titles renders', async () => {
    await overview();
    for (const old of ['Spend', 'Measured runs', 'Tokens in and out']) {
      expect(screen.queryByRole('heading', { name: old })).toBeNull();
    }
  });

  it('T3: Agent calls keeps its run-class caption', async () => {
    await overview();
    expect(within(card('Agent calls')).getByText('All calls')).toBeInTheDocument();
    expect(within(card('Agent calls')).getByText('23 measured · 2 unknown')).toBeInTheDocument();
  });
});
