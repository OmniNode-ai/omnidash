/**
 * OMN-21166 part 17: upright grouped bars in the Overview day-chart look (the .gdb-* classes): each group a column of
 * hatched bars side by side, its name under it, every value shown only on hover or keyboard focus. A group is a list item
 * that takes focus and names all its values. A value that is not served draws no bar and no number; heights are each
 * value over the largest served value in the chart (layout only).
 */
import type { CSSProperties } from 'react';

export interface GroupedBarValue {
  key: string;
  /** The served value; null when it is not served. */
  value: number | null;
  /** The caller's formatted value. */
  display: string;
  color: string;
  /** The field the value is (tokens-in, cost …), so the bar carries that concept's identity like every field mark. */
  tone?: string;
}

export interface GroupedBarGroup {
  key: string;
  /** The text under the column. */
  name: string;
  /** The column's accessible name, with every value in words. */
  label: string;
  nameColor?: string;
  values: readonly GroupedBarValue[];
}

export function GroupedBars({ label, groups, legend, wrapNames = false }: {
  label: string;
  groups: readonly GroupedBarGroup[];
  legend?: ReadonlyArray<{ label: string; color: string }>;
  /** Long names (model ids) wrap under their column instead of sitting on one line. */
  wrapNames?: boolean;
}) {
  const max = Math.max(0, ...groups.flatMap(group => group.values.map(entry => entry.value ?? 0)));
  return (
    <>
      <ul className={`ins-bars gdb-plot gdb-plot--list${wrapNames ? ' gdb-plot--names' : ''}`} aria-label={label}>
        {groups.map(group => (
          // The column's full sentence (e.g. a day's unmeasured calls) is its hover title as well as its accessible name.
          <li key={group.key} className="ins-bar gdb-day" tabIndex={0} aria-label={group.label} title={group.label}>
            <span className="gdb-group">
              {group.values.map(entry => {
                const drawn = entry.value !== null && entry.value > 0 && max > 0;
                return (
                  <span key={entry.key} className="gdb-col" data-series={entry.key} data-field-tone={entry.tone}>
                    {entry.value !== null && <b className="gdb-val">{entry.display}</b>}
                    {drawn && <span className="gdb-bar ins-seg" style={{ height: `${(entry.value! / max) * 100}%`, color: entry.color } as CSSProperties} />}
                  </span>
                );
              })}
            </span>
            <span className="gdb-day-label" aria-hidden="true" style={group.nameColor ? { color: group.nameColor } : undefined}>{group.name}</span>
          </li>
        ))}
      </ul>
      {legend && legend.length > 0 && (
        <ul className="ins-token-legend gdb-legend" aria-label="Series">
          {legend.map(entry => <li key={entry.label}><i aria-hidden="true" style={{ background: entry.color }} />{entry.label}</li>)}
        </ul>
      )}
    </>
  );
}
