import { useEffect, useId, useState } from 'react';
import { ChartNoAxesCombined, CircleDollarSign, Gauge, Layers, RotateCcw, ScanLine, Timer, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
import { workflowHref } from '@/navigation/workflow-url-state';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { cssColorToHex, useThemeName } from '@/theme';

echarts.use([BarChart, GridComponent, TooltipComponent, DataZoomComponent, SVGRenderer]);

/** Motion is a rendering preference, not a CSS-only effect: ECharts also obeys it. */
function useChartMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return { reduced, option: { animation: !reduced, animationDuration: reduced ? 0 : 250, animationDurationUpdate: reduced ? 0 : 180 } };
}

/** Category zoom changes the viewport only; the series and source table stay intact. */
function useChartRange(keys: readonly string[]) {
  const identity = JSON.stringify(keys);
  const [range, setRange] = useState({ identity, first: 0, last: keys.length - 1 });
  const current = range.identity === identity ? range : { identity, first: 0, last: keys.length - 1 };
  const reset = () => setRange({ identity, first: 0, last: keys.length - 1 });
  return {
    ...current, reset,
    setFirst: (first: number) => setRange({ identity, first, last: Math.max(first, current.last) }),
    setLast: (last: number) => setRange({ identity, first: Math.min(current.first, last), last }),
    option: keys.length > 1 ? { dataZoom: [{ type: 'inside', disabled: true, startValue: current.first, endValue: current.last, filterMode: 'none' }] } : {},
  };
}

function ChartHeading({ title, detail, icon: Icon = ChartNoAxesCombined }: { title: string; detail: string; icon?: LucideIcon }) {
  return <div className="local-chart-heading"><span className="local-chart-symbol" aria-hidden="true"><Icon size={17} /></span>
    <div><h3>{title}</h3><p>{detail}</p></div><ScanLine size={16} className="local-chart-inspect-icon" aria-hidden="true" /></div>;
}

function ChartRange({ count, range }: { count: number; range: ReturnType<typeof useChartRange> }) {
  const id = useId();
  if (count < 2) return null;
  return <div className="local-chart-range" role="group" aria-label="Chart range">
    <span className="local-chart-range-label">Showing {range.first + 1}–{range.last + 1} of {count}</span>
    <label htmlFor={`${id}-first`} className="sr-only">First point</label>
    <input id={`${id}-first`} type="range" min={0} max={count - 1} value={range.first} onChange={event => range.setFirst(Number(event.target.value))} />
    <label htmlFor={`${id}-last`} className="sr-only">Last point</label>
    <input id={`${id}-last`} type="range" min={0} max={count - 1} value={range.last} onChange={event => range.setLast(Number(event.target.value))} />
    <button type="button" className="local-chart-reset" onClick={range.reset}><RotateCcw size={13} aria-hidden="true" />Reset view</button>
  </div>;
}

function RunInspector({ runs, describe }: { runs: readonly ListedRun[]; describe?: (run: ListedRun) => string }) {
  const [selected, setSelected] = useState('');
  const id = useId();
  const run = runs.find(item => item.id === selected);
  // The full identity, never a bar index, survives a refresh. A removed run clears selection.
  useEffect(() => { if (!runs.some(item => item.id === selected)) setSelected(''); }, [runs, selected]);
  return <div className="local-chart-inspector">
    <label htmlFor={id}>Inspect run</label><select id={id} value={run ? selected : ''} onChange={event => setSelected(event.target.value)}>
      <option value="">Choose a listed run</option>
      {runs.filter(item => item.id !== null).map((item, index) => <option key={`${item.id}-${index}`} value={item.id!}>{item.id} · {item.model}</option>)}
    </select>
    {run && <div className="local-chart-detail" role="status"><span><strong>{run.model}</strong><span className="local-chart-detail-id">{run.id}</span></span>
      <span>{describe ? describe(run) : `${run.status} · ${point(run.duration).served ?? 'Not recorded'}${point(run.duration).served !== null ? ' ms' : ''}`}</span>
      <Link href={workflowHref(run.id!)} className="local-chart-open">Open run</Link></div>}
  </div>;
}

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
 * Text for a tooltip. The chart library puts a tooltip formatter's result into the page as HTML, so every piece of
 * text a formatter writes goes through here first: a served run id, model, day or figure, and a declared header, are
 * shown as the text they are and never become elements. The library's own series marker is HTML and is not passed in.
 */
