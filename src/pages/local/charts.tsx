import { useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { cssColorToHex, useThemeName } from '@/theme';

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

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

/**
 * A served decimal as a point: its number and its served text. Anything that is not a finite number is a gap. Only a
 * number or a decimal written as text is read: a list or an object is not a figure, even though a list holding one
 * number turns into that number's text.
 */
function point(value: unknown): { value: number | null; served: string | null } {
  if (typeof value !== 'number' && typeof value !== 'string') return { value: null, served: null };
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
 * One colour per plotted series, by its place among the plotted columns, unless the panel says which of the four
 * colours each takes (`places`, 1 to 4). A panel says so when it plots a figure another panel also plots, so the
 * figure is one colour on every page: Savings is the third colour on Overview and is given the third on Usage, where
 * it is the only series. Hiding a series moves no other's colour. The colours are the theme's chart colours (blue,
 * orange-red, teal, yellow), which differ in hue.
 */
function seriesColours(count: number, places: readonly number[] | undefined): string[] {
  const palette = [tone('--chart-1', 0x58a6ff), tone('--chart-4', 0xf0703c), tone('--chart-2', 0x3fb9a0), tone('--chart-3', 0xd9b530)];
  return Array.from({ length: count }, (_, index) => {
    const place = places?.[index];
    const chosen = typeof place === 'number' && Number.isInteger(place) && place >= 1 && place <= palette.length ? place - 1 : index % palette.length;
    return palette[chosen]!;
  });
}

/**
 * A tick of the value axis. The origin carries no label: on these pages a zero is something a reader must be able to
 * trust as measured, and an axis origin is not a figure. The baseline the bars stand on is still drawn.
 */
export function valueAxisLabel(value: number): string {
  return value === 0 ? '' : `$${value}`;
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
      axisPointer: { type: 'shadow' },
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
    // (The value axis starts at the library's own zero for bars; no minimum is set here.)
    yAxis: {
      type: 'value',
      axisLabel: { color: text, formatter: valueAxisLabel },
      splitLine: { lineStyle: { color: line, type: 'dashed' } },
    },
    // A bar per served day and series, side by side. A day is one figure, not a point on a slope, so nothing is drawn
    // between two days; and the series are never stacked, because their sum is no figure the runtime serves. A day
    // with no figure has no bar.
    series: shown.map(({ series, colour }) => ({
      name: series.name,
      type: 'bar',
      data: series.values,
      barMaxWidth: 36,
      itemStyle: { color: colour, borderRadius: [3, 3, 0, 0] },
      emphasis: { focus: 'series' },
    })),
  };
}

export const EVERY_SERIES_HIDDEN = 'Every series is hidden. Turn one on to draw the chart.';

/**
 * One baseline's chart with its legend (OMN-21015 U4). The legend is a row of buttons, one per plotted series, so it
 * is reached with Tab and worked with Enter or Space; each says whether its series is shown. What is hidden is kept
 * by the series' declared column, so a refresh of the served rows changes the points and not the reader's choice.
 */
function SpendChartFigure({ group, title, colourPlaces }: { group: SpendByDayGroup; title: string; colourPlaces?: readonly number[] }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const colours = seriesColours(group.series.length, colourPlaces);
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
 * OMN-21015 U2: baseline against actual spend per UTC day, as bars, one chart per baseline model. It draws exactly the points
 * `spendByDayGroups` shapes from the served day rows; the table under it carries the same rows as text.
 */
export function SpendByDayChart({ rows, columns, title = 'Spend per day', colourPlaces }: {
  rows: readonly unknown[];
  columns: readonly DeclaredChartColumn[];
  title?: string;
  /** Which of the four chart colours each plotted column takes, in plotted order (1 to 4); by place when left out. */
  colourPlaces?: readonly number[];
}) {
  // Re-read the theme's colours when the theme changes.
  useThemeName();
  const groups = spendByDayGroups(columns, rows);
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((group) => <SpendChartFigure group={group} title={title} colourPlaces={colourPlaces} key={group.baseline} />)}
    </>
  );
}

/** One of a run's timings, as the page hands it over: the label its tile carries and the value the run's row serves. */
export interface RunTiming {
  key: string;
  label: string;
  value: unknown;
}

