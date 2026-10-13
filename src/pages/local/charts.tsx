import { useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { cssColorToHex, useThemeName } from '@/theme';

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

type Row = Record<string, unknown>;

/** What a day row with no baseline model is grouped under; the table beside the chart uses the same words. */
export const UNRESOLVED_BASELINE = 'an unresolved baseline';

/** A column the page declares for the panel: the chart plots the declared money columns and names no field itself. */
export interface DeclaredChartColumn {
  key: string;
  header: string;
  format?: string | null;
}

export interface ServedSeries {
  /** The declared column this series plots. */
  key: string;
  /** The declared column's header. */
  name: string;
  /** One entry per served day row: the served decimal as a number, or null where the row carries no figure. */
  values: Array<number | null>;
  /** The served text of each value, for the tooltip; null where the row carries no figure. */
  served: Array<string | null>;
}

export interface SpendByDayGroup {
  baseline: string;
  /** window_start of each served day row, in the order served. */
  days: string[];
  series: ServedSeries[];
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A served decimal as a point: its number and its served text. Anything that is not a finite number is a gap. */
function point(value: unknown): { value: number | null; served: string | null } {
  if (value === null || value === undefined) return { value: null, served: null };
  const served = String(value).trim();
  const number = served === '' ? Number.NaN : Number(served);
  return Number.isFinite(number) ? { value: number, served } : { value: null, served: null };
}

/**
 * metering-summary.v1's day rows shaped for a chart (OMN-21015 U2): one group per baseline model, each day row a
 * point, in the order served. Nothing is summed, sorted or filled in: the all-time row is not a day, a figure the row
 * does not carry is a gap, and two baselines are never joined, because their modelled figures are priced differently.
 *
 * Which figures are plotted is the page's declaration, not this module's choice: one series per declared column whose
 * format is currency, in declared order, under its declared header. So this code names no figure (the OMN-19980 guard
 * allows a savings field to be read only through a contract), and a column the page does not declare is never drawn.
 */
export function spendByDayGroups(columns: readonly DeclaredChartColumn[], rows: readonly unknown[]): SpendByDayGroup[] {
  const plotted = columns.filter((column) => column.format === 'currency');
  if (plotted.length === 0) return [];
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (!isRow(row) || row.window_kind !== 'day') continue;
    const baseline = row.baseline_model === null || row.baseline_model === undefined || row.baseline_model === ''
      ? UNRESOLVED_BASELINE
      : String(row.baseline_model);
    groups.set(baseline, [...(groups.get(baseline) ?? []), row]);
  }
  return [...groups.entries()].map(([baseline, days]) => ({
    baseline,
    days: days.map((row) => String(row.window_start ?? '')),
    series: plotted.map(({ key, header }) => {
      const points = days.map((row) => point(row[key]));
      return { key, name: header, values: points.map((p) => p.value), served: points.map((p) => p.served) };
    }),
  }));
}

/** A theme colour as the hex a chart library can animate; the token stays the source, the fallback is for tests. */
function tone(token: string, fallback: number): string {
  const value = typeof document === 'undefined'
    ? undefined
    : getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return `#${cssColorToHex(value || undefined, fallback).toString(16).padStart(6, '0')}`;
}

/**
 * One colour per declared series, by its place in the page's declaration; hiding a series moves no other's colour.
 * They are the theme's chart colours (blue, orange-red, teal, yellow), which differ in hue: the status green and the
 * brand lime used before were too alike to tell two lines apart.
 */
function seriesColours(count: number): string[] {
  const palette = [tone('--chart-1', 0x58a6ff), tone('--chart-4', 0xf0703c), tone('--chart-2', 0x3fb9a0), tone('--chart-3', 0xd9b530)];
  return Array.from({ length: count }, (_, index) => palette[index % palette.length]!);
}

/** The option for the series that are shown. The chart draws no legend: the legend is the row of buttons above it. */
function optionFor(group: SpendByDayGroup, shown: ReadonlyArray<{ series: ServedSeries; colour: string }>) {
  const text = tone('--ink-2', 0x8b949e);
  const line = tone('--line', 0x30363d);
  // The chart draws its own text; without the page's font it falls back to the browser's serif.
  const fontFamily = typeof document === 'undefined' ? '' : getComputedStyle(document.body).fontFamily;
  return {
    animationDuration: 250,
    ...(fontFamily ? { textStyle: { fontFamily } } : {}),
    grid: { left: 64, right: 20, top: 16, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      // The tooltip shows the served text of each figure, not the number the axis needed. The chart numbers the
      // series it was handed, so the index is looked up among the shown series, not among all of them.
      formatter: (params: Array<{ seriesIndex: number; dataIndex: number; marker: string; seriesName: string }>) => {
        const index = params[0]?.dataIndex ?? 0;
        const lines = params.map((p) => {
          const served = shown[p.seriesIndex]?.series.served[index];
          return `${p.marker}${p.seriesName}: ${served === null || served === undefined ? 'Not measured' : `$${served}`}`;
        });
        return [group.days[index], ...lines].join('<br/>');
      },
    },
    xAxis: {
      type: 'category',
      data: group.days,
      axisLine: { lineStyle: { color: line } },
      axisTick: { show: false },
      axisLabel: { color: text },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: text, formatter: (value: number) => `$${value}` },
      splitLine: { lineStyle: { color: line, type: 'dashed' } },
    },
    series: shown.map(({ series, colour }) => ({
      name: series.name,
      type: 'line',
      data: series.values,
      connectNulls: false,
      showSymbol: true,
      symbolSize: 7,
      lineStyle: { width: 2, color: colour },
      itemStyle: { color: colour },
    })),
  };
}

