/**
 * OMN-21166 AC64: the one ranked bar chart of the local pages. One bar per item, ranked by its served value, the value
 * above the bar and the name below it in the item's colour. Every drawn bar is hatched (live review 2026-10-26); how
 * the figure was obtained is said in words, in the caller's unit line and in each bar's accessible name. A value that is
 * not served is an outline with no height, never scaled or read as zero, and a negative value is labelled but never
 * drawn above the baseline.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'wouter';

export type RankedBarBasis = 'measured' | 'estimated' | 'unknown';

export interface RankedBarItem {
  key: string;
  name: string;
  /** The served value; null when it is not served. */
  value: number | null;
  /** The caller's formatted value, or its typed state ("Not measured") when value is null. */
  display: string;
  basis: RankedBarBasis;
  color: string;
  title?: string;
  /** OMN-21166 part 19 AC135: where the bar leads (e.g. Runs filtered to it), and the words its link adds. */
  href?: string;
  opensLabel?: string;
}

const BASIS_WORDS: Readonly<Record<RankedBarBasis, string>> = {
  measured: 'measured',
  estimated: 'modelled',
  unknown: 'not measured',
};

export function RankedBars({ label, unit, items, order = 'asc', note, footnote, layout = 'auto' }: {
  /** 'vertical' keeps upright bars in a narrow panel (live review 2026-10-25); 'auto' turns them sideways below 560px. */
  layout?: 'auto' | 'vertical';
  label: string;
  /** The unit and reading direction under the title, e.g. "USD · lower is better". */
  unit: string;
  items: readonly RankedBarItem[];
  order?: 'asc' | 'desc';
  note?: ReactNode;
  footnote?: ReactNode;
}) {
  const shown = items.map(item => ({
    ...item,
    basis: item.value === null || !Number.isFinite(item.value) ? 'unknown' as const : item.basis,
  }));
  const served = shown.filter(item => item.basis !== 'unknown');
  const ranked = [...served].sort((a, b) => (order === 'asc' ? a.value! - b.value! : b.value! - a.value!));
  const ordered = [...ranked, ...shown.filter(item => item.basis === 'unknown')];
  const max = Math.max(0, ...served.map(item => item.value!));
  return (
    <figure className={`rb-chart${layout === 'vertical' ? ' rb-chart--vertical' : ''}`} aria-label={label}>
      <figcaption className="rb-head">
        <span className="rb-unit">{unit}</span>
        {note}
      </figcaption>
      <ol className="rb-plot" style={{ '--rb-count': ordered.length } as CSSProperties}>
        {ordered.map(item => {
          const scaled = item.basis === 'unknown' ? undefined
            : `${max > 0 && item.value! > 0 ? Math.round((item.value! / max) * 1000) / 10 : 0}%`;
          const label = `${item.name}: ${item.display}, ${BASIS_WORDS[item.basis]}`;
          const content = <>
            <span className="rb-value" title={item.title}>{item.display}</span>
            <span className="rb-track" aria-hidden="true">
              {/* The size is one variable: the bar's height when the chart is wide, its width when narrow. */}
              <span className="rb-bar" data-pattern={item.basis === 'unknown' ? 'outline' : 'hatched'} style={scaled === undefined ? undefined : { '--rb-size': scaled } as CSSProperties} />
            </span>
            <span className="rb-name" title={item.name}>{item.name}</span>
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
      {footnote && <p className="rb-footnote">{footnote}</p>}
    </figure>
  );
}