function asText(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
          return `${p.marker}${asText(p.seriesName)}: ${served === null || served === undefined ? 'Not measured' : `$${asText(served)}`}`;
        });
        return [asText(group.days[index] ?? ''), ...lines].join('<br/>');
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
  const motion = useChartMotion();
  const range = useChartRange(group.days);
  const [day, setDay] = useState('');
  const dayId = useId();
  const selectedDay = day !== '' && group.days[Number(day)] !== undefined ? Number(day) : null;
  const dayIdentity = JSON.stringify(group.days);
  useEffect(() => setDay(''), [dayIdentity]);
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
    <figure className="local-chart" aria-label={`${title} vs ${group.baseline}`} data-motion={motion.reduced ? 'reduced' : 'full'}>
      <ChartHeading title="Daily comparison" detail={`Daily values · ${group.baseline}`} />
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
        : <ReactEChartsCore echarts={echarts} option={{ ...optionFor(group, shown), ...range.option, ...motion.option }} notMerge opts={{ renderer: 'svg' }} className="local-chart-canvas" />}
      <ChartRange count={group.days.length} range={range} />
      <div className="local-chart-inspector"><label htmlFor={dayId}>Inspect day</label>
        <select id={dayId} value={selectedDay === null ? '' : day} onChange={event => setDay(event.target.value)}>
          <option value="">Choose a served day</option>
          {group.days.map((value, index) => <option key={`${value}-${index}`} value={index}>{value}</option>)}
        </select>
        {selectedDay !== null && <div className="local-chart-detail" role="status"><strong>{group.days[selectedDay]}</strong>
          {group.series.map(series => <span key={series.key}>{series.name}: {series.served[selectedDay] == null ? 'Not measured' : `$${series.served[selectedDay]}`}</span>)}
        </div>}
      </div>
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

function timingOption(bars: readonly RunTimingBar[], colours: readonly string[], compact = false) {
  const text = tone('--ink-2', 0x8b949e);
  const line = tone('--line', 0x30363d);
  const fontFamily = typeof document === 'undefined' ? '' : getComputedStyle(document.body).fontFamily;
  // The label at a bar's end and the tooltip both write the served text, not the number the axis needed.
  const servedText = (index: number) => `${bars[index]?.served ?? ''} ms`;
  return {
    animationDuration: 250,
    ...(fontFamily ? { textStyle: { fontFamily } } : {}),
    grid: { left: compact ? 60 : 96, right: compact ? 56 : 84, top: 6, bottom: 24 },
    tooltip: {
      trigger: 'item',
      formatter: (param: { dataIndex: number; name: string; marker: string }) => `${param.marker}${asText(param.name)}: ${asText(servedText(param.dataIndex))}`,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: text, formatter: millisecondsAxisLabel, hideOverlap: true },
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
      label: { show: true, position: 'right', color: text, ...(compact ? { width: 50, overflow: 'break', distance: 4 } : {}), formatter: (param: { dataIndex: number }) => servedText(param.dataIndex) },
    }],
  };
}

/**
 * OMN-21015: where one run's time went, as bars. A second way of showing the timings the run summary's tiles carry as
 * text; it draws exactly the bars `runTimingBars` shapes, and nothing when no timing is measured.
 */
export function RunTimingChart({ timings, title = 'Run timing', compact = false, accentToken }: { timings: readonly RunTiming[]; title?: string; compact?: boolean; accentToken?: string }) {
  const motion = useChartMotion();
  // Re-read the theme's colours when the theme changes.
  useThemeName();
  const { bars, unmeasured } = runTimingBars(timings);
  if (bars.length === 0) return null;
  const palette = seriesColours(timings.length, undefined);
  const colours = bars.map((bar, index) => {
    if (!accentToken) return palette[bar.place - 1]!;
    const accent = cssColorToHex(tone(accentToken, 0xc2410c), 0xc2410c);
    // Distinct timings retain separate shades within their enclosing card's
    // accent. The first remains the exact accent; no data changes with color.
    const tint = Math.min(.5, index / (bars.length + 1));
    const channels = [16, 8, 0].map(shift => {
      const channel = (accent >> shift) & 255;
      return Math.round(channel + (255 - channel) * tint).toString(16).padStart(2, '0');
    });
    return `#${channels.join('')}`;
  });
  return (
    <figure className="local-chart local-chart--timing" aria-label={title}>
      <ReactEChartsCore echarts={echarts} option={{ ...timingOption(bars, colours, compact), ...motion.option }} notMerge opts={{ renderer: 'svg' }} className="local-chart-canvas" />
      <figcaption>
        {`${bars.map((bar) => bar.label).join(', ')} of this run in milliseconds, ${bars.length === 1 ? 'as served.' : 'each as served, side by side and not added together.'}`}
        {unmeasured.length > 0 && ` No measured value to draw for: ${unmeasured.join(', ')}.`}
      </figcaption>
    </figure>
  );
}

