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
//     tenant's rows only.
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionSnapshotQuery } from '@/hooks/useProjectionSnapshotQuery';
import { TOPICS } from '@shared/types/topics';

/** Row shape of onex.snapshot.projection.usage-by-model-day.v1, as the contract's projection_api.columns declare. */
export interface UsageByModelDayRow {
  tenant_id?: string;
  usage_day?: string;
  model_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd?: number | string | null;
  measured_cost_usd?: number | string | null;
  unmeasured_call_count?: number | null;
  call_count?: number | null;
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

export const NO_USAGE_ROWS = 'No usage rows yet: waits on llm-call-completed events (OMN-20006)';

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

function asRows(rows: readonly unknown[]): UsageByModelDayRow[] {
  return rows.filter((row): row is UsageByModelDayRow => typeof row === 'object' && row !== null);
}

/** US-1, US-2, US-4: one row per served day and model, in the order the exposure serves them. */
export function UsageByModelDayTable({ rows }: { rows: readonly unknown[] }) {
  const usage = asRows(rows);
  if (usage.length === 0) {
    return <p className="local-dashboard-empty" role="status">{NO_USAGE_ROWS}</p>;
  }
  return (
    <div className="local-dashboard-table-wrap">
      <table aria-label="Usage by model and day">
        <thead>
          <tr>
            <th>Day</th><th>Model</th><th>Tokens in</th><th>Tokens out</th><th>Cost (measured)</th><th>Unmeasured</th>
            <th>Calls</th>
          </tr>
        </thead>
        <tbody>{usage.map((row, index) => (
          <tr key={`${String(row.usage_day)}-${String(row.model_id)}-${index}`}>
            <td>{recorded(row.usage_day)}</td>
            <td>{model(row.model_id)}</td>
            <td>{recorded(row.input_tokens)}</td>
            <td>{recorded(row.output_tokens)}</td>
            <td>{measuredCost(row.measured_cost_usd)}</td>
            <td>{unmeasured(row.unmeasured_call_count)}</td>
            <td>{recorded(row.call_count)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
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
