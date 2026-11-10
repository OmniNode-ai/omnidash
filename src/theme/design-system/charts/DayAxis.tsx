/**
 * OMN-23330 AC31: the one day axis of the chart kit. Every daily chart (Overview Runs per day, Tokens per day, Daily
 * trend and Pass rate per day, and the Usage day charts) draws its day labels with it, so the end-label rule lives here.
 *
 * AC5: a label is centred on its day whenever it fits (the operator's 2026-11-05 ruling, "Nov 5 should be in middle"),
 * and a label that would cross the axis's edge is pulled inside, flush with that edge, so no label is ever clipped.
 * Measured 2026-11-09: 42 days in 1,126 px left 27 px per day, and 39 px end labels lost 6 px and 3 px to the edges.
 *
 * Positions: `place="slot"` centres each label in its day's equal slot (bar charts); `place="point"` puts it on the
 * day's point, first day at the left edge and last at the right (line charts); `columns` measures the real centre of
 * each day's element (one child per day, in order) for charts whose columns are not equal slots. The labels are
 * decoration (aria-hidden): every chart names each day in its own accessible labels.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import './day-axis.css';
import { localeDate as fmtLocaleDate } from '@/theme/format';

const DEFAULT_FORMAT = (day: string) =>
  fmtLocaleDate(new Date(`${day}T00:00:00Z`), 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The least space between two labels, in pixels. */
const LABEL_GAP = 4;

/**
 * Where each label's left edge goes: centred on its day, then pulled inside the axis at either end. A middle label
 * that would touch its neighbour or the last label is hidden (null), so at a phone width only the labels with room show;
 * the first and last always show. `centres` and `widths` are in the axis's own pixels, one width per centre.
 */
export function placeDayLabels(axisWidth: number, centres: readonly number[], widths: readonly number[]): Array<number | null> {
  const clamped = centres.map((centre, index) => {
    const width = widths[index]!;
    return Math.min(Math.max(centre - width / 2, 0), Math.max(0, axisWidth - width));
  });
  const last = clamped.length - 1;
  const lefts: Array<number | null> = clamped.map(() => null);
  if (last < 0) return lefts;
  lefts[0] = clamped[0]!;
  let previousRight = clamped[0]! + widths[0]!;
  for (let index = 1; index < last; index += 1) {
    const left = clamped[index]!;
    const right = left + widths[index]!;
    if (left >= previousRight + LABEL_GAP && right + LABEL_GAP <= clamped[last]!) { lefts[index] = left; previousRight = right; }
  }
  if (last > 0) lefts[last] = clamped[last]!;
  return lefts;
}

/** The centre of each day as a share of the axis width, before any measuring. */
function evenCentres(count: number, place: 'slot' | 'point'): number[] {
  if (count === 0) return [];
  if (place === 'point') return Array.from({ length: count }, (_, index) => (count === 1 ? 0.5 : index / (count - 1)));
  return Array.from({ length: count }, (_, index) => (index + 0.5) / count);
}

export function DayAxis({ days, ticks, place = 'slot', columns, format = DEFAULT_FORMAT, className }: {
  /** Every day of the chart, oldest first (YYYY-MM-DD). */
  days: readonly string[];
  /** The indexes of the days that get a label; every day when omitted. */
  ticks?: ReadonlySet<number>;
  place?: 'slot' | 'point';
  /** The chart's column container: its children are the days, in order, and their measured centres place the labels. */
  columns?: RefObject<HTMLElement | null>;
  format?: (day: string) => string;
  className?: string;
}) {
  const axis = useRef<HTMLDivElement>(null);
  const shown = days.map((day, index) => ({ day, index })).filter(({ index }) => !ticks || ticks.has(index));
  const shares = evenCentres(days.length, place);

  useLayoutEffect(() => {
    const element = axis.current;
    if (!element) return undefined;
    const layout = () => {
      const box = element.getBoundingClientRect();
      const labels = [...element.querySelectorAll<HTMLElement>('.ds-day-axis-label')];
      const children = columns?.current ? [...columns.current.children] as HTMLElement[] : null;
      const centres = shown.map(({ index }) => {
        const column = children?.[index];
        if (column) { const rect = column.getBoundingClientRect(); return rect.left + rect.width / 2 - box.left; }
        return shares[index]! * box.width;
      });
      const lefts = placeDayLabels(box.width, centres, labels.map((label) => label.getBoundingClientRect().width));
      labels.forEach((label, position) => {
        const left = lefts[position];
        label.style.visibility = left === null ? 'hidden' : '';
        if (left !== null && left !== undefined) { label.style.left = `${left}px`; label.style.transform = 'none'; }
      });
    };
    layout();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(layout);
    observer.observe(element);
    return () => observer.disconnect();
  });

  return (
    <div ref={axis} className={`ds-day-axis${className ? ` ${className}` : ''}`} data-place={place} aria-hidden="true">
      {shown.map(({ day, index }) => (
        // Before measuring, a label sits centred on its day by share, so a first paint is already close.
        <span key={day} className="ds-day-axis-label" style={{ left: `${shares[index]! * 100}%` }}>{format(day)}</span>
      ))}
    </div>
  );
}