/** One listed run, as the Runs page hands it over: who it is and the values its row serves. */
export interface ListedRun {
  /** The run's id, or null when its row records none; such a run has a bar and opens nothing. */
  id: string | null;
  status: string;
  model: string;
  duration: unknown;
  tokensIn: unknown;
  tokensOut: unknown;
  cost?: unknown;
  score?: unknown;
}

const RUN_ID_SHOWN = 8;

/** A run's name under its bar: the start of its id, as its row in the table shows it cut. */
function runLabel(run: ListedRun): string {
  return run.id === null ? 'Not recorded' : run.id.slice(0, RUN_ID_SHOWN);
}

/** The colour of a run's status, the same the status pill in its row carries. */
function statusColour(status: string): string {
  if (status === 'passed') return tone('--status-ok', 0x3fb950);
  if (status === 'failed') return tone('--status-bad', 0xf85149);
  return tone('--ink-3', 0x6e7681);
}

/** A tick of a count axis; the origin carries no label, as on the money axis. */
export function countAxisLabel(value: number): string {
  return value === 0 ? '' : String(value);
}

/** What both run charts share: the page's text colours and font, the runs along the bottom, the value axis. */
function runChartFrame(runs: readonly ListedRun[], axisLabel: (value: number) => string) {
  const text = tone('--ink-2', 0x8b949e);
  const line = tone('--line', 0x30363d);
  const fontFamily = typeof document === 'undefined' ? '' : getComputedStyle(document.body).fontFamily;
  return {
    animationDuration: 250,
    ...(fontFamily ? { textStyle: { fontFamily } } : {}),
    grid: { left: 64, right: 16, top: 12, bottom: 28 },
    xAxis: {
      type: 'category',
      data: runs.map(runLabel),
      axisLine: { lineStyle: { color: line } },
      axisTick: { show: false },
      axisLabel: { color: text },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: text, formatter: axisLabel },
      splitLine: { lineStyle: { color: line, type: 'dashed' } },
    },
  };
}

/** The first lines of a run's tooltip: which run it is, in full, then its status and model, each as text. */
function runTooltipHead(run: ListedRun | undefined): string[] {
  if (run === undefined) return [];
  return [asText(run.id ?? 'Not recorded'), `${asText(run.status)} · ${asText(run.model)}`];
}

/** A bar opens its own run on Workflow, as the run id in its row does; a run with no recorded id opens nothing. */
function openOnClick(runs: readonly ListedRun[], onOpen: (id: string) => void) {
  return {
    click: (param: { dataIndex?: number }) => {
      const id = typeof param.dataIndex === 'number' ? runs[param.dataIndex]?.id : null;
      if (typeof id === 'string') onOpen(id);
    },
  };
}

/**
 * OMN-21015: the listed runs' durations as bars, one per run in the order handed over, coloured by the run's status.
 * A run whose row carries no duration has no bar. The key above the chart is a row of buttons, one per status among
 * the listed runs; turning one off takes that status's bars out of the drawing and nothing else: the other bars keep
 * their place and colour, and the table under the chart is not filtered by it.
 */
