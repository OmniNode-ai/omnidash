/**
 * OMN-21166 part 17: upright grouped bars in the Overview day-chart look (the .gdb-* classes): each group a column of
 * hatched bars side by side, its name under it, every value shown only on hover or keyboard focus. A group is a list item
 * that takes focus and names all its values. A value that is not served draws no bar and no number; heights are each
 * value over the largest served value in the chart (layout only).
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChartReadout } from './frame';
import { SeriesLegend } from './legend';
import './chart-scroll.css';

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
  /** The served model the column is, when it is one: its swatch is then that model's identity mark. */
  model?: string;
  values: readonly GroupedBarValue[];
}

export function GroupedBars({ label, groups, legend, wrapNames = false, extraLegend }: {
  label: string;
  groups: readonly GroupedBarGroup[];
  legend?: ReadonlyArray<{ label: string; color: string }>;
  /** Long names (model ids) wrap under their column instead of sitting on one line. */
  wrapNames?: boolean;
  /** A second legend (a chart's tier colours) drawn in the same row of chips as the series legend. */
  extraLegend?: ReactNode;
}) {
  // As Overview's day charts do (Lakshman 2026-11-05, "modern and unified like overview and Runs"): the group pointed at
  // or focused is read out above the plot in its full sentence, and the other groups dim.
  const [hover, setHover] = useState<string | null>(null);
  const active = groups.find(group => group.key === hover);
  // A value not served is left out of the scale rather than counted as 0 (OMN-21015 S3); the floor of 0 is unchanged.
  const max = Math.max(0, ...groups.flatMap(group => group.values.flatMap(entry => (entry.value === null ? [] : [entry.value]))));
  return (
    <>
      <ChartReadout active={active !== undefined} text={active === undefined ? '' : active.label} />
      {/* OMN-23330 AC4: a plot wider than its box scrolls in the kit container, its scrollbar always drawn. */}
      <div className="ds-chart-scroll">
        <ul className={`ins-bars gdb-plot gdb-plot--list${wrapNames ? ' gdb-plot--names' : ''}`} aria-label={label}
          onMouseLeave={() => setHover(null)}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null); }}>
          {groups.map(group => (
            // The column's full sentence (e.g. a day's unmeasured calls) is its accessible name and the readout's text.
            <li key={group.key} className="ins-bar gdb-day" tabIndex={0} aria-label={group.label}
              data-dim={hover !== null && hover !== group.key} onMouseEnter={() => setHover(group.key)} onFocus={() => setHover(group.key)}>
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
              {/* OMN-21970 (Lakshman 2026-11-03, option a): ink name for contrast; the swatch carries the model's colour. */}
              <span className="gdb-name-label" aria-hidden="true">{group.nameColor && <span className="gdb-swatch" data-model-id={group.model} style={{ background: group.nameColor }} />}{group.name}</span>
            </li>
          ))}
        </ul>
      </div>
      {((legend && legend.length > 0) || extraLegend) && <div className="gdb-legends">
        {legend && legend.length > 0 && <SeriesLegend label="Series" series={legend} />}
        {extraLegend}
      </div>}
    </>
  );
}
