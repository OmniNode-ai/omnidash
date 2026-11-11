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
//   G2  the table shows a value the chart does not draw, or misses a row;
//   G3  the choice is lost on a re-render within the session;
//   G4  a new kit chart is exported with neither a table nor a stated exemption.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CostQualityScatter, CumulativeColumns, DayColumns, GroupedBars, Histogram, HourHeatmap, LinePlot, MultiLinePlot, RankedBars,
  SpendColumns, TierMix,
} from '@/theme/design-system/charts';

afterEach(() => { cleanup(); sessionStorage.clear(); });
const none = () => undefined;
const DAYS = ['2026-11-08', '2026-11-09'];

const CASES: ReadonlyArray<{ name: string; label: string; chart: () => ReactElement; rows: string[][] }> = [
  { name: 'DayColumns', label: 'Runs per day', rows: [['2026-11-08', '3', '1'], ['2026-11-09', '5', 'Not recorded']],
    chart: () => <DayColumns label="Runs per day" max={5} hover={null} onHover={none} dayLabel={k => k}
      days={[{ key: DAYS[0]!, ariaLabel: 'a', tick: true, values: [{ key: 'passed', value: 3, color: 'g', label: '3' }, { key: 'failed', value: 1, color: 'r', label: '1' }] },
        { key: DAYS[1]!, ariaLabel: 'b', tick: true, values: [{ key: 'passed', value: 5, color: 'g', label: '5' }, { key: 'failed', value: null, color: 'r', label: '' }] }]} /> },
  { name: 'Histogram', label: 'Durations', rows: [['under 1 s', '4'], ['1 to 5 s', '2']],
    chart: () => <Histogram label="Durations" onHover={none} color="blue" buckets={[{ key: 'a', ariaLabel: 'under 1 s', value: 4 }, { key: 'b', ariaLabel: '1 to 5 s', value: 2 }]} /> },
  { name: 'LinePlot', label: 'Pass rate per day', rows: [['2026-11-08', '0.5000'], ['2026-11-09', 'Not recorded']],
    chart: () => <LinePlot label="Pass rate per day" keys={DAYS} labels={DAYS} values={[0.5, null]} min={0} max={1} hover={null} onHover={none} color="g" /> },
  { name: 'MultiLinePlot', label: 'Daily trend', rows: [['2026-11-08', '10', '2.5000'], ['2026-11-09', '12', '3']],
    chart: () => <MultiLinePlot label="Daily trend" keys={DAYS} labels={DAYS} hover={null} onHover={none}
      lines={[{ key: 'runs', color: 'a', values: [10, 12] }, { key: 'spend', color: 'b', values: [2.5, 3] }]} /> },
  { name: 'SpendColumns', label: 'Spend per day', rows: [['2026-11-08', '1', '2', 'Not recorded']],
    chart: () => <SpendColumns label="Spend per day" max={3} onHover={none} days={[{ key: DAYS[0]!, ariaLabel: 'a', dayText: 'Nov 8', valuesText: '', spend: 1, saved: 2, baseline: null }]} /> },
  { name: 'CumulativeColumns', label: 'Saved so far', rows: [['2026-11-08', '7']],
    chart: () => <CumulativeColumns label="Saved so far" max={7} onHover={none} days={[{ key: DAYS[0]!, ariaLabel: 'a', value: 7 }]} /> },
  { name: 'HourHeatmap', label: 'Runs by hour', rows: [['Mon', ...Array.from({ length: 24 }, (_, h) => String(h % 3))]],
    chart: () => <HourHeatmap label="Runs by hour" rows={[{ key: 'mon', label: 'Mon' }]} counts={[Array.from({ length: 24 }, (_, h) => h % 3)]}
      cellLabel={() => 'cell'} onInspect={none} /> },
  { name: 'CostQualityScatter', label: 'Cost and quality', rows: [['model-a', '0.0200', '0.9000', '40']],
    chart: () => <CostQualityScatter label="Cost and quality" formatCost={v => `$${v}`} unplotted={[]} legend={null}
      points={[{ key: 'a', name: 'model-a', cost: 0.02, rate: 0.9, runs: 40, color: 'c', detail: '' }]} /> },
  { name: 'TierMix', label: 'Tier mix', rows: [['Local', '0.7000', '70'], ['Cloud', '0.3000', '30']],
    chart: () => <TierMix nameOf={t => (t === 'local' ? 'Local' : 'Cloud')}
      shares={{ segments: [{ name: 'local', share: 0.7, count: 70 }, { name: 'cloud', share: 0.3, count: 30 }], unmeasured: [] }} /> },
  { name: 'RankedBars', label: 'Model usage', rows: [['model-a', '12 runs'], ['model-b', 'Not measured']],
    chart: () => <RankedBars label="Model usage" unit="Runs" items={[
      { key: 'a', name: 'model-a', value: 12, display: '12 runs', basis: 'measured', color: 'c' },
      { key: 'b', name: 'model-b', value: null, display: 'Not measured', basis: 'unknown', color: 'd' }]} /> },
  { name: 'GroupedBars', label: 'Tokens by model', rows: [['model-a', '10 in', '5 out']],
    chart: () => <GroupedBars label="Tokens by model" legend={[]} groups={[{ key: 'a', name: 'model-a', label: 'model-a',
      values: [{ key: 'in', value: 10, display: '10 in', color: 'x' }, { key: 'out', value: 5, display: '5 out', color: 'y' }] }]} /> },
];
const EXEMPT: Readonly<Record<string, string>> = {
  Meter: 'one value, printed beside it',
  BarTrack: 'one share, printed beside it',
  ComparisonTrack: 'a decorative track with no value of its own',
  BarSparkline: 'a decoration inside a table cell whose row already carries the figures',
};

