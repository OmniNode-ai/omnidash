/**
 * OMN-22168 AC3: the frame every page chart sits in, and the states every chart shares: the readout (the chart's
 * tooltip, in words, for pointer and keyboard alike), the empty state and the not-recorded state. Moved from
 * src/pages/local/insight-charts.tsx; the markup is unchanged.
 */
import { createContext, useContext, useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import {
  CalendarDays, ChartBar, ChartBarStacked, ChartColumn, ChartColumnStacked, ChartLine, ChartScatter, ChartSpline, Grid3x3, Percent,
  TableProperties, type LucideIcon,
} from '@/theme/design-system/icons';
import { ColumnTip } from '../components/Tooltip';
import { fixed, formatFullCount, formatShare, formatShortDay, formatUsd } from '@/theme/format';
import { isTodayInProgress } from './DayAxis';
import './chart-scroll.css';

/** One cell of a chart's table: a served number, the chart's own text, or null (not recorded). */
export type ChartTableCell = string | number | null;

/** The kind of plot a chart draws: the Chart button wears its glyph (operator 2026-11-11: "chart icons based on chart
 * type should change"). */
export type ChartShape = 'line' | 'lines' | 'columns' | 'stacked-columns' | 'bars' | 'stacked-bar' | 'heatmap' | 'scatter';
const SHAPE_ICONS: Readonly<Record<ChartShape, LucideIcon>> = {
  line: ChartLine, lines: ChartSpline, columns: ChartColumn, 'stacked-columns': ChartColumnStacked, bars: ChartBar,
  'stacked-bar': ChartBarStacked, heatmap: Grid3x3, scatter: ChartScatter,
};

/** How a chart-table column is written: a day, money, a share, or a count (a served number, or the chart's own text). */
type ColumnKind = 'day' | 'money' | 'share' | 'count';
interface TableColumn { label: string; tone: string | null; kind: ColumnKind }

/* A column's field, read from its name in order (the first rule that matches wins): the same tones the Runs table and
   the headline cards wear (src/styles/field-identity.css), so one concept has one colour and one icon on every page. */
const COLUMN_FIELDS: ReadonlyArray<readonly [RegExp, string | null, ColumnKind]> = [
  [/^run$/, 'identity', 'count'],
  [/^route$/, 'routing', 'count'],
  [/^timing$/, 'timing', 'count'],
  [/^status$/, 'run-outcome', 'count'],
  [/^score$/, 'score', 'count'],
  [/tokens?[-\s]?in\b|input/, 'tokens-in', 'count'],
  [/tokens?[-\s]?out\b|output/, 'tokens-out', 'count'],
  [/token/, 'tokens', 'count'],
  [/pass[-\s]?rate|quality/, 'pass', 'share'],
  [/share|rate\b/, 'share', 'share'],
  [/^pass(ed)?$/, 'pass', 'count'],
  [/^fail(ed|ures?)?$/, 'fail', 'count'],
  [/spend|cost/, 'cost', 'money'],
  [/sav(ed|ing)/, 'savings', 'money'],
  [/baseline/, 'baseline', 'money'],
  [/duration|latency/, 'duration', 'count'],
  [/amount|usd/, 'cost', 'money'],
  [/delegations?/, 'delegations', 'count'],
  [/\bruns?\b|calls/, 'calls', 'count'],
  [/^model$/, 'model', 'count'],
  [/^tier$/, 'tier', 'count'],
];

/** A served series key ("tokens-in") is written as its label ("Tokens in"); a label the chart names stays as named. */
function columnLabel(name: string): string {
  if (!/^[a-z][a-z0-9]*([-_][a-z0-9]+)*$/.test(name)) return name;
  const words = name.replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* Series keys that name a field only within their chart: Tokens per day draws "in" and "out". */
const KEY_ALIASES: Readonly<Record<string, string>> = { in: 'tokens-in', out: 'tokens-out' };

/** A column's label, field and kind; a column the chart left unnamed takes the chart's own name. */
function tableColumn(given: string, index: number, chartLabel = ''): TableColumn {
  const trimmed = given.trim();
  const name = trimmed === '' ? chartLabel : KEY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
  const key = name.toLowerCase();
  if (index === 0 && key === 'day') return { label: 'Day', tone: null, kind: 'day' };
  const field = COLUMN_FIELDS.find(([pattern]) => pattern.test(key));
  return { label: columnLabel(name), tone: field?.[1] ?? null, kind: field?.[2] ?? 'count' };
}

/** A cell written as the pages write that kind of value; a cell the chart already wrote as text stays as written. */
function cellText(cell: ChartTableCell, column: TableColumn): string {
  if (cell === null) return 'Not recorded';
  if (typeof cell === 'string') return column.kind === 'day' ? formatShortDay(cell) : cell;
  if (column.kind === 'money') return formatUsd(cell);
  if (column.kind === 'share') return formatShare(cell);
  return Number.isInteger(cell) ? formatFullCount(String(cell)) : fixed(cell, 2);
}

/* What each column holds, said the way the Runs table's header tooltips say it (src/pages/local/page-runs.tsx
   RUN_COLUMN_TIPS); every header has one (operator review 2026-11-11). */
const NOT_RECORDED = ' "Not recorded" means no value was served for that row.';
const FIELD_TIPS: Readonly<Record<string, string>> = {
  calls: 'How many runs were recorded.',
  identity: 'The run\'s id, its first 8 characters as the Runs table shows it.',
  routing: 'The route the runs were sent along: their cost tier.',
  timing: 'One of this run\'s recorded timings, each as served; they are not added together.',
  'run-outcome': 'Whether the run passed or failed its quality gate.',
  score: 'The quality gate\'s score, from 0 to 1, to two decimals.',
  'tokens-in': 'Tokens sent to the model, as recorded for the runs.',
  'tokens-out': 'Tokens the model returned, as recorded for the runs.',
  tokens: 'Tokens processed, sent and returned, as recorded for the runs.',
  cost: 'What the runs cost, in US dollars. A free local run costs $0.',
  savings: 'Modelled saving: what the runs\' tokens would cost at the baseline model\'s prices, less what they cost. The baseline never ran.',
  baseline: 'What the runs would have cost on the baseline model. The baseline never ran.',
  fail: 'Runs that failed their quality gate.',
  duration: 'How long runs took, end to end.',
  model: 'The model that answered.',
  tier: 'The cost tier the runs were routed to.',
};

function columnTip(column: TableColumn, index: number): string {
  if (column.kind === 'day') return 'The UTC day. Today\'s row counts only what has been recorded so far.';
  if (column.tone === 'pass') return column.kind === 'share'
    ? `The share of runs that passed their quality gate, to one decimal.${NOT_RECORDED}`
    : `Runs that passed their quality gate.${NOT_RECORDED}`;
  const known = column.tone ? FIELD_TIPS[column.tone] : undefined;
  if (known) return index === 0 ? known : `${known}${NOT_RECORDED}`;
  if (column.kind === 'share') return `${column.label}, as a share of the whole, to one decimal.${NOT_RECORDED}`;
  return index === 0 ? `${column.label}: the row the values beside it belong to.` : `${column.label}, as the chart draws it.${NOT_RECORDED}`;
}

/** A row-naming first column (a model, a tier) gets two shares of the table's width; a day and every value column one. */
function columnWeight(column: TableColumn, index: number): number {
  return index === 0 && column.kind !== 'day' ? 2 : 1;
}

/** A cell's tone: its column's, except a run's status, which wears the pass or fail colour of what it says, as the Runs
 * table's status pills do (live 2026-11-11: "passed" and "failed" were one teal). */
function cellTone(cell: ChartTableCell, column: TableColumn): string | null {
  if (column.tone === 'run-outcome' && typeof cell === 'string') {
    if (/^pass/i.test(cell)) return 'pass';
    if (/^fail/i.test(cell)) return 'fail';
  }
  return column.tone;
}

function ColumnIcon({ column }: { column: TableColumn }) {
  if (column.kind === 'day') return <CalendarDays className="ds-chart-table-icon" size={13} aria-hidden="true" focusable="false" />;
  if (column.tone && column.tone !== 'share') return <ConceptIcon concept={column.tone} size={13} />;
  if (column.kind === 'share') return <Percent className="ds-chart-table-icon" size={13} aria-hidden="true" focusable="false" />;
  return null;
}

/**
 * OMN-23330 AC37 (operator, chat 2026-11-11, from a benchmark of 20 open-source dashboards): every kit chart that draws
 * several values can be read as a table of the same rows and values: a keyboard-reachable switch swaps the plot for the
 * table and back, and the choice holds for that chart for the session. Operator review of the live page the same day:
 * the table reads like the Runs table (each column with its field's icon and colour, values written as the pages write
 * them) and the switch is two buttons, Chart and Table, each in its own colour.
 */
export function ChartTable({ label, shape, columns, rows, rowColors, rowInkColumns = [], children }: {
  label: string;
  shape: ChartShape;
  columns: readonly string[];
  rows: ReadonlyArray<readonly ChartTableCell[]>;
  /** Each row's own colour when the row is a named thing its bar draws in that colour (a tier, a model). */
  rowColors?: ReadonlyArray<string | null | undefined>;
  /** The value columns (by index) that wear each row's colour too, e.g. a model's share or an amount's own value. */
  rowInkColumns?: readonly number[];
  children: ReactNode;
}) {
  // Operator 2026-11-11 ("default tab selected chart"): every chart opens on its chart; the choice holds while it stays
  // on the page and is not remembered beyond it (this replaces AC37's "the choice holds for the session").
  const [asTable, setAsTable] = useState(false);
  const choose = (table: boolean) => setAsTable(table);
  // A chart that draws nothing has nothing to tabulate: it is drawn as before, with no switch.
  if (rows.length === 0) return <>{children}</>;
  const ShapeIcon = SHAPE_ICONS[shape];
  const layout = columns.map((column, index) => tableColumn(column, index, label));
  const totalWeight = layout.reduce((sum, column, at) => sum + columnWeight(column, at), 0);
  // The switch follows the plot in the page (keyboard order: the chart's own controls, then the switch) and is shown
  // above it by the stylesheet.
  return <div className="ds-chart-table-frame" data-as-table={asTable ? 'true' : 'false'}>
    {asTable
      ? <div className="ds-chart-table-wrap"><table className="ds-chart-table" aria-label={`${label} as a table`}>
          {/* Columns share the width by weight (a name column 2, every other 1), so no one column takes all the spare
              width; a column whose content is wider grows, and a long name wraps onto a taller row. */}
          <colgroup>{layout.map((column, at) => <col key={at} style={{ width: `${Math.round((columnWeight(column, at) / totalWeight) * 1000) / 10}%` }} />)}</colgroup>
          <thead><tr>{layout.map((column, at) => <th key={`${columns[at]}-${at}`} scope="col" data-field-tone={column.tone ?? undefined}>
            {/* The kit's column tooltip, the one every table's headers use (operator 2026-11-11: "one design system"). */}
            <ColumnTip tone={column.tone ?? ''} tip={columnTip(column, at)}>
              <span className="ds-chart-table-head" tabIndex={0}><ColumnIcon column={column} />{column.label}</span></ColumnTip></th>)}</tr></thead>
          <tbody>{rows.map((row, index) => {
            // A named row (a tier, a model) wears the colour its bar wears on its name (with a swatch) and its share value.
            const rowInk = rowColors?.[index] ?? null;
            const rowStyle = rowInk ? { '--row-ink': rowInk } as CSSProperties : undefined;
            return <tr key={index}>{row.map((cell, at) => {
              const column = layout[at] ?? tableColumn('', at, label);
              if (at === 0) return <th key={at} scope="row" data-field-tone={rowInk ? undefined : column.tone ?? undefined} data-row-color={rowInk ? 'true' : undefined} style={rowStyle}>
                {rowInk && <span className="ds-chart-table-swatch" aria-hidden="true" />}{cellText(cell, column)}</th>;
              // A share value of a named row wears that row's colour (operator 2026-11-11: "this should use models colors");
              // its header keeps the one share colour.
              const byRow = rowInk !== null && rowInkColumns.includes(at);
              return <td key={at} data-field-tone={cellTone(cell, column) ?? undefined} data-row-color={byRow ? 'true' : undefined} style={byRow ? rowStyle : undefined}
                data-field-unavailable={cell === null ? 'true' : 'false'}>{cellText(cell, column)}</td>;
            })}</tr>;
          })}</tbody>
        </table></div>
      : children}
    {/* The group's name stays generic: a chart's own name belongs to the chart (C11 finds the heatmap by it); each button
        still names its chart. */}
    <div className="ds-chart-views" role="group" aria-label="Chart or table">
      <button type="button" className="ds-chart-view" data-view="chart" aria-pressed={!asTable} aria-label={`Show as chart: ${label}`}
        onClick={() => choose(false)}><ShapeIcon size={13} aria-hidden="true" focusable="false" />Chart</button>
      <button type="button" className="ds-chart-view" data-view="table" aria-pressed={asTable} aria-label={`Show as table: ${label}`}
        onClick={() => choose(true)}><TableProperties size={13} aria-hidden="true" focusable="false" />Table</button>
    </div>
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
