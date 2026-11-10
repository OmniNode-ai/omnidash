import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { passBand, tierLabel } from '@/pages/local/plain-text';
import { formatDashboardCount, formatFullCount } from '@/lib/format';

// OMN-20006: tokens in, tokens out and measured cost per model per UTC day, from usage-by-model-day.v1.
//
// One renderer serves the local Usage page and the dashboard palette, and this module is the declared reader of
// `onex.snapshot.projection.usage-by-model-day.v1` in the component registry: the omnibase_infra
// exposure-reader-coverage gate (OMN-17199) resolves readers from there, so the projection's `consumers: none`
// opt-out could be deleted rather than left standing over a live reader.
//
// Every figure is the served value (the dashboard renders projections and computes nothing):
//   * cost is `measured_cost_usd`, the cost of the calls whose cost was measured. `cost_usd` also sums estimated
//     and unknown costs, so it is never shown here. A null measured cost is "Not measured", never 0;
//   * the runs whose cost was not measured are counted beside it from `unmeasured_call_count`;
//   * rows are not filtered by tenant: the exposure declares `tenant_column`, so the server answers the reading
//     tenant's rows only;
//   * OMN-21015 AC4: each row's tier is the served `cost_tier_name` (one model under two tiers is two rows), and its
//     share of calls is the served `call_share`, the row's calls over its tenant's calls that UTC day, formatted as a
//     percentage. A row with no served share says so; no share is worked out here from the call counts.
import { useId, useState, type CSSProperties } from 'react';
import { Bot, CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from '@/theme/design-system/icons';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionSnapshotQuery } from '@/hooks/useProjectionSnapshotQuery';
import { TOPICS } from '@shared/types/topics';

/** Row shape of onex.snapshot.projection.usage-by-model-day.v1, as the contract's projection_api.columns declare. */
export interface UsageByModelDayRow {
  tenant_id?: string;
  usage_day?: string;
  model_id?: string | null;
  cost_tier_name?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd?: number | string | null;
  measured_cost_usd?: number | string | null;
  unmeasured_call_count?: number | null;
  call_count?: number | null;
  call_share?: number | string | null;
  updated_at?: string;
}

import { formatDashboardUsd as formatUsd, formatShortDay } from '@/lib/format';
import { TierLegend, useModelColor } from '@/components/dashboard/model-tiers';
import { ColumnTip, DataTable, Dropdown, EmptyState, TokenCount } from '@/theme/design-system/components';
import { ChartReadout } from '@/theme/design-system/charts/frame';
import { localeDate as fmtLocaleDate, localeString as fmtLocaleString } from '@/lib/format';
import { refreshInterval } from '@/lib/refresh';

export const NO_USAGE_ROWS = 'No usage rows yet';
/** The series' own empty text, so a page that mounts the table and the series does not say one sentence twice. */
export const NO_TOKEN_ROWS = 'No daily token data available yet.';

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function recorded(value: unknown): string {
  return isMissing(value) ? 'Not recorded' : String(value);
}

/** A placeholder or empty model is not a model: render it as unknown. */
function model(value: unknown): string {
  return isMissing(value) || value === 'unknown' ? 'Unknown model' : String(value);
}

function measuredCost(value: unknown): string {
  return isMissing(value) ? 'Not measured' : formatUsd(value);
}

function unmeasured(value: unknown): string {
  if (isMissing(value)) return 'Not recorded';
  return Number(value) === 0 ? 'none' : `${formatDashboardCount(value)} unmeasured`;
}

/** OMN-21015: the served tier; a call that named none is served as not_tier_routed, which is not a tier. */
function tier(value: unknown): string {
  if (isMissing(value)) return 'Not recorded';
  return tierLabel(value);
}

