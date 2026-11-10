// @vitest-environment jsdom
// OMN-20758: the Overview titles three metrics as the demo mockup does -- Actual spend, Agent calls, Tokens processed --
// over the same served figures the cards showed as Spend, Measured runs and Tokens in and out.
//
// Failure modes, each with a test below:
//   T1  a renamed card is missing, or shows a different figure than the served row's field it shows (spend_usd,
//       runs_measured and tokens_in plus tokens_out of metering-summary.v1's all-time row, the one row every page's
//       headline reads since OMN-23330 AC1/AC2, Lakshman 2026-11-10 "All on metering");
//   T2  any of the three old titles still renders on the Overview;
//   T3  a renamed card keeps its own caption (Agent calls keeps its runs-measured line), so only the title moved.
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

// An all-time row shaped like the 2026-10-09 re-walk's: 23 of 25 runs measured, tokens and a spend the cards show as served.
const ALL_ROW = { window_kind: 'all', window_start: '', as_of: '2026-10-09T12:00:00Z', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1.0.0', baseline_state: 'resolved', spend_usd: '0.0123', savings_usd: '0.002992',
  runs_total: 25, runs_measured: 23, runs_unknown_tokens: 2, runs_unknown_spend: 0, tokens_in: 4000, tokens_out: 2134 };

// A store with these totals has runs: one decisions row keeps Overview out of its no-runs-yet page.
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const DECISION = { correlation_id: 'c-1', created_at: '2026-10-09T11:00:00Z' };

async function overview(): Promise<void> {
  harness.reachable = new Set([METERING, DECISIONS]);
  harness.answer = (topic) => Promise.resolve(topic === METERING ? [ALL_ROW] : topic === DECISIONS ? [DECISION] : []);
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

  // Agent calls is the served runs_measured; every run stays in its caption, "23 of 25 runs measured" (T3).
  it('T1: Agent calls shows the served runs_measured', async () => {
    await overview();
    expect(figure('Agent calls')).toBe('23');
  });

  it('T1: Tokens processed shows the served tokens in plus out', async () => {
    await overview();
    expect(figure('Tokens processed')).toBe('6.13K');
  });

  it('T2: none of the old titles renders', async () => {
    await overview();
    for (const old of ['Spend', 'Measured runs', 'Tokens in and out']) {
      expect(screen.queryByRole('heading', { name: old })).toBeNull();
    }
  });

  it('T3: Agent calls keeps its runs-measured caption, without the All calls caption (OMN-21166 part 9 AC45)', async () => {
    await overview();
    expect(within(card('Agent calls')).queryByText('All calls')).not.toBeInTheDocument();
    expect(card('Agent calls').textContent).toContain('23 of 25 runs measured');
  });
});