describe('OMN-23330 AC37: every kit chart can be read as a table', () => {
  for (const testCase of CASES) {
    it(`G1 G2 G3: ${testCase.name} toggles to a table of the same rows and values, and the choice holds`, () => {
      const view = render(testCase.chart());
      const toggle = screen.getByRole('button', { name: `Show as table: ${testCase.label}` });
      expect(toggle.tagName).toBe('BUTTON');
      fireEvent.click(toggle);
      const table = screen.getByRole('table', { name: `${testCase.label} as a table` });
      const rows = within(table).getAllByRole('row').slice(1).map(row => [...row.querySelectorAll('th, td')].map(cell => cell.textContent));
      expect(rows).toEqual(testCase.rows);
      // G3: the same chart drawn again in the session opens as a table.
      view.unmount();
      render(testCase.chart());
      expect(screen.getByRole('table', { name: `${testCase.label} as a table` })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: `Show as chart: ${testCase.label}` }));
      expect(screen.queryByRole('table', { name: `${testCase.label} as a table` })).toBeNull();
    });
  }

  it('G4: every exported kit chart is either a table twin above or a named exemption', () => {
    const index = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/index.ts'), 'utf8');
    const charts = new Set(['DayColumns', 'Histogram', 'LinePlot', 'MultiLinePlot', 'SpendColumns', 'CumulativeColumns', 'HourHeatmap',
      'CostQualityScatter', 'TierMix', 'RankedBars', 'GroupedBars', 'BarSparkline', 'Meter', 'BarTrack', 'ComparisonTrack']);
    const exported = [...index.matchAll(/export \{([^}]*)\} from '\.\/([A-Za-z-]+)'/g)].flatMap(match => match[1]!.split(',').map(name => name.trim()))
      .filter(name => charts.has(name));
    expect(new Set(exported)).toEqual(charts);
    for (const name of exported) expect(CASES.some(testCase => testCase.name === name) || name in EXEMPT, name).toBe(true);
  });
});