export const EVERY_SERIES_HIDDEN = 'Every series is hidden. Turn one on to draw the chart.';

/**
 * One baseline's chart with its legend (OMN-21015 U4). The legend is a row of buttons, one per plotted series, so it
 * is reached with Tab and worked with Enter or Space; each says whether its series is shown. What is hidden is kept
 * by the series' declared column, so a refresh of the served rows changes the points and not the reader's choice.
 */
function SpendChartFigure({ group, title }: { group: SpendByDayGroup; title: string }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const colours = seriesColours(group.series.length);
  const all = group.series.map((series, index) => ({ series, colour: colours[index]! }));
  const shown = all.filter(({ series }) => !hidden.has(series.key));
  const toggle = (key: string) => setHidden((current) => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  return (
    <figure className="local-chart" aria-label={`${title} vs ${group.baseline}`}>
      <div className="local-chart-legend" role="group" aria-label="Series shown">
        {all.map(({ series, colour }) => (
          <button
            type="button"
            className="local-chart-toggle"
            aria-pressed={!hidden.has(series.key)}
            key={series.key}
            onClick={() => toggle(series.key)}
          >
            <span className="local-chart-swatch" data-swatch aria-hidden="true" style={{ backgroundColor: colour }} />
            {series.name}
          </button>
        ))}
      </div>
      {shown.length === 0
        ? <p className="local-dashboard-empty" role="status">{EVERY_SERIES_HIDDEN}</p>
        : <ReactEChartsCore echarts={echarts} option={optionFor(group, shown)} notMerge opts={{ renderer: 'svg' }} className="local-chart-canvas" />}
      <figcaption>{`${group.series.map((series) => series.name).join(', ')} per served day, against ${group.baseline}`}</figcaption>
    </figure>
  );
}

/**
 * OMN-21015 U2: baseline against actual spend per UTC day, one chart per baseline model. It draws exactly the points
 * `spendByDayGroups` shapes from the served day rows; the table under it carries the same rows as text.
 */
export function SpendByDayChart({ rows, columns, title = 'Spend per day' }: {
  rows: readonly unknown[];
  columns: readonly DeclaredChartColumn[];
  title?: string;
}) {
  // Re-read the theme's colours when the theme changes.
  useThemeName();
  const groups = spendByDayGroups(columns, rows);
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((group) => <SpendChartFigure group={group} title={title} key={group.baseline} />)}
    </>
  );
}
