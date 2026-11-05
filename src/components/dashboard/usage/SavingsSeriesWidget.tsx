import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { formatDashboardCount } from '@/lib/dashboard-count';
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
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from '@/theme/design-system/icons';
import { ColumnTip, DataTable, EmptyState } from '@/theme/design-system/components';

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
export const NO_SAVINGS_ROWS = 'No daily savings data available yet.';

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** The served saving as text, and as a number for the day's bar (null when none was served). */
function savings(row: MeteringSummaryRow): { text: string; amount: number | null } {
  if (row.baseline_state === 'unresolved' || isMissing(row.baseline_model)) return { text: 'Baseline unresolved', amount: null };
  if (isMissing(row.savings_usd)) return { text: 'Not measured', amount: null };
  const amount = Number(row.savings_usd);
  return { text: formatUsd(row.savings_usd), amount: Number.isFinite(amount) ? amount : null };
}

/** Day rows grouped by the baseline they are stated against, each group in served order. */
export function meteringDaysByBaseline(rows: readonly unknown[]): Array<[string, MeteringSummaryRow[]]> {
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

/**
 * US-3: savings per day, the baseline named in each series' title. Named for the exposure it renders (as the Overview's
 * MeteringTotalCard is), so a page that mounts it names no savings field (OMN-19980 R4).
 */
export function MeteringDaySeries({ rows }: { rows: readonly unknown[] }) {
  const series = meteringDaysByBaseline(rows);
  if (series.length === 0) {
    return <EmptyState>{NO_SAVINGS_ROWS}</EmptyState>;
  }
  return (
    <>
      {series.map(([baseline, days]) => <SavingsDays key={baseline} baseline={baseline} days={days} />)}
      <p className="local-dashboard-caption">{SAVINGS_MODELLED}</p>
    </>
  );
}

const DAYS_PER_PAGE = 8;
function SavingsDays({ baseline, days }: { baseline: string; days: MeteringSummaryRow[] }) {
  const [requestedPage, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(days.length / DAYS_PER_PAGE) - 1);
  const page = Math.min(requestedPage, last);
  const start = page * DAYS_PER_PAGE;
  // The day's bar fills against the series' biggest served saving (Lakshman 2026-11-05, "make it modern"): a scale, not
  // a sum, so the browser still adds nothing up. A day with no served saving draws no bar.
  const served = days.map(row => savings(row));
  const most = Math.max(0, ...served.flatMap(({ amount }) => (amount === null ? [] : [amount])));
  return (
        <DataTable className="local-savings-days" aria-label={`Savings per day vs ${baseline}`} footer={<nav className="local-dashboard-pager local-savings-pagination" aria-label={`Savings days for ${baseline}`}>
            {/* The Runs table's pager: the range first, the two page buttons after it. */}
            <span role="status">{start + 1}–{Math.min(start + DAYS_PER_PAGE, days.length)} of {formatDashboardCount(days.length)} days</span>
            <button type="button" aria-label={`Previous savings days for ${baseline}`} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14} aria-hidden="true" />Previous</button>
            <button type="button" aria-label={`Next savings days for ${baseline}`} disabled={page === last} onClick={() => setPage(page + 1)}>Next<ChevronRight size={14} aria-hidden="true" /></button>
          </nav>}>
            {/* Headers as the run table writes them (Lakshman 2026-11-05, "make all pages like overview and runs"). */}
            <thead><tr>
              <th><ColumnTip tone="usage-day" tip="The UTC day."><span className="local-table-head" data-field-tone="usage-day" tabIndex={0}><ConceptIcon concept="usage-day" label="Day" size={13} />Day</span></ColumnTip></th>
              <th><ColumnTip tone="savings" tip={`Modelled saving for the day: the runs' tokens at ${baseline}'s list price, less what they cost. The baseline never ran. The bar is the day against the biggest day.`}><span className="local-table-head" data-field-tone="savings" tabIndex={0}><ConceptIcon concept="savings" label="Savings" size={13} />{`Savings vs ${baseline}`}</span></ColumnTip></th>
              <th><ColumnTip tone="delegations" tip="Runs that UTC day."><span className="local-table-head" data-field-tone="delegations" tabIndex={0}><ConceptIcon concept="delegations" label="Runs" size={13} />Runs</span></ColumnTip></th>
            </tr></thead>
            <tbody>{days.slice(start, start + DAYS_PER_PAGE).map((row, index) => {
              const { text, amount } = served[start + index]!;
              return (
              <tr key={`${String(row.window_start)}-${index}`}>
                <td data-label="Day">{isMissing(row.window_start) ? 'Not recorded' : String(row.window_start)}</td>
                <td data-label={`Savings vs ${baseline}`}><span className="local-savings-cell">
                  <span className="local-savings-value">{text}</span>
                  {amount !== null && most > 0 && <span className="local-savings-meter" aria-hidden="true">
                    <i style={{ width: `${Math.round((Math.max(amount, 0) / most) * 1000) / 10}%` }} /></span>}
                </span></td>
                <td data-label="Runs">{isMissing(row.runs_total) ? 'Not recorded' : formatDashboardCount(row.runs_total)}</td>
              </tr>
              );
            })}</tbody>
        </DataTable>
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
      <MeteringDaySeries rows={rows} />
    </ComponentWrapper>
  );
}
