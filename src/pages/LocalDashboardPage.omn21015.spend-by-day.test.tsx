// @vitest-environment jsdom
// OMN-21015 AC1: the Overview renders baseline against actual spend per UTC day from the day rows of
// metering-summary.v1, the series OMN-20007 serves. The panel renders the columns the page declares, as served; its
// all-time line is the served `all` row, the same row the headline cards read, so it sums nothing.
//
// RECORDED is a real record: the three metering_summary rows of one install's local store, read on 2026-10-13 at
// 06:12Z (two UTC days and the all-time row, one baseline). The tenant id is left out; no card or panel reads it.
// Every other fixture below is constructed from those rows and says how.
//
// Failure modes, each with a test below:
//   S1  either series is absent: a day without its actual spend, or without its baseline spend (the falsifier)
//   S2  the panel's all-time line differs from the headline, because it was summed here instead of read as served
//   S3  a day whose spend was not measured shows 0
//   S4  a day whose baseline is unresolved shows a baseline figure, or 0
//   S9  a figure that does not depend on the baseline (actual spend, runs) is missing on an unresolved-baseline day and
//       the cell blames the baseline, hiding that the spend itself was not measured
//   S5  after a baseline change the two baselines' days are merged into one series
//   S6  no day rows renders an empty table instead of saying why
//   S7  the days are re-sorted in the browser instead of rendered in the order served
//   S8  the window switch above the cards silently drops days from the panel
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const METERING = 'onex.snapshot.projection.metering-summary.v1';
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

import { LocalDashboardPage, MeteringDayTable, RUN_MEASURED_FIELDS } from './LocalDashboardPage';
import servedCatalogue from './local/served-catalogue.lab.json';

const RECORDED_ALL = {
  window_kind: 'all', window_start: '', window_end: '2026-10-12T18:08:18.852476+00:00',
  as_of: '2026-10-12T18:08:18.852476+00:00', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0',
  baseline_state: 'resolved', runs_total: 133, runs_measured: 127, runs_unknown_tokens: 6, runs_unknown_spend: 0,
  tokens_in: 34729, tokens_out: 75064, spend_usd: '0.149422', counterfactual_usd: '0.820098',
  savings_usd: '0.670676', savings_per_measured_run_usd: '0.005281',
};
const RECORDED_DAY_1 = {
  window_kind: 'day', window_start: '2026-09-29', window_end: '2026-09-30T00:00:00+00:00',
  as_of: '2026-10-12T08:56:51.834198+00:00', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0',
  baseline_state: 'resolved', runs_total: 2, runs_measured: 2, runs_unknown_tokens: 0, runs_unknown_spend: 0,
  tokens_in: 254, tokens_out: 12, spend_usd: '0.0', counterfactual_usd: '0.000628', savings_usd: '0.000628',
  savings_per_measured_run_usd: '0.000314',
};
const RECORDED_DAY_2 = {
  window_kind: 'day', window_start: '2026-10-12', window_end: '2026-10-13T00:00:00+00:00',
  as_of: '2026-10-12T18:08:18.852476+00:00', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0',
  baseline_state: 'resolved', runs_total: 131, runs_measured: 125, runs_unknown_tokens: 6, runs_unknown_spend: 0,
  tokens_in: 34475, tokens_out: 75052, spend_usd: '0.149422', counterfactual_usd: '0.819470',
  savings_usd: '0.670048', savings_per_measured_run_usd: '0.005360',
};
// Served order of the exposure: window_kind, then window_start, then baseline_model, all ascending.
const RECORDED = [RECORDED_ALL, RECORDED_DAY_1, RECORDED_DAY_2];