export function RunDurationChart({ runs, onOpen, title = 'Duration per run' }: { runs: readonly ListedRun[]; onOpen: (id: string) => void; title?: string }) {
  useThemeName();
  const motion = useChartMotion();
  const range = useChartRange(runs.map(run => run.id ?? ''));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const points = runs.map((run) => point(run.duration));
  if (points.every(({ value }) => value === null)) return null;
  const statuses = [...new Set(runs.map((run) => run.status))];
  const toggle = (status: string) => setHidden((current) => {
    const next = new Set(current);
    if (!next.delete(status)) next.add(status);
    return next;
  });
  const option = {
    ...runChartFrame(runs, millisecondsAxisLabel),
    ...range.option, ...motion.option,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ dataIndex: number; marker: string }>) => {
        const index = params[0]?.dataIndex ?? 0;
        const served = points[index]?.served;
        return [...runTooltipHead(runs[index]), `${params[0]?.marker ?? ''}Duration: ${served === null || served === undefined ? 'Not recorded' : `${asText(served)} ms`}`].join('<br/>');
      },
    },
    series: [{
      name: 'Duration',
      type: 'bar',
      barMaxWidth: 28,
      data: runs.map((run, index) => ({
        value: hidden.has(run.status) ? null : points[index]!.value,
        itemStyle: { color: statusColour(run.status), borderRadius: [3, 3, 0, 0] },
      })),
    }],
  };
  return (
    <figure className="local-chart local-chart--runs" aria-label={title} data-motion={motion.reduced ? 'reduced' : 'full'}>
      <ChartHeading title={title} detail="Explore the listed runs" icon={Timer} />
      <div className="local-chart-legend" role="group" aria-label="Statuses shown">
        {statuses.map((status) => (
          <button type="button" className="local-chart-toggle" aria-pressed={!hidden.has(status)} key={status} onClick={() => toggle(status)}>
            <span className="local-chart-swatch" data-swatch aria-hidden="true" style={{ backgroundColor: statusColour(status) }} />
            {status}
          </button>
        ))}
      </div>
      {statuses.every((status) => hidden.has(status))
        ? <p className="local-dashboard-empty" role="status">{EVERY_SERIES_HIDDEN}</p>
        : <ReactEChartsCore echarts={echarts} option={option} notMerge opts={{ renderer: 'svg' }} className="local-chart-canvas" onEvents={openOnClick(runs, onOpen)} />}
      <ChartRange count={runs.length} range={range} /><RunInspector runs={runs} />
      <figcaption>Duration of each listed run, in the list&apos;s order, in milliseconds as served. A bar opens its run.</figcaption>
    </figure>
  );
}

const RUN_TOKEN_SERIES: ReadonlyArray<{ key: 'tokensIn' | 'tokensOut'; name: string }> = [
  { key: 'tokensIn', name: 'Tokens in' },
  { key: 'tokensOut', name: 'Tokens out' },
];

/**
 * OMN-21015: the listed runs' tokens in and out as bars, side by side per run and never stacked: a run's row serves
 * the two counts and no sum of them. The legend works as the spend chart's does.
 */
export function RunTokensChart({ runs, onOpen, title = 'Tokens per run' }: { runs: readonly ListedRun[]; onOpen: (id: string) => void; title?: string }) {
  useThemeName();
  const motion = useChartMotion();
  const range = useChartRange(runs.map(run => run.id ?? ''));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  // Keep input/output identities consistent with daily charts and run metadata.
  const colours = [tone('--field-tokens-in', 0x155e75), tone('--field-tokens-out', 0x9d174d)];
  const all = RUN_TOKEN_SERIES.map((series, index) => ({ ...series, colour: colours[index]!, points: runs.map((run) => point(run[series.key])) }));
  if (all.every((series) => series.points.every(({ value }) => value === null))) return null;
  const shown = all.filter((series) => !hidden.has(series.key));
  const toggle = (key: string) => setHidden((current) => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  const option = {
    ...runChartFrame(runs, countAxisLabel),
    ...range.option, ...motion.option,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ dataIndex: number; seriesIndex: number; marker: string; seriesName: string }>) => {
        const index = params[0]?.dataIndex ?? 0;
        const lines = params.map((param) => {
          const served = shown[param.seriesIndex]?.points[index]?.served;
          return `${param.marker}${asText(param.seriesName)}: ${served === null || served === undefined ? 'Not recorded' : asText(served)}`;
        });
        return [...runTooltipHead(runs[index]), ...lines].join('<br/>');
      },
    },
    series: shown.map((series) => ({
      name: series.name,
      type: 'bar',
      barMaxWidth: 18,
      data: series.points.map(({ value }) => value),
      itemStyle: { color: series.colour, borderRadius: [3, 3, 0, 0] },
      emphasis: { focus: 'series' },
    })),
  };
  return (
    <figure className="local-chart local-chart--runs" aria-label={title} data-motion={motion.reduced ? 'reduced' : 'full'}>
      <ChartHeading title={title} detail="Explore the listed runs" icon={Layers} />
      <div className="local-chart-legend" role="group" aria-label="Series shown">
        {all.map((series) => (
          <button type="button" className="local-chart-toggle" data-field-tone={series.key === 'tokensIn' ? 'tokens-in' : 'tokens-out'} aria-pressed={!hidden.has(series.key)} key={series.key} onClick={() => toggle(series.key)}>
            <span className="local-chart-swatch" data-swatch aria-hidden="true" style={{ backgroundColor: series.colour }} />
            {series.name}
          </button>
        ))}
      </div>
      {shown.length === 0
        ? <p className="local-dashboard-empty" role="status">{EVERY_SERIES_HIDDEN}</p>
        : <ReactEChartsCore echarts={echarts} option={option} notMerge opts={{ renderer: 'svg' }} className="local-chart-canvas" onEvents={openOnClick(runs, onOpen)} />}
      <ChartRange count={runs.length} range={range} /><RunInspector runs={runs} />
      <figcaption>Tokens in and out of each listed run, in the list&apos;s order, as served. A bar opens its run.</figcaption>
    </figure>
  );
}

