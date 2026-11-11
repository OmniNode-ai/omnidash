/**
 * OMN-22168 AC3: the daily bar chart of the local pages (Runs per day, Tokens per day) and its one-series cousin, the
 * histogram (How long runs take). Moved from src/pages/local/insight-charts.tsx with the markup unchanged.
 *
 * Live review 2026-10-25 ("all graphs this style"): one column per day, each series a bar side by side with its value
 * above it; a value not served draws no bar and no number. Heights are each value over the largest value in the chart.
 * A column is a button: pointer and keyboard both point at it, and a click may open the day.
 */
import { useRef, type CSSProperties } from 'react';
import { DayAxis, isTodayInProgress } from './DayAxis';
import { ChartTable } from './frame';

export interface DayBarValue { key: string; value: number | null; color: string; label: string }
export interface DayColumn { key: string; ariaLabel: string; tick: boolean; values: readonly DayBarValue[] }

function DayBars({ values, max }: { values: readonly DayBarValue[]; max: number }) {
  return (
    <span className="gdb-group">
      {values.map(entry => (
        <span key={entry.key} className="gdb-col" data-series={entry.key}>
          {entry.value !== null && entry.value > 0 && <b className="gdb-val">{entry.label}</b>}
          {entry.value !== null && entry.value > 0 && (
            <span className="gdb-bar ins-seg" style={{ height: `${(entry.value / max) * 100}%`, color: entry.color } as CSSProperties} />
          )}
        </span>
      ))}
    </span>
  );
}

/** OMN-21166 part 21 AC139: at most `maxLabels` day labels, so they never touch; the last day always has one. */
export function dayTicks(days: readonly { day: string }[], maxLabels = 14): Set<number> {
  if (days.length === 0) return new Set();
  const step = Math.max(1, Math.ceil(days.length / maxLabels));
  const last = days.length - 1;
  const ticks = days.map((_, index) => index).filter(index => index % step === 0);
  // The tick before the last day goes when it would sit beside it (30 days at step 4 labelled 28 and 29). Onex delegate run 5406a8e7.
  const previous = ticks.at(-1);
  if (previous !== undefined && last - previous < step) ticks.pop();
  ticks.push(last);
  return new Set(ticks);
}

function DayColumnsPlot({ label, days, max, hover, onHover, onOpen, describedBy, dayLabel }: {
  label: string;
  days: readonly DayColumn[];
  /** The largest value in the chart (at least 1). */
  max: number;
  hover: number | null;
  onHover: (index: number | null) => void;
  /** Called with the day's key on click; omitted, a click does nothing more than focus. */
  onOpen?: (key: string) => void;
  describedBy?: string;
  dayLabel: (key: string) => string;
}) {
  const plot = useRef<HTMLDivElement>(null);
  // OMN-23330 AC31: the day labels are the kit's one DayAxis, placed under each column's measured centre (AC5).
  const ticks = new Set(days.flatMap((day, index) => (day.tick ? [index] : [])));
  return (<>
    <div ref={plot} className="ins-bars gdb-plot" role="group" aria-label={label} onMouseLeave={() => onHover(null)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHover(null); }}>
      {days.map((day, index) => (
        <button key={day.key} type="button" className="ins-bar gdb-day" aria-label={day.ariaLabel} aria-describedby={describedBy}
          data-day={day.key} data-in-progress={isTodayInProgress(day.key) ? 'true' : undefined}
          onClick={onOpen ? () => onOpen(day.key) : undefined}
          data-dim={hover !== null && hover !== index} onMouseEnter={() => onHover(index)} onFocus={() => onHover(index)}>
          <DayBars max={max} values={day.values} />
        </button>
      ))}
    </div>
    <DayAxis days={days.map(day => day.key)} ticks={ticks} columns={plot} format={dayLabel} />
  </>);
}

export interface HistogramBucket { key: string; ariaLabel: string; value: number | null }

/**
 * Part 18 AC122: one hatched series in one colour; an empty or unserved bucket draws no bar. `solid` is the flat fill
 * the cumulative savings chart uses; `max` defaults to the largest bucket.
 */
function HistogramPlot({ label, buckets, hover = null, onHover, color, look = 'hatched', max: givenMax }: {
  label: string; buckets: readonly HistogramBucket[]; hover?: number | null; onHover: (index: number | null) => void; color: string;
  look?: 'hatched' | 'solid'; max?: number;
}) {
  // A bucket not served is left out of the scale rather than counted as 0 (OMN-21015 S3); the floor of 1 is unchanged.
  const max = givenMax ?? Math.max(1, ...buckets.flatMap(bucket => (bucket.value === null ? [] : [bucket.value])));
  return (
    <div className="ins-bars ins-bars--short" role="group" aria-label={label} onMouseLeave={() => onHover(null)}>
      {buckets.map((bucket, index) => (
        <button key={bucket.key} type="button" className="ins-bar" aria-label={bucket.ariaLabel}
          data-dim={look === 'hatched' ? hover !== null && hover !== index : undefined} onMouseEnter={() => onHover(index)} onFocus={() => onHover(index)}>
          {bucket.value !== null && bucket.value > 0 && (look === 'solid'
            ? <span className="ins-seg od-grow" style={{ height: `${(bucket.value / max) * 100}%`, background: color }} />
            : <span className="ins-seg gdb-bar od-grow" style={{ height: `${(bucket.value / max) * 100}%`, color, animationDelay: `${index * 50}ms` }} />)}
        </button>
      ))}
    </div>
  );
}

/** OMN-23330 AC37: the chart, with its "Show as table" toggle over the same rows and values. */
export function DayColumns(props: Parameters<typeof DayColumnsPlot>[0]) {
  const series = [...new Set(props.days.flatMap(day => day.values.map(value => value.key)))];
  return <ChartTable label={props.label} shape="stacked-columns" columns={['Day', ...series]}
    rows={props.days.map(day => [day.key, ...series.map(key => day.values.find(value => value.key === key)?.value ?? null)])}>
    <DayColumnsPlot {...props} />
  </ChartTable>;
}

/** OMN-23330 AC37: the chart, with its "Show as table" toggle over the same rows and values. */
export function Histogram(props: Parameters<typeof HistogramPlot>[0]) {
  return <ChartTable label={props.label} shape="columns" columns={['Range', props.label]} rows={props.buckets.map(bucket => [bucket.ariaLabel, bucket.value])}>
    <HistogramPlot {...props} />
  </ChartTable>;
}
