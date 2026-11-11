// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 AC37 (operator, chat 2026-11-11: chosen from a benchmark of 20 open-source dashboards): every kit chart that
// draws several values has a keyboard-reachable "Show as table" toggle that swaps the plot for a table of the same rows
// and values, and back; the choice holds per chart for the session. The single-value meters (Meter, BarTrack,
// ComparisonTrack: their one value is printed beside them) and BarSparkline (a decoration inside a table cell) draw no
// series to tabulate and are named below with that reason, so a new chart cannot slip through unlisted.
// Failure modes:
//   G1  a kit chart has no toggle, or the toggle is not a button (unreachable by keyboard);
//   G2  the table shows a value the chart does not draw, or misses a row (newest day first; values are written as the pages write them:
//       days "Nov 8", money "$2.50", shares "50.0%", operator review 2026-11-11);
//   G3  a chart opens on its table rather than its chart (operator 2026-11-11: "default tab selected chart"; this
//       replaces AC37's "the choice holds for the session"), or the choice is lost while the chart stays on the page;
//   G4  a kit chart is exported with neither a table nor a stated exemption (the list is read from the kit index, so a
//       chart cannot be missed by a hand-kept list, as the five ECharts charts were until 2026-11-11);
//   G5  the Chart button shows one icon for every chart instead of its own chart type (operator 2026-11-11: "chart icons
//       based on chart type should change").
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The ECharts kit charts draw on a canvas jsdom has not got; the table beside them is what is checked here.
vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="served-chart" /> }));
import {
  CostQualityScatter, CumulativeColumns, DayColumns, GroupedBars, Histogram, HourHeatmap, LinePlot, MultiLinePlot, RankedBars,
  RunDurationChart, RunMetricChart, RunTimingChart, RunTokensChart, SpendByDayChart, SpendColumns, TierMix,
} from '@/theme/design-system/charts';

afterEach(() => { cleanup(); sessionStorage.clear(); });
const none = () => undefined;
const DAYS = ['2026-11-08', '2026-11-09'];