/** Raw per-run measures share the table's order and never aggregate or fill missing points. */
export function RunMetricChart({ runs, onOpen, metric }: {
  runs: readonly ListedRun[]; onOpen: (id: string) => void; metric: 'cost' | 'score';
}) {
  useThemeName();
  const motion = useChartMotion();
  const range = useChartRange(runs.map(run => run.id ?? ''));
  const cost = metric === 'cost';
  const title = cost ? 'Local cost per run' : 'Quality score per run';
  const label = cost ? 'Local cost' : 'Score';
  const points = runs.map(run => point(run[metric]));
  const measured = points.some(p => p.value !== null);
  const recordedCount = points.filter(p => p.value !== null).length;
  const allRecordedZero = measured && points.every(p => p.value === null || p.value === 0);
  const color = tone(cost ? '--run-cost-accent' : '--run-score-accent', cost ? 0xb45309 : 0x047857);
  const valueText = (run: ListedRun) => {
    const served = point(run[metric]).served;
    return `${label}: ${served === null ? 'Not recorded' : `${cost ? '$' : ''}${served}`}`;
  };
  const option = {
    ...runChartFrame(runs, value => value === 0 ? '' : `${cost ? '$' : ''}${value}`),
    ...range.option, ...motion.option,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const run = runs[params[0]?.dataIndex ?? 0];
        return [...runTooltipHead(run), run ? asText(valueText(run)) : 'Not recorded'].join('<br/>');
      },
    },
    series: [{ name: label, type: 'bar', barMaxWidth: 28,
      data: points.map(p => p.value), itemStyle: { color, borderRadius: [4, 4, 0, 0] },
      emphasis: { focus: 'self', itemStyle: { opacity: 1 } },
    }],
  };
  return <figure className={`local-chart local-chart--runs local-chart--${metric}`} aria-label={title} data-motion={motion.reduced ? 'reduced' : 'full'}>
    <ChartHeading title={title} detail={cost ? 'Recorded cost · USD' : 'Recorded quality score · original scale'} icon={cost ? CircleDollarSign : Gauge} />
    <div className="local-chart-coverage">
      <span>{recordedCount} of {runs.length} recorded</span>
      {recordedCount < runs.length && <span>{runs.length - recordedCount} not recorded</span>}
      {allRecordedZero && <strong>{cost ? 'Recorded costs are $0' : 'Recorded scores are 0'}</strong>}
    </div>
    {measured ? <ReactEChartsCore echarts={echarts} option={option} notMerge opts={{ renderer: 'svg' }} className="local-chart-canvas" onEvents={openOnClick(runs, onOpen)} />
      : <p className="local-dashboard-empty local-chart-unmeasured">No recorded values for these runs</p>}
    {measured && <ChartRange count={runs.length} range={range} />}
    <RunInspector runs={runs} describe={valueText} />
    <figcaption>{cost ? 'Session cost when served, otherwise the run’s recorded cost. USD, with no estimates.' : 'The run’s recorded score, without averaging or inferring a pass threshold.'} Current table page and filters; missing values remain gaps.</figcaption>
  </figure>;
}
