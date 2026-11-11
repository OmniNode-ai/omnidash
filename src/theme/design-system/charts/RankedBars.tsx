/**
 * OMN-21166 AC64: the one ranked bar chart of the local pages. One bar per item, ranked by its served value, the value
 * above the bar and the name below it in the item's colour. Every drawn bar is hatched (live review 2026-10-26); how
 * the figure was obtained is said in words, in the caller's unit line and in each bar's accessible name. A value that is
 * not served is an outline with no height, never scaled or read as zero, and a negative value is labelled but never
 * drawn above the baseline.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'wouter';
import './chart-scroll.css';
import { ChartTable } from './frame';

export type RankedBarBasis = 'measured' | 'estimated' | 'unknown';

/**
 * A model id such as thinkingmachines/inkling:free wraps at its joins (after a slash, colon, hyphen or underscore), not
 * in the middle of a word (live review 2026-11-04). The text is unchanged; only line-break opportunities are added.
 */
export function breakableName(name: string): ReactNode[] {
  return name.split(/(?<=[/:_-])/).flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]));
}

export interface RankedBarItem {
  key: string;
  name: string;
  /** The served value; null when it is not served. */
  value: number | null;
  /** The caller's formatted value, or its typed state ("Not measured") when value is null. */
  display: string;
  basis: RankedBarBasis;
  color: string;
  /** The served model the bar is, when it is one: its swatch is then that model's identity mark. */
  model?: string;
  /** The routing tier the bar is, when it is one: its swatch is then that tier's identity mark. */
  tier?: string;
  title?: string;
  /** OMN-21166 part 19 AC135: where the bar leads (e.g. Runs filtered to it), and the words its link adds. */
  href?: string;
  opensLabel?: string;
  /** OMN-23330 AC37 follow-up: the served count and share (a fraction) the bar stands for, written exactly in its table. */
  count?: number | null;
  share?: number | null;
}

/** The bars in the order they are drawn: served values ranked by `order`, then the not-measured ones as handed over.
 * The chart and its table both use it, so the table lists its rows in the chart's order (OMN-23330, 2026-11-11). */
function rankItems(items: readonly RankedBarItem[], order: 'asc' | 'desc') {
  const shown = items.map(item => ({
    ...item,
    basis: item.value === null || !Number.isFinite(item.value) ? 'unknown' as const : item.basis,
  }));
  const ranked = shown.filter(item => item.basis !== 'unknown').sort((a, b) => (order === 'asc' ? a.value! - b.value! : b.value! - a.value!));
  return [...ranked, ...shown.filter(item => item.basis === 'unknown')];
}

const BASIS_WORDS: Readonly<Record<RankedBarBasis, string>> = {
  measured: 'measured',
  estimated: 'modelled',
  unknown: 'not measured',
};

