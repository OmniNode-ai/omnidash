// @vitest-environment jsdom
// OMN-21015 stage 5, U2: on Usage, savings per day is drawn as a bar chart above its table. The chart is a second
// way of showing metering-summary.v1's day rows: one bar per served day, each the served savings figure, under the
// header the page declares for that column. The table under it is unchanged.
//
// Failure modes, each with a test below:
//   V1  the day rows are served and no chart is drawn;
//   V2  the chart plots a figure the page does not declare as money for this panel, or a value other than the served one;
//   V3  the all-time row is drawn as a day;
//   V4  with no day rows an empty chart is drawn, or the panel's typed state is lost;
//   V5  the table under the chart loses a row or a figure;
//   V6  a day whose savings were not measured gets a bar of zero.
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Option = Record<string, any>;
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const harness = vi.hoisted(() => ({ rows: [] as unknown[], handed: [] as Array<Record<string, any>> }));

vi.mock('echarts-for-react/lib/core', () => ({
  default: ({ option }: { option: Option }) => {
    harness.handed.push(option);
    return <div data-testid="served-chart" />;
  },
}));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const rows = topic === METERING ? harness.rows : [];
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({ rows: [{ topic: METERING, reachability: 'reachable' }] }),
}));

import { LocalDashboardPage } from './LocalDashboardPage';

const row = (kind: 'all' | 'day', start: string, savings: unknown, extra: Record<string, unknown> = {}) => ({
  window_kind: kind, window_start: start, as_of: '2026-10-13T23:00:00+00:00', baseline_model: 'claude-sonnet-5-5',
  baseline_state: 'resolved', pricing_manifest_version: '1.0.0', runs_total: 3, runs_measured: 3, tokens_in: 10, tokens_out: 20,
  spend_usd: '0.100000', counterfactual_usd: '0.400000', savings_usd: savings, ...extra,
});

async function open(rows: unknown[]): Promise<HTMLElement> {
  harness.rows = rows;
  harness.handed.length = 0;
  render(<LocalDashboardPage pageName="usage" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const panel = screen.getByRole('heading', { name: 'Savings per day' }).closest('article');
  if (panel === null) throw new Error('no Savings per day panel');
  return panel as HTMLElement;
}

beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-10-13T12:00:00Z') }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('OMN-21015 U2: savings per day on Usage, as bars', () => {
  it('V1, V2, V3: one bar per served day, each the served savings, under the declared header; the all-time row is no day', async () => {
    const panel = await open([row('all', '', '0.900000'), row('day', '2026-10-12', '0.300000'), row('day', '2026-10-13', '0.412500')]);
    expect(within(panel).getByRole('figure', { name: 'Savings per day vs claude-sonnet-5-5' })).toBeTruthy();
    expect(harness.handed).toHaveLength(1);
    const option = harness.handed[0]!;
    expect(option.xAxis.data).toEqual(['2026-10-12', '2026-10-13']);
    expect(option.series.map((series: Option) => [series.name, series.type, series.data])).toEqual([['Savings', 'bar', [0.3, 0.4125]]]);
    // Spend and baseline are served on the same rows but this panel does not declare them, so they are not drawn.
    expect(within(panel).getByRole('group', { name: 'Series shown' }).textContent).toBe('Savings');
  });

  it('V4: with no day rows there is no chart, and the panel still says what it waits on', async () => {
    const panel = await open([row('all', '', '0.900000')]);
    expect(within(panel).queryByRole('figure')).toBeNull();
    expect(harness.handed).toHaveLength(0);
    expect(within(panel).getByRole('status').textContent).toContain('No daily savings data');
  });

  it('V5: the table under the chart keeps one row per served day with its served figures', async () => {
    const panel = await open([row('day', '2026-10-12', '0.300000'), row('day', '2026-10-13', '0.412500', { runs_total: 7 })]);
    const rows = within(within(panel).getByRole('table')).getAllByRole('row').slice(1).map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    // The table writes a served decimal the way it did before the chart was added.
    expect(rows).toEqual([['2026-10-12', '$0.30', '3'], ['2026-10-13', '$0.41', '7']]);
  });

  it('V6: a day whose savings were not measured has no bar, not a bar of zero', async () => {
    await open([row('day', '2026-10-12', null), row('day', '2026-10-13', '0.412500')]);
    expect(harness.handed[0]!.series[0].data).toEqual([null, 0.4125]);
  });

  // OMN-21166 live review 2026-10-25: Overview's money chart is gone; its Savings card wears --field-savings, so the
  // Usage series must follow that token, whatever the theme sets it to.
  it('V7: Savings is the same colour here as on Overview', async () => {
    // jsdom has no canvas, so a chart colour is its token's fallback: the series must use --field-savings's, and that
    // fallback must be the light theme's --field-savings, the colour of the Savings card.
    const savingsToken = /--field-savings:\s*(#[0-9a-f]{6});/i.exec(readFileSync('src/styles/field-identity.css', 'utf8'))?.[1]?.toLowerCase();
    expect(savingsToken).toBe('#0f766e');
    await open([row('day', '2026-10-12', '0.300000')]);
    expect(harness.handed.at(-1)!.series[0].itemStyle.color).toBe(savingsToken);
  });

});
