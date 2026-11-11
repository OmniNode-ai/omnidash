/**
 * OMN-22168 AC3: the frame every page chart sits in, and the states every chart shares: the readout (the chart's
 * tooltip, in words, for pointer and keyboard alike), the empty state and the not-recorded state. Moved from
 * src/pages/local/insight-charts.tsx; the markup is unchanged.
 */
import { createContext, useContext, useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { fixed, formatFullCount } from '@/theme/format';
import { isTodayInProgress } from './DayAxis';
import './chart-scroll.css';

/** One cell of a chart's table: a served number, the chart's own text, or null (not recorded). */
export type ChartTableCell = string | number | null;

/**
 * OMN-23330 AC37 (operator, chat 2026-11-11, from a benchmark of 20 open-source dashboards): every kit chart that draws
 * several values can be read as a table of the same rows and values: a keyboard-reachable toggle swaps the plot for the
 * table and back, and the choice holds for that chart for the session.
 */
export function ChartTable({ label, columns, rows, children }: {
  label: string;
  columns: readonly string[];
  rows: ReadonlyArray<readonly ChartTableCell[]>;
  children: ReactNode;
}) {
  const key = `omnidash.chart-table:${label}`;
  const [asTable, setAsTable] = useState(() => { try { return sessionStorage.getItem(key) === 'table'; } catch { return false; } });
  const toggle = () => setAsTable(current => {
    const next = !current;
    try { sessionStorage.setItem(key, next ? 'table' : 'chart'); } catch { /* storage refused: the choice holds for this render only */ }
    return next;
  });
  const text = (cell: ChartTableCell) => (cell === null ? 'Not recorded' : typeof cell === 'number'
    ? (Number.isInteger(cell) ? formatFullCount(String(cell)) : fixed(cell, 4)) : cell);
  // A chart that draws nothing has nothing to tabulate: it is drawn as before, with no toggle.
  if (rows.length === 0) return <>{children}</>;
  // The toggle follows the plot in the page (keyboard order: the chart's own controls, then the toggle) and is shown
  // above it by the stylesheet.
  return <div className="ds-chart-table-frame" data-as-table={asTable ? 'true' : 'false'}>
    {asTable
      ? <div className="ds-chart-table-wrap"><table className="ds-chart-table" aria-label={`${label} as a table`}>
          <thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, at) => (at === 0
            ? <th key={at} scope="row">{text(cell)}</th> : <td key={at}>{text(cell)}</td>))}</tr>)}</tbody>
        </table></div>
      : children}
    <button type="button" className="ds-chart-table-toggle" aria-pressed={asTable} aria-label={`${asTable ? 'Show as chart' : 'Show as table'}: ${label}`}
      onClick={toggle}>{asTable ? 'Show as chart' : 'Show as table'}</button>
  </div>;
}

/** True inside a panel whose own heading already names the chart: the chart's title then only labels the figure. */
export const NamedByPanel = createContext(false);

/** One chart: a figure named by its title, the concept's icon beside it, an optional note, then the plot. */
export function ChartCard({ title, concept, note, delay, children }: {
  title: string; concept: string; note?: string; delay: number; children: ReactNode;
}) {
  const id = useId();
  const named = useContext(NamedByPanel);
  return (
    <figure className="local-chart ins-card od-card" aria-labelledby={id} style={{ '--ins-accent': `var(--ds-field-${concept})`, animationDelay: `${delay}ms` } as CSSProperties}>
      <div className="ins-card-head">
        <h3 id={id} className="ins-title" hidden={named}><span className="ins-badge" aria-hidden="true"><ConceptIcon concept={concept} label={title} size={16} /></span>{title}</h3>
        {note && <span className="ins-note">{note}</span>}
      </div>
      {children}
    </figure>
  );
}

/** A chart's words for the mark pointed at; empty at rest (part 15 AC96), keeping its line so the chart does not move. */
export function ChartReadout({ testId, text, active, day }: { testId?: string; text: ReactNode; active: boolean; day?: string | null }) {
  if (text === null) return null;
  // OMN-23330 AC35: a readout showing today's UTC day, still in progress, says so first, hovered or by default (AC8).
  const today = day ? isTodayInProgress(day) : false;
  return <p className={`ins-readout${active ? ' ins-readout--active' : ''}`} data-testid={testId} data-in-progress={today ? 'true' : undefined} aria-live="polite">{today ? <>Today so far · {text}</> : text}</p>;
}

/** Nothing to draw, said in words. Inside a panel (`status`) it is announced as the panel's state. */
export function ChartEmpty({ status = false, children }: { status?: boolean; children: ReactNode }) {
  return status ? <p className="local-dashboard-empty" role="status">{children}</p> : <p className="ins-empty">{children}</p>;
}

/** What a chart could not draw because it was not served or not measured; never drawn as 0. */
export function ChartNotRecorded({ children, ...rest }: HTMLAttributes<HTMLParagraphElement> & { [data: `data-${string}`]: unknown }) {
  return <p className="local-dashboard-caption" {...rest}>{children}</p>;
}

/**
 * A chart's title row inside a panel (part 18 AC124): its icon, then a neutral title; a detail line only when it says
 * what the chart counts. No icon badge and no decorative icon. (ChartCard is the Overview card; this is the in-panel row.)
 */
export function ChartHeading({ title, detail, concept }: { title: string; detail?: string; concept: string }) {
  return <div className="local-chart-heading"><ConceptIcon concept={concept} label={title} size={16} />
    <div><h3>{title}</h3>{detail && <p>{detail}</p>}</div></div>;
}