function RankedBarsPlot({ label, unit, items, order = 'asc', note, footnote, layout = 'auto', many = 'sideways', ceiling, values = 'hover' }: {
  /**
   * OMN-23330 AC6 (the operator's 2026-11-09 review): 'always' prints every bar's figure; 'hover' (the 2026-10-25 ruling,
   * "show them when hover") reveals it on pointer or keyboard focus. Every bar's accessible name carries it either way.
   */
  values?: 'hover' | 'always';
  /**
   * A share's whole, e.g. 100 for a percentage (Lakshman 2026-11-05, "all bargraph should fill like this", for share bars
   * only): each bar is scaled against it, not against the largest bar, and its figure is always shown. Left out for
   * counts and money, which have no whole; they scale against the largest bar. Every bar fills a slot either way
   * (Lakshman 2026-11-05, "use all places this type of bargraph").
   */
  ceiling?: number;
  /** 'vertical' keeps upright bars in a narrow panel (live review 2026-10-25), up to 10 of them (AC213); 'auto' turns them
   * sideways below 560px. */
  layout?: 'auto' | 'vertical';
  /** Past 10 upright bars: 'sideways' (AC213), or 'scroll' for a caller whose panel scrolls to keep every name whole (AC144). */
  many?: 'sideways' | 'scroll';
  label: string;
  /** The unit and reading direction under the title, e.g. "USD · lower is better". */
  unit: string;
  items: readonly RankedBarItem[];
  order?: 'asc' | 'desc';
  note?: ReactNode;
  footnote?: ReactNode;
}) {
  const ordered = rankItems(items, order);
  const served = ordered.filter(item => item.basis !== 'unknown');
  const max = Math.max(0, ...served.map(item => item.value!));
  // OMN-21166 AC213 (Lakshman 2026-10-28): past 10 bars an upright chart splits its width too thin for any name, so it
  // runs sideways. Every drawn item counts, an unserved outline included.
  const sideways = layout === 'vertical' && many === 'sideways' && ordered.length > 10;
  return (
    <figure className={`rb-chart${layout === 'vertical' && !sideways ? ' rb-chart--vertical' : ''}${sideways ? ' rb-chart--rows' : ''}${ceiling !== undefined ? ' rb-chart--share' : ''}${values === 'always' ? ' rb-chart--values' : ''} rb-chart--filled`} aria-label={label}>
      <figcaption className="rb-head">
        <span className="rb-unit">{unit}</span>
        {note}
      </figcaption>
      {/* OMN-23330 AC4: a plot wider than its box scrolls in the kit container, its scrollbar always drawn. */}
      <div className="ds-chart-scroll">
        <ol className="rb-plot" style={{ '--rb-count': ordered.length } as CSSProperties}>
          {ordered.map(item => {
            const whole = ceiling ?? max;
            const scaled = item.basis === 'unknown' ? undefined
              : `${whole > 0 && item.value! > 0 ? Math.min(100, Math.round((item.value! / whole) * 1000) / 10) : 0}%`;
            const label = `${item.name}: ${item.display}, ${BASIS_WORDS[item.basis]}`;
            const content = <>
              <span className="rb-value" title={item.title}>{item.display}</span>
              <span className="rb-track" aria-hidden="true">
                {/* The size is one variable: the bar's height when the chart is wide, its width when narrow. */}
                {(() => {
                  const bar = <span className="rb-bar" data-pattern={item.basis === 'unknown' ? 'outline' : 'hatched'} style={scaled === undefined ? undefined : { '--rb-size': scaled } as CSSProperties} />;
                  return <span className="rb-slot">{bar}</span>;
                })()}
              </span>
              {/* OMN-21970 (Lakshman 2026-11-03, option a): the name is ink for contrast; a swatch beside it carries the bar's colour. */}
              <span className="rb-name" title={item.name}><span className="rb-swatch" aria-hidden="true" data-model-id={item.model} data-tier={item.tier} />{breakableName(item.name)}</span>
            </>;
            return (
              // Focusable, so a keyboard reader reveals the value as a pointer does on hover (live review 2026-10-25). A bar
              // with somewhere to go is a link instead (part 19 AC135, onex delegate run 9f758298), named for where it goes.
              <li key={item.key} data-ranked-item={item.key} data-basis={item.basis} tabIndex={item.href ? undefined : 0}
                aria-label={item.href ? undefined : label}
                style={{ '--rb-color': item.color } as CSSProperties}>
                {item.href ? <Link href={item.href} className="rb-link" aria-label={`${label}. ${item.opensLabel ?? 'Opens Runs'}`}>{content}</Link> : content}
              </li>
            );
          })}
        </ol>
      </div>
      {footnote && <p className="rb-footnote">{footnote}</p>}
    </figure>
  );
}

/** OMN-23330 AC37: the chart, with its "Show as table" toggle over the same rows and values. */
export function RankedBars({ table, ...props }: Parameters<typeof RankedBarsPlot>[0] & {
  /**
   * The table's columns under named headers (operator review 2026-11-11): the row header ("Model", "Tier", "Route"), then
   * an optional value column (each bar's served value, or with valueFrom 'display' its printed figure, for a chart whose
   * value is a coordinate rather than the served figure), then optional count and share columns (the bar's served count
   * and share). Each row's name, value and share wear the bar's colour.
   */
  table?: { nameHeader: string; valueHeader?: string; valueFrom?: 'value' | 'display'; countHeader?: string };
}) {
  // The table lists the bars in the order the chart draws them.
  const drawn = rankItems(props.items, props.order ?? 'asc');
  const columns = !table ? ['Name', props.unit ?? 'Value']
    : [table.nameHeader, ...(table.valueHeader ? [table.valueHeader] : []), ...(table.countHeader ? [table.countHeader, 'Share'] : [])];
  const rows = drawn.map(item => (!table ? [item.name, item.display] : [item.name,
    ...(table.valueHeader ? [table.valueFrom === 'display' ? item.display : item.value] : []),
    ...(table.countHeader ? [item.count ?? null, item.share ?? null] : [])]));
  const inked = !table ? [] : [...(table.valueHeader ? [1] : []), ...(table.countHeader ? [columns.length - 1] : [])];
  // Upright bars are columns (layout vertical, unless more than 10 items are turned sideways); the rest are bars.
  const upright = props.layout === 'vertical' && !((props.many ?? 'sideways') === 'sideways' && props.items.length > 10);
  return <ChartTable label={props.label} shape={upright ? 'columns' : 'bars'} columns={columns} rows={rows}
    rowColors={table ? drawn.map(item => item.color) : undefined} rowInkColumns={inked}>
    <RankedBarsPlot {...props} />
  </ChartTable>;
}
