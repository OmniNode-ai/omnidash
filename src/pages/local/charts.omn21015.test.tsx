// @vitest-environment jsdom
// OMN-21015 stage 5, U2: Overview draws baseline against actual spend per UTC day as a chart. A chart is a second way
// of showing metering-summary.v1's day rows, so it may plot only what those rows serve: one point per served day row,
// in the order served, each value the served decimal and nothing computed here.
//
// Failure modes, each with a test below:
//   G1  the days are re-sorted for the chart instead of plotted in the order served;
//   G2  the all-time row is plotted as if it were a day;
//   G3  a day whose spend was not measured is plotted as 0;
//   G4  a day whose baseline is unresolved gets a baseline point (a number, or 0);
//   G5  after a baseline change the two baselines' days are joined into one line;
//   G6  a served decimal is changed on its way to the chart, or the tooltip shows a recomputed number;
//   G7  no day rows draws an empty chart;
//   G8  the option handed to the chart library differs from the shaped rows (wrong axis, wrong series, gaps bridged);
//   G9  a value that is not a number is plotted as NaN or 0.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('echarts-for-react/lib/core', () => ({
  default: ({ option }: { option: unknown }) => <div data-testid="served-chart" data-option={JSON.stringify(option)} />,
}));

import { SpendByDayChart, spendByDayGroups } from './charts';

const day = (start: string, extra: Record<string, unknown> = {}) => ({
  window_kind: 'day', window_start: start, as_of: `${start}T23:00:00+00:00`, baseline_model: 'claude-sonnet-5-5',
  baseline_state: 'resolved', spend_usd: '0.100000', counterfactual_usd: '0.400000', savings_usd: '0.300000',
  runs_total: 3, ...extra,
});
const ALL = {
  window_kind: 'all', window_start: '', as_of: '2026-10-12T23:00:00+00:00', baseline_model: 'claude-sonnet-5-5',
  baseline_state: 'resolved', spend_usd: '0.149422', counterfactual_usd: '0.820098', savings_usd: '0.670676', runs_total: 133,
};

function options(): Array<Record<string, any>> {
  return screen.getAllByTestId('served-chart').map((node) => JSON.parse(node.getAttribute('data-option') ?? '{}'));
}

describe('OMN-21015 U2: spend per day, shaped for a chart', () => {
  it('G1: the days are plotted in the order served, whatever that order is', () => {
    const groups = spendByDayGroups([day('2026-10-12'), day('2026-09-29'), day('2026-10-05')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toEqual(['2026-10-12', '2026-09-29', '2026-10-05']);
  });

  it('G2: the all-time row is not a point', () => {
    const groups = spendByDayGroups([ALL, day('2026-09-29'), day('2026-10-12')]);
    expect(groups[0].days).toEqual(['2026-09-29', '2026-10-12']);
    expect(groups[0].series.every((series) => series.values.length === 2)).toBe(true);
  });

  it('G3: a day whose spend was not measured is a gap, never 0', () => {
    const groups = spendByDayGroups([day('2026-09-29', { spend_usd: null }), day('2026-10-12')]);
    const actual = groups[0].series.find((series) => series.key === 'spend_usd')!;
    expect(actual.values).toEqual([null, 0.1]);
    expect(actual.served).toEqual([null, '0.100000']);
  });

  it('G4: an unresolved baseline has no baseline points, and its actual spend is still plotted', () => {
    const rows = [day('2026-09-29', { baseline_model: null, baseline_state: 'unresolved', counterfactual_usd: null, savings_usd: null })];
    const groups = spendByDayGroups(rows);
    expect(groups[0].baseline).toBe('an unresolved baseline');
    expect(groups[0].series.find((series) => series.key === 'counterfactual_usd')!.values).toEqual([null]);
    expect(groups[0].series.find((series) => series.key === 'spend_usd')!.values).toEqual([0.1]);
  });

  it('G5: two baselines are two groups, each with only its own days', () => {
    const groups = spendByDayGroups([
      day('2026-09-29', { baseline_model: 'older-baseline' }),
      day('2026-10-12'),
      day('2026-10-13'),
    ]);
    expect(groups.map((group) => [group.baseline, group.days])).toEqual([
      ['older-baseline', ['2026-09-29']],
      ['claude-sonnet-5-5', ['2026-10-12', '2026-10-13']],
    ]);
  });

  it('G6: each plotted value is the served decimal, and the served text is kept beside it for the tooltip', () => {
    const groups = spendByDayGroups([day('2026-10-12', { spend_usd: '0.149422', counterfactual_usd: '0.820098' })]);
    const [baseline, actual] = groups[0].series;
    expect([baseline.key, actual.key]).toEqual(['counterfactual_usd', 'spend_usd']);
    expect(baseline.values).toEqual([0.820098]);
    expect(baseline.served).toEqual(['0.820098']);
    expect(actual.values).toEqual([0.149422]);
    expect(actual.served).toEqual(['0.149422']);
  });

  it('G9: a value that is not a number is a gap', () => {
    const groups = spendByDayGroups([day('2026-10-12', { spend_usd: 'n/a', counterfactual_usd: '' })]);
    expect(groups[0].series.map((series) => series.values)).toEqual([[null], [null]]);
  });
});

describe('OMN-21015 U2: the spend chart on the page', () => {
  it('G7: no day rows draws no chart', () => {
    const { container } = render(<SpendByDayChart rows={[ALL]} />);
    expect(screen.queryByTestId('served-chart')).toBeNull();
    expect(container.querySelector('figure')).toBeNull();
  });

  it('G8: the chart is handed the shaped days and series, baseline then actual, and gaps are not bridged', () => {
    render(<SpendByDayChart rows={[ALL, day('2026-09-29', { spend_usd: null }), day('2026-10-12', { spend_usd: '0.149422', counterfactual_usd: '0.820098' })]} />);
    const [option] = options();
    expect(option.xAxis.data).toEqual(['2026-09-29', '2026-10-12']);
    expect(option.series.map((series: any) => series.name)).toEqual(['Baseline (modelled)', 'Actual spend']);
    expect(option.series[0].data).toEqual([0.4, 0.820098]);
    expect(option.series[1].data).toEqual([null, 0.149422]);
    expect(option.series.every((series: any) => series.connectNulls === false)).toBe(true);
  });

  it('G5: two baselines are two charts, each named for its baseline', () => {
    render(<SpendByDayChart rows={[day('2026-09-29', { baseline_model: 'older-baseline' }), day('2026-10-12')]} />);
    expect(options()).toHaveLength(2);
    expect(screen.getByRole('figure', { name: 'Spend per day vs older-baseline' })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Spend per day vs claude-sonnet-5-5' })).toBeInTheDocument();
  });
});
