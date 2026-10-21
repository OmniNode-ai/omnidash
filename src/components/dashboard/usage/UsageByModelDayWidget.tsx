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
import { useEffect, useId, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, Filter, RotateCcw } from 'lucide-react';
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

/**
 * A served money value, formatted only: Postgres serves NUMERIC(18,8) as "0.25000000" and SQLite a float, so the
 * served number is shown with 2 to 8 decimals. Nothing is summed or rounded past the store's own 8 places.
 */
export function formatUsd(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `$${String(value)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
}

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
  return Number(value) === 0 ? 'none' : `${String(value)} unmeasured`;
}

/** OMN-21015: the served tier; a call that named none is served as not_tier_routed, which is not a tier. */
function tier(value: unknown): string {
  if (isMissing(value)) return 'Not recorded';
  return value === 'not_tier_routed' ? 'Not tier-routed' : String(value);
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
        <span className="usage-record-controls-title"><Filter size={15} aria-hidden="true" />Recorded rows</span>
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
            <td data-label="Calls">{recorded(row.call_count)}</td>
            <td data-label="Share of calls">{callShare(row.call_share)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
      {interactive && <div className="usage-record-pagination local-dashboard-pager">
        <span role="status">{filtered.length ? `Showing ${currentPage * 25 + 1}–${Math.min((currentPage + 1) * 25, filtered.length)} of ${filtered.length} records` : 'No records match these filters'}</span>
        {filtered.length > 25 && <div><button type="button" aria-label="Previous usage records" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
          <button type="button" aria-label="Next usage records" disabled={(currentPage + 1) * 25 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={16} aria-hidden="true" /></button></div>}
      </div>}
    </div>
  );
}

const TOKEN_DIRECTIONS = [
  { direction: 'in', field: 'input_tokens' },
  { direction: 'out', field: 'output_tokens' },
] as const;

/** A served token count, grouped for reading. Formatting only: the number is the one the row carries. */
function groupedCount(value: unknown): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * OMN-21015 AC4 (US-1): tokens in and tokens out per UTC day as a stacked series split by model, in the order the
 * exposure serves its rows. Each segment is one served row's count, and the stacking is the layout's: a segment's
 * flex-grow is that count, so nothing is added up here and no total is written (SV-3: tokens in and out stay apart).
 * A drawn segment starts from a zero basis and holds no text, padding or border, so its width is its count's share of
 * the bar and nothing else; the figures are written in the list beside the bar, where a very small count still reads.
 * A model whose count was not recorded is named under the bar; it is never drawn as zero. A served zero is written.
 * OMN-21166 (U10): every bar is drawn on one scale, the largest drawn bar, so a day's 377 tokens out is not as long as
 * its 5,133 tokens in. The scale is layout only: the bar's own width is its counts' sum against the largest bar's, and
 * that sum is never written.
 */
export function UsageTokensByDay({ rows }: { rows: readonly unknown[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const usage = asRows(rows);
  const models = [...new Set(usage.map(row => model(row.model_id)))];
  const selection = selected !== null && models.includes(selected) ? selected : null;
  const modelIdentity = JSON.stringify(models);
  useEffect(() => { if (selected !== null && !JSON.parse(modelIdentity).includes(selected)) setSelected(null); }, [modelIdentity, selected]);
  // Stable identity controls presentation color, never a measured figure.
  const colorIndex = (name: string) => [...name].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 6;
  if (usage.length === 0) {
    return <p className="local-dashboard-empty" role="status">{NO_TOKEN_ROWS}</p>;
  }
  const days = new Map<string, UsageByModelDayRow[]>();
  for (const row of usage) {
    const day = recorded(row.usage_day);
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  const drawnLength = (dayRows: readonly UsageByModelDayRow[], field: 'input_tokens' | 'output_tokens') =>
    dayRows.reduce((length, row) => (isMissing(row[field]) ? length : length + Number(row[field])), 0);
  const scale = Math.max(0, ...[...days.values()].flatMap(dayRows => TOKEN_DIRECTIONS.map(({ field }) => drawnLength(dayRows, field))));
  const barWidth = (dayRows: readonly UsageByModelDayRow[], field: 'input_tokens' | 'output_tokens') =>
    // With nothing drawn anywhere (every count a served zero) no width is set and the bar keeps its own.
    scale > 0 ? `${(drawnLength(dayRows, field) / scale) * 100}%` : undefined;
  return (
    <figure className="local-chart usage-token-explorer" aria-label="Tokens by model and day">
      <div className="local-chart-legend" role="group" aria-label="Model highlight">
        {models.map(name => <button type="button" className="local-chart-toggle" key={name} aria-label={`Highlight ${name}`}
          data-series={colorIndex(name)} aria-pressed={selection === name} onClick={() => setSelected(current => current === name ? null : name)}><span className="usage-model-swatch" aria-hidden="true" />{name}</button>)}
        {selection && <button type="button" className="local-chart-reset" onClick={() => setSelected(null)}>Clear model highlight</button>}
      </div>
      {selection && <div className="local-chart-detail" role="status"><strong>{selection}</strong>
        {usage.filter(row => model(row.model_id) === selection).map((row, index) => <span key={index}>
          {recorded(row.usage_day)} · {tier(row.cost_tier_name)} · Tokens in: {recorded(row.input_tokens)} · Tokens out: {recorded(row.output_tokens)}
        </span>)}
      </div>}
      {[...days.entries()].map(([day, dayRows]) => (
        <section className="usage-tokens-day" key={day}>
          <h3>{day}</h3>
          {TOKEN_DIRECTIONS.map(({ direction, field }) => {
            const counted = dayRows.filter((row) => !isMissing(row[field]));
            const uncounted = dayRows.filter((row) => isMissing(row[field]));
            return (
              <div className="usage-tokens-direction" key={direction}>
                <span className="usage-tokens-label">{direction === 'in' ? <ArrowDownToLine size={14} aria-hidden="true" /> : <ArrowUpFromLine size={14} aria-hidden="true" />}{`Tokens ${direction}`}</span>
                {counted.length > 0 && (
                  <div className="usage-tokens-series">
                    <div className="usage-tokens-bar" aria-hidden="true" style={{ width: barWidth(dayRows, field) }}>
                      {counted.map((row, index) => (
                        <span
                          className="usage-tokens-fill"
                          data-series={colorIndex(model(row.model_id))}
                          data-highlighted={selection === null || selection === model(row.model_id)}
                          key={`${String(row.model_id)}-${index}`}
                          style={{ flexGrow: Number(row[field]), flexShrink: 1, flexBasis: '0px', minWidth: '0px' }}
                        />
                      ))}
                    </div>
                    <ul className="usage-tokens-legend" aria-label={`Tokens ${direction} on ${day}, by model`}>
                      {counted.map((row, index) => (
                        <li data-series={colorIndex(model(row.model_id))} data-highlighted={selection === null || selection === model(row.model_id)} key={`${String(row.model_id)}-${index}`}>
                          {`${model(row.model_id)}: ${groupedCount(row[field])}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {uncounted.length > 0 && (
                  <p className="local-dashboard-caption">
                    {`Tokens ${direction} not recorded: ${uncounted.map((row) => model(row.model_id)).join(', ')}`}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </figure>
  );
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
