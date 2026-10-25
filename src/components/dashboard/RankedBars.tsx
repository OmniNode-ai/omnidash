/**
 * OMN-21166 AC64: the one ranked bar chart of the local pages. One bar per item, ranked by its served value, the value
 * above the bar and the name below it in the item's colour. The pattern says how the figure was obtained: dots for
 * measured, hatching for estimated (modelled), an outline with no height for a value that is not served. A value that
 * is not served is never scaled or read as zero, and a negative value is labelled but never drawn above the baseline.
 */
import type { CSSProperties, ReactNode } from 'react';

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
}

const KEY_LABELS: Readonly<Record<RankedBarBasis, string>> = {
  measured: 'Measured',
  estimated: 'Estimated',
  unknown: 'Not measured',
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
  const classes = (['measured', 'estimated', 'unknown'] as const).filter(basis => ordered.some(item => item.basis === basis));
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
          return (
            // Focusable, so a keyboard reader reveals the value as a pointer does on hover (live review 2026-10-25).
            <li key={item.key} data-ranked-item={item.key} data-basis={item.basis} tabIndex={0}
              aria-label={`${item.name}: ${item.display}, ${KEY_LABELS[item.basis].toLowerCase()}`}
              style={{ '--rb-color': item.color } as CSSProperties}>
              <span className="rb-value" title={item.title}>{item.display}</span>
              <span className="rb-track" aria-hidden="true">
                {/* The size is one variable: the bar's height when the chart is wide, its width when narrow. */}
                <span className="rb-bar" data-pattern={item.basis} style={scaled === undefined ? undefined : { '--rb-size': scaled } as CSSProperties} />
              </span>
              <span className="rb-name" title={item.name}>{item.name}</span>
            </li>
          );
        })}
      </ol>
      {classes.length > 0 && (
        <ul className="rb-key" aria-label="Chart key">
          {classes.map(basis => <li key={basis}><i aria-hidden="true" data-pattern={basis} />{KEY_LABELS[basis]}</li>)}
        </ul>
      )}
      {footnote && <p className="rb-footnote">{footnote}</p>}
    </figure>
  );
}
