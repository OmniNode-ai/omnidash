// @vitest-environment jsdom
// OMN-20752: the Overview shows Baseline spend, the served counterfactual_usd of metering-summary.v1's all-time row --
// the figure `onex metering --json` reports as counterfactual_usd -- and a typed state, never $0, when no baseline
// resolved.
//
// Failure modes, each with a test below:
//   B1  a served all-time row with a known counterfactual renders that amount on a Baseline spend card;
//   B2  a row whose baseline_state is unresolved renders Baseline unresolved, never $0, whether the row leaves
//       counterfactual_usd null or serves it as 0;
//   B3  the card names the same row's baseline model and pricing manifest, and says the figure is modelled;
//   B4  no served row at all is a typed not-measured state, never a number;
//   B5  only the all-time row is read: a day row's counterfactual is not the headline (the control for B1).
import { act, render, screen } from '@testing-library/react';
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

// The all-time row the OMN-20223 walk read on 2026-10-08: 23 runs, `onex metering --json` counterfactual_usd 0.015292.
const allRow = (fields: Record<string, unknown>) => ({
  window_kind: 'all', window_start: '', as_of: '2026-10-08T18:40:44Z', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '3', baseline_state: 'resolved', runs_total: 23, runs_measured: 23,
  runs_unknown_tokens: 0, runs_unknown_spend: 0, tokens_in: 5756, tokens_out: 378, spend_usd: 0,
  counterfactual_usd: 0.015292, savings_usd: 0.015292, savings_per_measured_run_usd: 0.000665, ...fields,
});

async function baselineCard(rows: unknown[]): Promise<HTMLElement> {
  harness.reachable = new Set([METERING]);
  harness.answer = (topic) => Promise.resolve(topic === METERING ? rows : []);
  render(<LocalDashboardPage pageName="overview" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const card = screen.getByRole('heading', { name: 'Baseline spend' }).closest('article');
  if (card === null) throw new Error('no Baseline spend card on the Overview');
  return card as HTMLElement;
}

const figure = (card: HTMLElement) => card.querySelector('.local-dashboard-metric')?.textContent ?? '';

describe('OMN-20752 Baseline spend on the Overview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-08T18:45:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('B1: renders the served counterfactual_usd of the all-time row', async () => {
    const card = await baselineCard([allRow({})]);
    expect(figure(card)).toBe('$0.0153');
  });

  it('B1: a different served counterfactual renders that amount, not a constant', async () => {
    const card = await baselineCard([allRow({ counterfactual_usd: 12.5, savings_usd: 12.5 })]);
    expect(figure(card)).toBe('$12.5000');
  });

  for (const counterfactual of [null, 0]) {
    it(`B2: an unresolved baseline is Baseline unresolved, never $0 (counterfactual_usd ${String(counterfactual)})`, async () => {
      const card = await baselineCard([allRow({
        baseline_state: 'unresolved', baseline_model: null, counterfactual_usd: counterfactual, savings_usd: null,
      })]);
      expect(figure(card)).toBe('Baseline unresolved');
      expect(card.textContent ?? '').not.toMatch(/\$\s*0/);
    });
  }

  it("B3: names the row's baseline model and pricing manifest, and says the figure is modelled", async () => {
    const card = await baselineCard([allRow({})]);
    expect(card.textContent).toContain('Baseline claude-sonnet-5-5');
    expect(card.textContent).toContain('pricing manifest v3');
    expect(card.textContent).toContain('Modelled');
  });

  it('B4: no served row is a typed not-measured state, never a number', async () => {
    const card = await baselineCard([]);
    expect(figure(card)).toMatch(/^Not measured/);
    expect(figure(card)).not.toMatch(/\d/);
  });

  it("B5: a day row's counterfactual is not the headline", async () => {
    const day = { ...allRow({ counterfactual_usd: 99 }), window_kind: 'day', window_start: '2026-10-08' };
    const card = await baselineCard([day, allRow({})]);
    expect(figure(card)).toBe('$0.0153');
  });
});