const CASES: ReadonlyArray<{ name: string; icon: string; label: string; chart: () => ReactElement; rows: string[][] }> = [
  { name: 'DayColumns', icon: 'chart-column-stacked', label: 'Runs per day', rows: [['Nov 9', '5', 'Not recorded'], ['Nov 8', '3', '1']],
    chart: () => <DayColumns label="Runs per day" max={5} hover={null} onHover={none} dayLabel={k => k}
      days={[{ key: DAYS[0]!, ariaLabel: 'a', tick: true, values: [{ key: 'passed', value: 3, color: 'g', label: '3' }, { key: 'failed', value: 1, color: 'r', label: '1' }] },
        { key: DAYS[1]!, ariaLabel: 'b', tick: true, values: [{ key: 'passed', value: 5, color: 'g', label: '5' }, { key: 'failed', value: null, color: 'r', label: '' }] }]} /> },
  { name: 'Histogram', icon: 'chart-column', label: 'Durations', rows: [['under 1 s', '4'], ['1 to 5 s', '2']],
    chart: () => <Histogram label="Durations" onHover={none} color="blue" buckets={[{ key: 'a', ariaLabel: 'under 1 s', value: 4 }, { key: 'b', ariaLabel: '1 to 5 s', value: 2 }]} /> },
  { name: 'LinePlot', icon: 'chart-line', label: 'Pass rate per day', rows: [['Nov 9', 'Not recorded'], ['Nov 8', '50.0%']],
    chart: () => <LinePlot label="Pass rate per day" keys={DAYS} labels={DAYS} values={[0.5, null]} min={0} max={1} hover={null} onHover={none} color="g" /> },
  { name: 'MultiLinePlot', icon: 'chart-spline', label: 'Daily trend', rows: [['Nov 9', '12', '$3.00'], ['Nov 8', '10', '$2.50']],
    chart: () => <MultiLinePlot label="Daily trend" keys={DAYS} labels={DAYS} hover={null} onHover={none}
      lines={[{ key: 'runs', color: 'a', values: [10, 12] }, { key: 'spend', color: 'b', values: [2.5, 3] }]} /> },
  { name: 'SpendColumns', icon: 'chart-column', label: 'Spend per day', rows: [['Nov 8', '$1.00', '$2.00', 'Not recorded']],
    chart: () => <SpendColumns label="Spend per day" max={3} onHover={none} days={[{ key: DAYS[0]!, ariaLabel: 'a', dayText: 'Nov 8', valuesText: '', spend: 1, saved: 2, baseline: null }]} /> },
  { name: 'CumulativeColumns', icon: 'chart-column', label: 'Saved so far', rows: [['Nov 8', '$7.00']],
    chart: () => <CumulativeColumns label="Saved so far" max={7} onHover={none} days={[{ key: DAYS[0]!, ariaLabel: 'a', value: 7 }]} /> },
  { name: 'HourHeatmap', icon: 'grid-3x3', label: 'Runs by hour', rows: [['Mon', ...Array.from({ length: 24 }, (_, h) => String(h % 3))]],
    chart: () => <HourHeatmap label="Runs by hour" rows={[{ key: 'mon', label: 'Mon' }]} counts={[Array.from({ length: 24 }, (_, h) => h % 3)]}
      cellLabel={() => 'cell'} onInspect={none} /> },
  { name: 'CostQualityScatter', icon: 'chart-scatter', label: 'Cost and quality', rows: [['model-a', '$0.02', '90.0%', '40']],
    chart: () => <CostQualityScatter label="Cost and quality" formatCost={v => `$${v}`} unplotted={[]} legend={null}
      points={[{ key: 'a', name: 'model-a', cost: 0.02, rate: 0.9, runs: 40, color: 'c', detail: '' }]} /> },
  { name: 'TierMix', icon: 'chart-bar-stacked', label: 'Tier mix', rows: [['Local', '70.0%', '70'], ['Cloud', '30.0%', '30']],
    chart: () => <TierMix nameOf={t => (t === 'local' ? 'Local' : 'Cloud')}
      shares={{ segments: [{ name: 'local', share: 0.7, count: 70 }, { name: 'cloud', share: 0.3, count: 30 }], unmeasured: [] }} /> },
  { name: 'RankedBars', icon: 'chart-bar', label: 'Model usage', rows: [['model-a', '12 runs'], ['model-b', 'Not measured']],
    chart: () => <RankedBars label="Model usage" unit="Runs" items={[
      { key: 'a', name: 'model-a', value: 12, display: '12 runs', basis: 'measured', color: 'c' },
      { key: 'b', name: 'model-b', value: null, display: 'Not measured', basis: 'unknown', color: 'd' }]} /> },
  { name: 'GroupedBars', icon: 'chart-column', label: 'Tokens by model', rows: [['model-a', '10 in', '5 out']],
    chart: () => <GroupedBars label="Tokens by model" legend={[]} groups={[{ key: 'a', name: 'model-a', label: 'model-a',
      values: [{ key: 'in', value: 10, display: '10 in', color: 'x' }, { key: 'out', value: 5, display: '5 out', color: 'y' }] }]} /> },
  // OMN-23330 AC37 follow-up (2026-11-11): the ECharts kit charts the first list missed ("Duration per run" on Runs).
  { name: 'SpendByDayChart', icon: 'chart-column', label: 'Spend per day vs m', rows: [['Nov 8', '$0.10']],
    chart: () => <SpendByDayChart columns={[{ key: 'window_start', header: 'Day' }, { key: 'spend_usd', header: 'Spend', format: 'currency' }]}
      rows={[{ window_kind: 'day', window_start: '2026-11-08', baseline_model: 'm', spend_usd: '0.1' }]} /> },
  { name: 'RunTimingChart', icon: 'chart-bar', label: 'Run timing', rows: [['Queue', '120 ms'], ['Execution', '4.9 s']],
    chart: () => <RunTimingChart timings={[{ key: 'queue', label: 'Queue', value: 120 }, { key: 'exec', label: 'Execution', value: 4925 }]} /> },
  { name: 'RunDurationChart', icon: 'chart-column', label: 'Duration per run', rows: [['abcdef12', 'passed', '4.9 s']],
    chart: () => <RunDurationChart runs={[{ id: 'abcdef123456', status: 'passed', model: 'm', duration: 4925, tokensIn: 10, tokensOut: 5, cost: 0.02, score: 0.95 }]} onOpen={none} /> },
  { name: 'RunTokensChart', icon: 'chart-column', label: 'Tokens per run', rows: [['abcdef12', '10', '5']],
    chart: () => <RunTokensChart runs={[{ id: 'abcdef123456', status: 'passed', model: 'm', duration: 4925, tokensIn: 10, tokensOut: 5, cost: 0.02, score: 0.95 }]} onOpen={none} /> },
  { name: 'RunMetricChart', icon: 'chart-column', label: 'Cost per run', rows: [['abcdef12', '$0.02']],
    chart: () => <RunMetricChart runs={[{ id: 'abcdef123456', status: 'passed', model: 'm', duration: 4925, tokensIn: 10, tokensOut: 5, cost: 0.02, score: 0.95 }]} onOpen={none} metric="cost" /> },
];
const EXEMPT: Readonly<Record<string, string>> = {
  Meter: 'one value, printed beside it',
  BarTrack: 'one share, printed beside it',
  ComparisonTrack: 'a decorative track with no value of its own',
  BarSparkline: 'a decoration inside a table cell whose row already carries the figures',
};
/** Exports of the kit index that draw no chart: the frame, its states, legends and the day axis a chart draws with. */
const NOT_CHARTS: Readonly<Record<string, string>> = {
  ChartCard: 'the frame around a chart', ChartEmpty: 'a chart\'s empty state', ChartHeading: 'a chart\'s heading row',
  ChartNotRecorded: 'a chart\'s not-recorded state', ChartReadout: 'a chart\'s readout line', NamedByPanel: 'a context flag',
  SeriesLegend: 'a legend', SeriesToggles: 'a legend of toggles', TierLegend: 'a legend', DayAxis: 'the day labels a chart draws with',
  PlotLine: 'a type',
};