/** OMN-21015: the served share of the day's calls (a fraction), shown as a percentage to two decimals at most. */
/** The table's columns: the concept each header's glyph and colour come from, and its label. */
const SHORT_HEADERS: Record<string, readonly [string, string]> = { 'Cost (measured)': ['Cost', ' (measured)'], 'Share of calls': ['Share', ' of calls'] };
/** Each column's explanation on hover and keyboard focus, as the run table's (Lakshman 2026-11-05). */
const USAGE_TIPS: Record<string, string> = {
  Day: 'The UTC day. It is written on the first row of its day.',
  Model: 'The model that answered the calls.',
  'Tokens in': 'Tokens sent to the model that day, in this tier.',
  'Tokens out': 'Tokens the model returned that day, in this tier.',
  'Cost (measured)': 'The measured cost of the calls. A grey $0 is a free call.',
  Unmeasured: 'Calls whose cost was not recorded. A dash means none.',
  Tier: 'The cost tier the calls were routed to.',
  Calls: 'Calls to the model that day, in this tier.',
  'Share of calls': 'This row\'s calls out of all calls that UTC day.',
};
const USAGE_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['usage-day', 'Day'], ['model', 'Model'], ['tokens-in', 'Tokens in'], ['tokens-out', 'Tokens out'], ['cost', 'Cost (measured)'],
  ['unavailable', 'Unmeasured'], ['tier', 'Tier'], ['calls', 'Calls'], ['routing', 'Share of calls'],
];

/** A served day in the short form ("Nov 10"); a missing day reads as the column's other missing values do. */
function shortDay(value: unknown): string {
  return isMissing(value) ? recorded(value) : formatShortDay(String(value));
}

function callShare(value: unknown): string {
  const share = Number(value);
  if (isMissing(value) || !Number.isFinite(share)) return 'Not recorded';
  return fmtLocaleString(share, 'en-US', { style: 'percent', maximumFractionDigits: 2 });
}

function asRows(rows: readonly unknown[]): UsageByModelDayRow[] {
  return rows.filter((row): row is UsageByModelDayRow => typeof row === 'object' && row !== null);
}

