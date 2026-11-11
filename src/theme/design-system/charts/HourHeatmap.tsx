/**
 * OMN-22168 AC3: the hour-by-day heatmap of the local pages (When runs happen). Moved from
 * src/pages/local/insight-charts.tsx. One roving tab stop; arrow keys move between hours and days, Home and End to the
 * first and last hour. A cell's shade is its count over the busiest cell; an hour with no runs has no fill.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChartTable } from './frame';

function HourHeatmapPlot({ label, rows, counts, cellLabel, onInspect }: {
  label: string;
  rows: ReadonlyArray<{ key: string; label: string }>;
  /** One array of 24 counts per row. */
  counts: ReadonlyArray<readonly number[]>;
  cellLabel: (row: number, hour: number) => string;
  /** The cell pointed at, or null when the pointer leaves. */
  onInspect: (cell: [number, number] | null) => void;
}) {
  const max = Math.max(0, ...counts.flat());
  const [activeCell, setActiveCell] = useState(0);
  const last = useRef<[number, number] | null>(null);
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const helpId = useId();
  const inspect = (row: number, hour: number) => { last.current = [row, hour]; setActiveCell(row * 24 + hour); onInspect([row, hour]); };
  const move = (event: KeyboardEvent<HTMLButtonElement>, row: number, hour: number) => {
    let nextRow = row;
    let nextHour = hour;
    switch (event.key) {
      case 'ArrowLeft': nextHour = Math.max(0, hour - 1); break;
      case 'ArrowRight': nextHour = Math.min(23, hour + 1); break;
      case 'ArrowUp': nextRow = Math.max(0, row - 1); break;
      case 'ArrowDown': nextRow = Math.min(rows.length - 1, row + 1); break;
      case 'Home': nextHour = 0; if (event.ctrlKey || event.metaKey) nextRow = 0; break;
      case 'End': nextHour = 23; if (event.ctrlKey || event.metaKey) nextRow = rows.length - 1; break;
      default: return;
    }
    event.preventDefault();
    cells.current[nextRow * 24 + nextHour]?.focus();
  };
  return (
    <>
      <p id={helpId} className="sr-only">Use arrow keys to inspect hours and days. Home and End move to the first and last hour. Tab leaves the chart.</p>
      <div className="ins-heat" role="group" aria-describedby={helpId} aria-label={label}>
        {rows.map((row, r) => (
          <div key={row.key} className="ins-heat-row">
            <span className="ins-heat-day">{row.label}</span>
            {(counts[r] ?? []).map((runsInHour, hour) => (
              <button key={hour} type="button" className="ins-heat-cell" title={cellLabel(r, hour)} aria-label={cellLabel(r, hour)}
                ref={node => { cells.current[r * 24 + hour] = node; }} tabIndex={activeCell === r * 24 + hour ? 0 : -1}
                // A real pointer move, not mouseenter: a page that scrolls under a resting pointer fires a boundary
                // mouseenter with no move, which would replace the value just tapped or chosen by keyboard.
                onMouseMove={() => {
                  if (last.current?.[0] === r && last.current[1] === hour) return;
                  last.current = [r, hour];
                  onInspect([r, hour]);
                }}
                onFocus={() => inspect(r, hour)} onClick={() => inspect(r, hour)}
                onKeyDown={event => move(event, r, hour)}
                style={{ background: runsInHour ? `color-mix(in oklch, var(--ds-chart-2) ${Math.round(15 + 85 * (runsInHour / Math.max(1, max)))}%, transparent)` : undefined }} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** OMN-23330 AC37: the chart, with its "Show as table" toggle over the same rows and values. */
export function HourHeatmap(props: Parameters<typeof HourHeatmapPlot>[0]) {
  const hours = Array.from({ length: 24 }, (_, hour) => `${hour}:00`);
  return <ChartTable label={props.label} shape="heatmap" columns={['Day', ...hours]} rows={props.rows.map((row, index) => [row.label, ...(props.counts[index] ?? [])])}>
    <HourHeatmapPlot {...props} />
  </ChartTable>;
}