describe('OMN-23330 AC37: every kit chart can be read as a table', () => {
  for (const testCase of CASES) {
    it(`G1 G2 G3 G5: ${testCase.name} toggles to a table of the same rows and values, and the choice holds`, () => {
      const view = render(testCase.chart());
      const toggle = screen.getByRole('button', { name: `Show as table: ${testCase.label}` });
      expect(toggle.tagName).toBe('BUTTON');
      // G5: the Chart button's icon is this chart's own type.
      const chartButton = screen.getByRole('button', { name: `Show as chart: ${testCase.label}` });
      expect(chartButton.querySelector('svg')?.classList.contains(`lucide-${testCase.icon}`), testCase.name).toBe(true);
      fireEvent.click(toggle);
      const table = screen.getByRole('table', { name: `${testCase.label} as a table` });
      const rows = within(table).getAllByRole('row').slice(1).map(row => [...row.querySelectorAll('th, td')].map(cell => cell.textContent));
      expect(rows).toEqual(testCase.rows);
      // G3: the choice holds while the chart stays on the page; drawn anew, the chart opens on its chart.
      view.rerender(testCase.chart());
      expect(screen.getByRole('table', { name: `${testCase.label} as a table` })).toBeTruthy();
      view.unmount();
      render(testCase.chart());
      expect(screen.queryByRole('table', { name: `${testCase.label} as a table` })).toBeNull();
      expect(screen.getByRole('button', { name: `Show as chart: ${testCase.label}` }).getAttribute('aria-pressed')).toBe('true');
    });
  }

  it('G4: every component the kit index exports is a table twin above, a named exemption, or named as no chart', () => {
    // Derived from the index, not a hand-kept list: the first list missed the five ECharts charts (2026-11-11).
    const index = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/index.ts'), 'utf8');
    const exported = [...index.matchAll(/export \{([^}]*)\} from '\.\/([A-Za-z-]+)'/g)]
      .flatMap(match => match[1]!.split(',').map(name => name.trim().replace(/^type\s+/, '')))
      .filter(name => /^[A-Z][a-z]/.test(name));
    expect(exported.length).toBeGreaterThan(20);
    for (const name of exported) expect(CASES.some(testCase => testCase.name === name) || name in EXEMPT || name in NOT_CHARTS, name).toBe(true);
  });
});