async function overview(rows: unknown[]): Promise<void> {
  harness.reachable = new Set([METERING, OVERVIEW]);
  harness.answer = (topic) => Promise.resolve(topic === OVERVIEW ? [{ window: 'all', captured_at: '2026-10-13T06:00:00Z', total_cost_usd: '0.5555', total_savings_usd: '7.7777' }] : topic === METERING ? rows : []);
  render(<LocalDashboardPage pageName="overview" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const disclosure = screen.getByText('Additional runtime metrics', { selector: 'summary' });
    fireEvent.click(disclosure);
    expect(disclosure.closest('details')).toHaveAttribute('open');
}

function panel(): HTMLElement {
  const article = screen.getByRole('heading', { name: 'Spend per day' }).closest('article');
  if (article === null) throw new Error('no Spend per day panel on the Overview');
  return article as HTMLElement;
}

/** One table per baseline: its header cells, then each body row's cells, as text. */
function series(baseline: string): { headers: string[]; rows: string[][] } {
  const table = within(panel()).getByRole('table', { name: `Spend per day vs ${baseline}` });
  const [head, ...body] = within(table).getAllByRole('row');
  const cells = (row: HTMLElement) => within(row).getAllByRole(row === head ? 'columnheader' : 'cell').map((cell) => cell.textContent ?? '');
  return { headers: cells(head!), rows: body.map(cells) };
}

function headline(title: string): string {
  const article = screen.getByRole('heading', { name: title }).closest('article');
  return article?.querySelector('.local-dashboard-metric')?.textContent ?? '';
}

describe('OMN-21015 AC1: Overview shows baseline against actual spend per UTC day', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-13T06:15:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('S1: every recorded day carries its actual spend and its baseline spend', async () => {
    await overview(RECORDED);
    const { headers, rows } = series('claude-sonnet-5-5');
    expect(headers).toEqual(['Day', 'Actual spend', 'Baseline spend', 'Savings', 'Runs']);
    expect(rows.slice(0, 2)).toEqual([
      ['2026-09-29', '$0.00', '$0.01', '$0.01', '2'],
      ['2026-10-12', '$0.14', '$0.81', '$0.67', '131'],
    ]);
  });

  it('S2: the exact metering all-time line does not replace independent legacy headlines', async () => {
    await overview(RECORDED);
    const total = series('claude-sonnet-5-5').rows.at(-1);
    expect(total).toEqual(['All time', '$0.14', '$0.82', '$0.67', '133']);
    // Baseline spend uses this metering row; legacy spend/savings headlines deliberately use a conflicting source.
    expect(headline('Actual spend')).toBe('$0.55');
    expect(headline('Baseline spend')).toBe('$0.82');
    expect(headline('Savings')).toBe('$7.77');
  });

  it('S2: an all row that is not the sum of the days is shown as served, never re-added here', async () => {
    // Constructed: the recorded all row with its three money figures changed, so no sum of the day rows equals them.
    const served = { ...RECORDED_ALL, spend_usd: '0.2', counterfactual_usd: '0.9', savings_usd: '0.7', runs_total: 140 };
    await overview([served, RECORDED_DAY_1, RECORDED_DAY_2]);
    expect(series('claude-sonnet-5-5').rows.at(-1)).toEqual(['All time', '$0.20', '$0.90', '$0.70', '140']);
    expect(headline('Actual spend')).toBe('$0.55');
  });

  it('S3: a day whose spend was not measured says so, and never shows 0', async () => {
    // Constructed: the second recorded day with its spend removed.
    await overview([RECORDED_ALL, RECORDED_DAY_1, { ...RECORDED_DAY_2, spend_usd: null }]);
    expect(series('claude-sonnet-5-5').rows[1]).toEqual(['2026-10-12', 'Not measured', '$0.81', '$0.67', '131']);
  });

  it('S4: a day with an unresolved baseline shows no baseline figure', async () => {
    // Constructed: the first recorded day as the fold serves it when no baseline resolves.
    const unresolved = {
      ...RECORDED_DAY_1, baseline_model: null, baseline_state: 'unresolved', counterfactual_usd: null, savings_usd: null,
    };
    await overview([RECORDED_ALL, unresolved, RECORDED_DAY_2]);
    expect(series('an unresolved baseline').rows).toEqual([
      ['2026-09-29', '$0.00', 'Baseline unresolved', 'Baseline unresolved', '2'],
    ]);
  });

  it('S9: on an unresolved-baseline day, missing actual spend is Not measured; only baseline figures blame the baseline', async () => {
    // Constructed: the S4 row with its actual spend and run count removed too. The fold serves spend_usd null when no run
    // was measured, whatever the baseline state; spend and runs are not priced at the baseline.
    const unresolved = {
      ...RECORDED_DAY_1, baseline_model: null, baseline_state: 'unresolved', counterfactual_usd: null, savings_usd: null,
      spend_usd: null, runs_total: null,
    };
    await overview([RECORDED_ALL, unresolved, RECORDED_DAY_2]);
    expect(series('an unresolved baseline').rows).toEqual([
      ['2026-09-29', 'Not measured', 'Baseline unresolved', 'Baseline unresolved', 'Not measured'],
    ]);
  });

  it('S9: on a resolved-baseline day a missing baseline figure is Not measured, never Baseline unresolved', async () => {
    // Constructed: the second recorded day with its baseline spend removed; its baseline is resolved.
    await overview([RECORDED_ALL, RECORDED_DAY_1, { ...RECORDED_DAY_2, counterfactual_usd: null }]);
    expect(series('claude-sonnet-5-5').rows[1]).toEqual(['2026-10-12', '$0.14', 'Not measured', '$0.67', '131']);
  });

  it('S9: every column the lab serves on metering-summary.v1 has a decided reason for being missing', () => {
    // The captured lab catalogue's column list. A column served later fails here until it is placed in one group.
    const servedColumns = (servedCatalogue as { exposures: Array<{ topic: string; columns: string[] }> }).exposures
      .find((exposure) => exposure.topic === METERING)?.columns ?? [];
    const windowAndState = ['tenant_id', 'window_kind', 'window_start', 'window_end', 'as_of', 'baseline_state', 'pricing_manifest_version', 'summary_json'];
    const baselinePriced = ['baseline_model', 'counterfactual_usd', 'savings_usd', 'savings_per_measured_run_usd', 'savings_pct_of_counterfactual'];
    expect([...servedColumns].sort()).toEqual([...windowAndState, ...baselinePriced, ...RUN_MEASURED_FIELDS].sort());

    // Constructed: an unresolved-baseline day with every figure missing, shown with every figure as a column.
    const figures = [...baselinePriced, ...RUN_MEASURED_FIELDS];
    const row = {
      window_kind: 'day', window_start: '2026-09-29', baseline_state: 'unresolved',
      ...Object.fromEntries(figures.map((field) => [field, null])),
    };
    render(<MeteringDayTable title="Reasons" rows={[row]} columns={figures.map((key) => ({ key, header: key }))} />);
    const cells = within(screen.getByRole('table', { name: 'Reasons vs an unresolved baseline' })).getAllByRole('cell');
    expect(Object.fromEntries(cells.map((cell, index) => [figures[index], cell.textContent]))).toEqual({
      ...Object.fromEntries(baselinePriced.map((field) => [field, 'Baseline unresolved'])),
      ...Object.fromEntries([...RUN_MEASURED_FIELDS].map((field) => [field, 'Not measured'])),
    });
  });

  it('S5: after a baseline change each baseline keeps its own series and its own all-time line', async () => {
    // Constructed: the recorded rows again under a second baseline, with different baseline figures.
    const other = (row: Record<string, unknown>, counterfactual: string, saved: string) =>
      ({ ...row, baseline_model: 'claude-opus-4-6', as_of: '2026-10-11T00:00:00+00:00', counterfactual_usd: counterfactual, savings_usd: saved });
    await overview([
      other(RECORDED_ALL, '1.5', '1.350578'), RECORDED_ALL,
      other(RECORDED_DAY_2, '1.4', '1.250578'), RECORDED_DAY_1, RECORDED_DAY_2,
    ]);
    expect(series('claude-opus-4-6').rows).toEqual([
      ['2026-10-12', '$0.14', '$1.40', '$1.25', '131'],
      ['All time', '$0.14', '$1.50', '$1.35', '133'],
    ]);
    expect(series('claude-sonnet-5-5').rows).toHaveLength(3);
  });

  it('S6: with no day rows the panel says why, and renders no table', async () => {
    await overview([RECORDED_ALL]);
    expect(within(panel()).queryByRole('table')).toBeNull();
    expect(within(panel()).getByRole('status').textContent).toBe('Daily spend data unavailable.');
    expect(within(panel()).getByText('No day rows yet.')).toBeInTheDocument();
  });

  it('S7: days are rendered in the order served', async () => {
    // Constructed: the two recorded days handed over newest first, as a differently ordered exposure would.
    await overview([RECORDED_ALL, RECORDED_DAY_2, RECORDED_DAY_1]);
    expect(series('claude-sonnet-5-5').rows.map((row) => row[0])).toEqual(['2026-10-12', '2026-09-29', 'All time']);
  });

  it('S8: choosing today for the cards leaves every day in the panel', async () => {
    await overview(RECORDED);
    fireEvent.click(screen.getByRole('radio', { name: 'Today (UTC)' }));
    expect(series('claude-sonnet-5-5').rows.map((row) => row[0])).toEqual(['2026-09-29', '2026-10-12', 'All time']);
  });
});
