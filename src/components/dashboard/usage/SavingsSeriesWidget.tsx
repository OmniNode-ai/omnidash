// OMN-20006 Amendment 1 (US-3): savings per UTC day against the one baseline, from metering-summary.v1.
//
// node_projection_metering_summary serves one `day` row per UTC day and one `all` row per baseline model, from one
// fold, so the day rows are the daily series and the all row is the headline (OV-3, owned by the Overview). This
// renders the day rows only, as served: the browser sums nothing, so no total row exists here.
//
// This module is the declared reader of `onex.snapshot.projection.metering-summary.v1` in the component registry,
// which the omnibase_infra exposure-reader-coverage gate (OMN-17199) resolves readers from.
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionSnapshotQuery } from '@/hooks/useProjectionSnapshotQuery';
import { TOPICS } from '@shared/types/topics';
import { formatUsd } from './UsageByModelDayWidget';

/** The subset of metering-summary.v1 columns the series renders. */
export interface MeteringSummaryRow {
  tenant_id?: string;
  window_kind?: string;
  window_start?: string;
  baseline_model?: string | null;
  baseline_state?: string | null;
  runs_total?: number | null;
  savings_usd?: number | string | null;
  as_of?: string;
}

/** A savings figure is a modelled counterfactual: the runs' tokens priced at the baseline's list price. */
export const SAVINGS_MODELLED = "Modelled: the runs' tokens priced at the baseline model's list price. The baseline never ran.";
export const NO_SAVINGS_ROWS = 'No savings rows yet: waits on metering-summary day rows';

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function savings(row: MeteringSummaryRow): string {
  if (row.baseline_state === 'unresolved' || isMissing(row.baseline_model)) return 'Baseline unresolved';
  return isMissing(row.savings_usd) ? 'Not measured' : formatUsd(row.savings_usd);
}

/** Day rows grouped by the baseline they are stated against, each group in served order. */
function byBaseline(rows: readonly unknown[]): Array<[string, MeteringSummaryRow[]]> {
  const groups = new Map<string, MeteringSummaryRow[]>();
  for (const value of rows) {
    if (typeof value !== 'object' || value === null) continue;
    const row = value as MeteringSummaryRow;
    if (row.window_kind !== 'day') continue;
    const baseline = isMissing(row.baseline_model) ? 'an unresolved baseline' : String(row.baseline_model);
    groups.set(baseline, [...(groups.get(baseline) ?? []), row]);
  }
  return [...groups.entries()];
}

/** US-3: savings per day, the baseline named in each series' title. */
export function SavingsSeries({ rows }: { rows: readonly unknown[] }) {
  const series = byBaseline(rows);
  if (series.length === 0) {
    return <p className="local-dashboard-empty" role="status">{NO_SAVINGS_ROWS}</p>;
  }
  return (
    <>
      {series.map(([baseline, days]) => (
        <div className="local-dashboard-table-wrap" key={baseline}>
          <table aria-label={`Savings per day vs ${baseline}`}>
            <thead><tr><th>Day</th><th>{`Savings vs ${baseline}`}</th><th>Runs</th></tr></thead>
            <tbody>{days.map((row, index) => (
              <tr key={`${String(row.window_start)}-${index}`}>
                <td>{isMissing(row.window_start) ? 'Not recorded' : String(row.window_start)}</td>
                <td>{savings(row)}</td>
                <td>{isMissing(row.runs_total) ? 'Not recorded' : String(row.runs_total)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      <p className="local-dashboard-caption">{SAVINGS_MODELLED}</p>
    </>
  );
}

/** The palette widget: the same series over the served exposure. */
export default function SavingsSeriesWidget() {
  const query = useProjectionSnapshotQuery<MeteringSummaryRow>({
    queryKey: ['savings-series-widget', TOPICS.meteringSummary],
    topic: TOPICS.meteringSummary,
    refetchInterval: 30_000,
  });
  const rows = query.data?.rows ?? [];
  return (
    <ComponentWrapper
      title="Savings per day"
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={rows.length === 0}
      emptyMessage="No savings rows yet"
      emptyHint="Rows appear once node_projection_metering_summary serves its day rows."
    >
      <SavingsSeries rows={rows} />
    </ComponentWrapper>
  );
}