export interface RunTimingBar {
  label: string;
  value: number;
  served: string;
  /** The timing's place among the timings handed over, so it keeps its colour when another is not measured. */
  place: number;
}

/**
 * A run's served timings shaped for bars (OMN-21015): one bar per timing whose served value is a duration, in the
 * order handed over. A timing the row does not carry, or one that is no duration, gets no bar and is named instead;
 * a served zero is a figure and keeps its place. Nothing is added up: the runtime serves no sum of these.
 */
export function runTimingBars(timings: readonly RunTiming[]): { bars: RunTimingBar[]; unmeasured: string[] } {
  const bars: RunTimingBar[] = [];
  const unmeasured: string[] = [];
  timings.forEach((timing, index) => {
    const { value, served } = point(timing.value);
    if (value === null || served === null || value < 0) unmeasured.push(timing.label);
    else bars.push({ label: timing.label, value, served, place: index + 1 });
  });
  return { bars, unmeasured };
}

/** A tick of the milliseconds axis; the origin carries no label, as on the money axis. */
export function millisecondsAxisLabel(value: number): string {
  return value === 0 ? '' : `${value} ms`;
}

function timingOption(bars: readonly RunTimingBar[], colours: readonly string[]) {
  const text = tone('--ink-2', 0x8b949e);
  const line = tone('--line', 0x30363d);
  const fontFamily = typeof document === 'undefined' ? '' : getComputedStyle(document.body).fontFamily;
  // The label at a bar's end and the tooltip both write the served text, not the number the axis needed.
  const servedText = (index: number) => `${bars[index]?.served ?? ''} ms`;
  return {
    animationDuration: 250,
    ...(fontFamily ? { textStyle: { fontFamily } } : {}),
    grid: { left: 96, right: 84, top: 6, bottom: 24 },
    tooltip: {
      trigger: 'item',
      formatter: (param: { dataIndex: number; name: string; marker: string }) => `${param.marker}${param.name}: ${servedText(param.dataIndex)}`,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: text, formatter: millisecondsAxisLabel },
      splitLine: { lineStyle: { color: line, type: 'dashed' } },
    },
    // The first timing is the top row, as the tiles above read left to right.
    yAxis: {
      type: 'category',
      inverse: true,
      data: bars.map((bar) => bar.label),
      axisLine: { lineStyle: { color: line } },
      axisTick: { show: false },
      axisLabel: { color: text },
    },
    // One bar per measured timing, side by side and never stacked: the runtime serves no sum of them.
    series: [{
      type: 'bar',
      barMaxWidth: 18,
      data: bars.map((bar, index) => ({ value: bar.value, itemStyle: { color: colours[index]!, borderRadius: [0, 3, 3, 0] } })),
      label: { show: true, position: 'right', color: text, formatter: (param: { dataIndex: number }) => servedText(param.dataIndex) },
    }],
  };
}

/**
 * OMN-21015: where one run's time went, as bars. A second way of showing the timings the run summary's tiles carry as
 * text; it draws exactly the bars `runTimingBars` shapes, and nothing when no timing is measured.
 */
export function RunTimingChart({ timings, title = 'Run timing' }: { timings: readonly RunTiming[]; title?: string }) {
  // Re-read the theme's colours when the theme changes.
  useThemeName();
  const { bars, unmeasured } = runTimingBars(timings);
  if (bars.length === 0) return null;
  const palette = seriesColours(timings.length, undefined);
  const colours = bars.map((bar) => palette[bar.place - 1]!);
  return (
    <figure className="local-chart local-chart--timing" aria-label={title}>
      <ReactEChartsCore echarts={echarts} option={timingOption(bars, colours)} notMerge opts={{ renderer: 'svg' }} className="local-chart-canvas" />
      <figcaption>
        {`${bars.map((bar) => bar.label).join(', ')} of this run in milliseconds, ${bars.length === 1 ? 'as served.' : 'each as served, side by side and not added together.'}`}
        {unmeasured.length > 0 && ` No measured value to draw for: ${unmeasured.join(', ')}.`}
      </figcaption>
    </figure>
  );
}
