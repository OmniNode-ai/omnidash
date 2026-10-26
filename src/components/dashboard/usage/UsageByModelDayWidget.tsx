import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { tierLabel } from '@/pages/local/plain-text';
import { formatDashboardCount, formatFullCount } from '@/lib/dashboard-count';
import { modelColor } from '@/lib/dashboard-colors';
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
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
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

import { formatDashboardUsd as formatUsd } from '@/lib/dashboard-currency';
export { formatDashboardUsd as formatUsd } from '@/lib/dashboard-currency';

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
function callShare(value: unknown): string {
  const share = Number(value);
  if (isMissing(value) || !Number.isFinite(share)) return 'Not recorded';
  return share.toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 2 });
}

function asRows(rows: readonly unknown[]): UsageByModelDayRow[] {
  return rows.filter((row): row is UsageByModelDayRow => typeof row === 'object' && row !== null);
}

/** US-1, US-2, US-4: one row per served day and model, in the order the exposure serves them. */
export function UsageByModelDayTable({ rows, interactive = false }: { rows: readonly unknown[]; interactive?: boolean }) {
  const id = useId();
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
    return <p className="local-dashboard-empty" role="status">{NO_USAGE_ROWS}</p>;
  }
  return (
    <div className={interactive ? 'usage-records' : undefined}>
      {interactive && <div className="usage-record-controls local-dashboard-filters" role="group" aria-label="Filter usage records">
        <span className="usage-record-controls-title"><ConceptIcon concept="recorded-rows" label="Recorded rows" size={15} />Recorded rows</span>
        <label htmlFor={`${id}-model`}>Model<select id={`${id}-model`} aria-label="Filter usage model" value={activeModel} onChange={event => { setSelectedModel(event.target.value); setPage(0); }}>
          <option value="">All models</option>{models.map(name => <option value={name} key={name}>{name}</option>)}
        </select></label>
        <label htmlFor={`${id}-day`}>UTC day<select id={`${id}-day`} aria-label="Filter usage UTC day" value={activeDay} onChange={event => { setSelectedDay(event.target.value); setPage(0); }}>
          <option value="">All days</option>{days.map(day => <option value={day} key={day}>{day}</option>)}
        </select></label>
        {(activeModel || activeDay) && <button type="button" onClick={() => { setSelectedModel(''); setSelectedDay(''); setPage(0); }}><RotateCcw size={14} aria-hidden="true" />Clear usage filters</button>}
      </div>}
    <div className="local-dashboard-table-wrap">
      <table aria-label="Usage by model and day">
        <thead>
          <tr>
            <th>Day</th><th>Model</th><th>Tokens in</th><th>Tokens out</th><th>Cost (measured)</th><th>Unmeasured</th>
            <th>Tier</th><th>Calls</th><th>Share of calls</th>
          </tr>
        </thead>
        <tbody>{shown.map((row, index) => (
          <tr key={`${String(row.usage_day)}-${String(row.model_id)}-${String(row.cost_tier_name)}-${index}`}>
            <td data-label="Day">{recorded(row.usage_day)}</td>
            <td data-label="Model">{model(row.model_id)}</td>
            <td data-label="Tokens in">{isMissing(row.input_tokens) ? recorded(row.input_tokens) : groupedCount(row.input_tokens)}</td>
            <td data-label="Tokens out">{isMissing(row.output_tokens) ? recorded(row.output_tokens) : groupedCount(row.output_tokens)}</td>
            <td data-label="Cost (measured)">{measuredCost(row.measured_cost_usd)}</td>
            <td data-label="Unmeasured">{unmeasured(row.unmeasured_call_count)}</td>
            <td data-label="Tier">{tier(row.cost_tier_name)}</td>
            <td data-label="Calls">{isMissing(row.call_count) ? 'Not recorded' : formatDashboardCount(row.call_count)}</td>
            <td data-label="Share of calls">{callShare(row.call_share)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
      {interactive && <div className="usage-record-pagination local-dashboard-pager">
        <span role="status">{filtered.length ? `Showing ${currentPage * 25 + 1}–${Math.min((currentPage + 1) * 25, filtered.length)} of ${formatDashboardCount(filtered.length)} records` : 'No records match these filters'}</span>
        {filtered.length > 25 && <div><button type="button" aria-label="Previous usage records" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
          <button type="button" aria-label="Next usage records" disabled={(currentPage + 1) * 25 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={16} aria-hidden="true" /></button></div>}
      </div>}
    </div>
  );
}

/** A served token count, grouped for reading. Formatting only: the number is the one the row carries. */
function groupedCount(value: unknown): string {
  return formatFullCount(value);
}

/** The palette widget: the same table over the served exposure. */
export default function UsageByModelDayWidget() {
  const query = useProjectionSnapshotQuery<UsageByModelDayRow>({
    queryKey: ['usage-by-model-day-widget', TOPICS.usageByModelDay],
    topic: TOPICS.usageByModelDay,
    refetchInterval: 30_000,
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
  const [direction, setDirection] = useState<'in' | 'out'>('in');
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
  if (shown.length === 0) return <p className="local-dashboard-empty" role="status">{NO_TOKEN_ROWS}</p>;
  const short = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <figure className="utc-chart" aria-label={`Tokens ${direction} per day by model`}>
      <div className="utc-tools">
        <div className="utc-switch" role="group" aria-label="Direction">
          <button type="button" aria-pressed={direction === 'in'} onClick={() => setDirection('in')}>Tokens in</button>
          <button type="button" aria-pressed={direction === 'out'} onClick={() => setDirection('out')}>Tokens out</button>
        </div>
        <ul className="utc-legend" aria-label="Models">
          {names.map(name => <li key={name}><i aria-hidden="true" style={{ background: modelColor(name) }} />{name}</li>)}
        </ul>
      </div>
      <ol className="utc-plot" style={{ '--utc-count': shown.length } as CSSProperties}>
        {shown.map(day => {
          const models = [...byDay.get(day)!.entries()];
          const label = `${day}: ${models.map(([name, cell]) => `${name}: ${cell.missing && cell.value === 0 ? 'not recorded' : `${formatFullCount(cell.value)}${cell.missing ? ' (some rows not recorded)' : ''}`}`).join('; ')}`;
          const dayTotal = total(day);
          return (
            // Focusable, so a keyboard reader reveals the day's total as a pointer does on hover (live review 2026-10-26).
            <li key={day} data-token-day={day} aria-label={label} title={label} tabIndex={0}>
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
      <figcaption className="local-dashboard-caption">{`Tokens ${direction} per UTC day, latest ${shown.length} served ${shown.length === 1 ? 'day' : 'days'}; n/r marks a day with a count not recorded.`}</figcaption>
    </figure>
  );
}