/** US-1, US-2, US-4: one row per served day and model, in the order the exposure serves them. */
export function UsageByModelDayTable({ rows, interactive = false }: { rows: readonly unknown[]; interactive?: boolean }) {
  const id = useId();
  const modelColor = useModelColor();
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [page, setPage] = useState(0);
  const usage = asRows(rows);
  const models = [...new Set(usage.map(row => model(row.model_id)))];
  const days = [...new Set(usage.map(row => recorded(row.usage_day)))];
  const activeModel = models.includes(selectedModel) ? selectedModel : '';
  const activeDay = days.includes(selectedDay) ? selectedDay : '';
  const filtered = interactive ? usage.filter(row => (!activeModel || model(row.model_id) === activeModel) && (!activeDay || recorded(row.usage_day) === activeDay)) : usage;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  const shown = interactive ? filtered.slice(currentPage * 25, (currentPage + 1) * 25) : filtered;
  if (usage.length === 0) {
    return <EmptyState>{NO_USAGE_ROWS}</EmptyState>;
  }
  return (
    <div className={interactive ? 'usage-records' : undefined}>
      {interactive && <div className="usage-record-controls local-dashboard-filters" role="group" aria-label="Filter usage records">
        <span className="usage-record-controls-title"><ConceptIcon concept="recorded-rows" label="Recorded rows" size={15} />Recorded rows</span>
        {/* The Runs toolbar's filters (Lakshman 2026-11-05, "modern like runs"): the kit Dropdown, its glyph and colour inside
            the pill, each model option with its swatch. */}
        <div className="local-filter-field">
          <Dropdown id={`${id}-model`} label="Usage model" value={activeModel} icon={<Bot size={15} />} tone="var(--ds-field-model)"
            onChange={value => { setSelectedModel(value); setPage(0); }}
            options={[{ value: '', label: 'All models' }, ...models.map(name => ({ value: name, label: name, tone: modelColor(name) }))]} />
        </div>
        <div className="local-filter-field">
          <Dropdown id={`${id}-day`} label="UTC day" value={activeDay} icon={<CalendarDays size={15} />} tone="var(--ds-field-usage-day)"
            onChange={value => { setSelectedDay(value); setPage(0); }}
            options={[{ value: '', label: 'All days' }, ...days.map(day => ({ value: day, label: day }))]} />
        </div>
        {(activeModel || activeDay) && <button type="button" onClick={() => { setSelectedModel(''); setSelectedDay(''); setPage(0); }}><RotateCcw size={14} aria-hidden="true" />Clear usage filters</button>}
      </div>}
    <DataTable aria-label="Usage by model and day">
        <thead>
          <tr>
            {/* Headers as the run table writes them (Lakshman 2026-11-05, "make all pages like overview and runs"). */}
            {/* One header line each (Lakshman 2026-11-05, "make it modern like runs"): a long label shows its first words and
                keeps the rest for assistive tech and in its title, as Runs per day does. */}
            {USAGE_HEADERS.map(([concept, label]) => {
              const [shown, rest] = SHORT_HEADERS[label] ?? [label, ''];
              return <th key={label}><ColumnTip tone={concept} tip={USAGE_TIPS[label] ?? label}><span className="local-table-head" data-field-tone={concept} tabIndex={0}>
                <ConceptIcon concept={concept} label={label} size={13} />{shown}{rest && <span className="local-visually-hidden">{rest}</span>}</span></ColumnTip></th>;
            })}
          </tr>
        </thead>
        {/* As the run table writes its rows (Lakshman 2026-11-05): a day is named on the first row of its group only (the
            rest keep it for assistive tech and filters), a measured zero cost is a muted "$0" with the served text as its
            title, and no unmeasured calls is a quiet dash. */}
        <tbody>{shown.map((row, index) => (
          <tr key={`${String(row.usage_day)}-${String(row.model_id)}-${String(row.cost_tier_name)}-${index}`}
            data-day-start={index === 0 || shown[index - 1]!.usage_day !== row.usage_day ? '' : undefined}>
            {/* OMN-23330 AC10: the day in the short form the other pages use; the served day stays as the title. */}
            <td data-label="Day" title={isMissing(row.usage_day) ? undefined : String(row.usage_day)}>{index === 0 || shown[index - 1]!.usage_day !== row.usage_day
              ? shortDay(row.usage_day) : <span className="local-visually-hidden">{shortDay(row.usage_day)}</span>}</td>
            {/* The model's swatch beside its name, as Usage analysis and the decision matrix draw a model (Lakshman 2026-11-05). */}
            <td data-label="Model"><span className="usage-model-name">{!isMissing(row.model_id) && <span className="gdb-swatch" aria-hidden="true"
              data-model-id={model(row.model_id)} style={{ background: modelColor(model(row.model_id)) }} />}{model(row.model_id)}</span></td>
            <td data-label="Tokens in" data-field-tone="tokens-in" data-field-unavailable={isMissing(row.input_tokens)}>{isMissing(row.input_tokens) ? recorded(row.input_tokens) : <TokenCount value={row.input_tokens} direction="in" />}</td>
            <td data-label="Tokens out" data-field-tone="tokens-out" data-field-unavailable={isMissing(row.output_tokens)}>{isMissing(row.output_tokens) ? recorded(row.output_tokens) : <TokenCount value={row.output_tokens} direction="out" />}</td>
            <td data-label="Cost (measured)">{!isMissing(row.measured_cost_usd) && Number(row.measured_cost_usd) === 0
              ? <span className="local-cost-free" title={measuredCost(row.measured_cost_usd)}>{measuredCost(row.measured_cost_usd).replace(/\.0+$/, '')}</span>
              : measuredCost(row.measured_cost_usd)}</td>
            <td data-label="Unmeasured">{unmeasured(row.unmeasured_call_count) === 'none'
              ? <span className="local-run-quiet" title="No unmeasured calls">—</span> : unmeasured(row.unmeasured_call_count)}</td>
            <td data-label="Tier">{tier(row.cost_tier_name)}</td>
            <td data-label="Calls">{isMissing(row.call_count) ? 'Not recorded' : formatDashboardCount(row.call_count)}</td>
            <td data-label="Share of calls"><span className="local-share-cell">{!isMissing(row.call_share) && Number.isFinite(Number(row.call_share))
              && <span className="local-share-meter" aria-hidden="true" data-identity-decoration="share-bar"><i
                data-share-band={passBand(Math.min(Math.max(Number(row.call_share), 0), 1) * 100, 100)}
                style={{ width: `${Math.min(Math.max(Number(row.call_share), 0), 1) * 100}%` }} /></span>}{callShare(row.call_share)}</span></td>
          </tr>
        ))}</tbody>
    </DataTable>
      {interactive && <div className="usage-record-pagination local-dashboard-pager">
        <span role="status">{filtered.length ? `Showing ${currentPage * 25 + 1}–${Math.min((currentPage + 1) * 25, filtered.length)} of ${formatDashboardCount(filtered.length)} records` : 'No records match these filters'}</span>
        {filtered.length > 25 && <div><button type="button" aria-label="Previous usage records" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
          <button type="button" aria-label="Next usage records" disabled={(currentPage + 1) * 25 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={16} aria-hidden="true" /></button></div>}
      </div>}
    </div>
  );
}

/** The palette widget: the same table over the served exposure. */
export default function UsageByModelDayWidget() {
  const query = useProjectionSnapshotQuery<UsageByModelDayRow>({
    queryKey: ['usage-by-model-day-widget', TOPICS.usageByModelDay],
    topic: TOPICS.usageByModelDay,
    refetchInterval: refreshInterval(),
  });
  const rows = query.data?.rows ?? [];
  return (
    <ComponentWrapper
      title="Usage by model and day"
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={rows.length === 0}
      emptyMessage="No usage rows yet"
      emptyHint="Rows appear once llm-call-completed events reach node_projection_usage_by_model_day."
    >
      <UsageByModelDayTable rows={rows} />
    </ComponentWrapper>
  );
}

/**
 * OMN-21166 Maple grid: tokens per UTC day as one vertical stacked chart, days across, one colour per model, with a
 * switch between tokens in and tokens out. Each segment is a served count (rows of one model under two tiers add up);
 * a count that is not served draws no segment, adds nothing to the scale and is named in the day's label.
 */
export function UsageTokensChart({ rows, days = 14 }: { rows: readonly unknown[]; days?: number }) {
  const modelColor = useModelColor();
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  // As Overview's day charts do (Lakshman 2026-11-05, "modern and unified like overview and Runs"): the day pointed at or
  // focused is read out above the plot, and the other days dim.
  const [hover, setHover] = useState<string | null>(null);
  const usage = asRows(rows);
  const field = direction === 'in' ? 'input_tokens' : 'output_tokens';
  const byDay = new Map<string, Map<string, { value: number; missing: boolean }>>();
  for (const entry of usage) {
    if (isMissing(entry.usage_day)) continue;
    const day = String(entry.usage_day);
    const name = model(entry.model_id);
    const models = byDay.get(day) ?? new Map<string, { value: number; missing: boolean }>();
    const cell = models.get(name) ?? { value: 0, missing: false };
    const served = entry[field];
    if (typeof served === 'number' && Number.isFinite(served)) cell.value += served;
    else cell.missing = true;
    models.set(name, cell);
    byDay.set(day, models);
  }
  const shown = [...byDay.keys()].sort().slice(-days);
  const names = [...new Set(shown.flatMap(day => [...byDay.get(day)!.keys()]))];
  const total = (day: string) => [...byDay.get(day)!.values()].reduce((sum, cell) => sum + cell.value, 0);
  const max = Math.max(0, ...shown.map(total));
  if (shown.length === 0) return <EmptyState>{NO_TOKEN_ROWS}</EmptyState>;
  const short = (day: string) => fmtLocaleDate(new Date(`${day}T00:00:00Z`), 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <figure className="utc-chart" aria-label={`Tokens ${direction} per day by model`}>
      <div className="utc-tools">
        {/* Lakshman 2026-11-05 ("modern tab"): a pill switch whose thumb slides to the chosen direction, tinted in that
            direction's field colour (the cards' and the readout's), each option with its card's arrow. */}
        <div className="utc-switch utc-direction" role="group" aria-label="Direction" data-direction={direction}>
          <span className="utc-direction-thumb" aria-hidden="true" />
          <button type="button" aria-pressed={direction === 'in'} onClick={() => setDirection('in')}>
            <ConceptIcon concept="tokens-in" label="Tokens in" size={14} />Tokens in</button>
          <button type="button" aria-pressed={direction === 'out'} onClick={() => setDirection('out')}>
            <ConceptIcon concept="tokens-out" label="Tokens out" size={14} />Tokens out</button>
        </div>
      </div>
      {(() => {
        const day = hover === null ? undefined : byDay.get(hover);
        if (hover === null || day === undefined) return <ChartReadout active={false} text="" />;
        const models = [...day.entries()];
        const allMissing = models.length > 0 && models.every(([, cell]) => cell.missing && cell.value === 0);
        return <ChartReadout active text={<>{short(hover)}<span className="ins-readout-sep">{' · '}</span>
          <span data-field-tone={`tokens-${direction}`}>{allMissing ? `tokens ${direction} not recorded`
            : `${formatFullCount(total(hover))} tokens ${direction}${models.some(([, cell]) => cell.missing) ? ' (partial)' : ''}`}</span>
          {models.map(([name, cell]) => <span key={name}><span className="ins-readout-sep">{' · '}</span>
            <i className="utc-readout-swatch" aria-hidden="true" style={{ background: modelColor(name) }} />
            {`${name} ${cell.missing && cell.value === 0 ? 'not recorded' : formatFullCount(cell.value)}`}</span>)}</>} />;
      })()}
      <ol className="utc-plot" style={{ '--utc-count': shown.length } as CSSProperties} onMouseLeave={() => setHover(null)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null); }}>
        {shown.map(day => {
          const models = [...byDay.get(day)!.entries()];
          const label = `${day}: ${models.map(([name, cell]) => `${name}: ${cell.missing && cell.value === 0 ? 'not recorded' : `${formatFullCount(cell.value)}${cell.missing ? ' (some rows not recorded)' : ''}`}`).join('; ')}`;
          const dayTotal = total(day);
          return (
            // Focusable, so a keyboard reader reveals the day's total as a pointer does on hover (live review 2026-10-26).
            <li key={day} data-token-day={day} aria-label={label} tabIndex={0} data-dim={hover !== null && hover !== day}
              onMouseEnter={() => setHover(day)} onFocus={() => setHover(day)}>
              {/* A day whose every count is not recorded has no total; a day with some not recorded totals only the rest. */}
              <span className="utc-value">{models.length > 0 && models.every(([, cell]) => cell.missing && cell.value === 0) ? 'Not recorded'
                : `${formatDashboardCount(dayTotal)}${models.some(([, cell]) => cell.missing) ? ' (partial)' : ''}`}</span>
              <span className="utc-track">
                <span className="utc-stack" style={{ height: `${max > 0 ? Math.round((dayTotal / max) * 1000) / 10 : 0}%` }}>
                  {models.filter(([, cell]) => cell.value > 0).map(([name, cell]) => (
                    <i key={name} data-token-model={name} style={{ flex: cell.value, color: modelColor(name), borderTop: `2px solid ${modelColor(name)}` }} />
                  ))}
                </span>
              </span>
              {models.some(([, cell]) => cell.missing) && <span className="utc-missing" data-token-missing aria-hidden="true">n/r</span>}
              <span className="utc-day">{short(day)}</span>
            </li>
          );
        })}
      </ol>
      {/* As Overview draws a chart's legend: one row of chips under the chart (Lakshman 2026-11-05). */}
      <div className="utc-legends">
        <ul className="utc-legend ins-token-legend gdb-legend" aria-label="Models">
          {names.map(name => <li key={name}><i aria-hidden="true" style={{ background: modelColor(name) }} />{name}</li>)}
        </ul>
        <TierLegend label="Tokens per day tier colours" models={names} />
      </div>
      <figcaption className="local-dashboard-caption">{`Tokens ${direction} per UTC day, latest ${shown.length} served ${shown.length === 1 ? 'day' : 'days'}; n/r marks a day with a count not recorded.`}</figcaption>
    </figure>
  );
}
