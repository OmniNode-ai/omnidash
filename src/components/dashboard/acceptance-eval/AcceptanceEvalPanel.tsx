/**
 * OMN-19787 AC-3: the delegation acceptance-eval panel.
 *
 * Shows every task class of the latest eval run served by onex.snapshot.projection.delegation.acceptance-eval.v1
 * (omnimarket node_projection_delegation_eval, table delegation_eval_results). False passes and their decision bound
 * come first, then the range-line verdict, then false refusals. A REFUSED line is an evaluation too small to decide,
 * so it reads as under-powered and never as passing. The panel renders served rows only; it computes no rate.
 */

import { DataTable, EvEmpty, Panel, shortId, type DataColumn } from '@/components/dashboard/event-dash/primitives';
import { useDelegationAcceptanceEval } from '@/components/dashboard/event-dash/useEventDashData';
import type { AcceptanceEvalRow } from '@/services/event-dash-api';
import { taskLabel } from '@/pages/local/plain-text';

const NOT_MEASURED = 'Not measured';

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asNumber(value: unknown): number | null {
  if (isNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function pct(value: unknown): string {
  const n = asNumber(value);
  return n === null ? NOT_MEASURED : `${(n * 100).toFixed(1)}%`;
}

function bound(value: unknown): string {
  const n = asNumber(value);
  return n === null ? NOT_MEASURED : `≤\u00a0${(n * 100).toFixed(1)}%`;
}

function count(value: unknown): string {
  const n = asNumber(value);
  return n === null ? NOT_MEASURED : String(n);
}

/** The range evaluator's verdict in words. REFUSED is under-powered: it blocks, it never passes. */
export function lineVerdictLabel(verdict: string | null | undefined, requiredN?: number | null): string {
  switch ((verdict ?? '').trim().toLowerCase()) {
    case 'met':
      return 'Met';
    case 'missed':
      return 'Missed';
    case 'refused':
      return isNumber(requiredN) ? `Under-powered (needs n ≥ ${requiredN})` : 'Under-powered';
    default:
      return NOT_MEASURED;
  }
}

function observedMs(row: AcceptanceEvalRow): number {
  const ms = Date.parse(row.observed_at);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * The rows of the latest eval run, one per task class, sorted by class. The latest run is the one with the newest
 * observed_at. Within a class the 'all' stratum (the class rollup) is kept when served, else the first served row.
 */
export function latestRunClassRows(rows: readonly AcceptanceEvalRow[]): AcceptanceEvalRow[] {
  if (rows.length === 0) return [];
  const latest = rows.reduce((best, r) => (observedMs(r) > observedMs(best) ? r : best), rows[0]);
  const byClass = new Map<string, AcceptanceEvalRow>();
  for (const r of rows) {
    if (r.eval_run_id !== latest.eval_run_id) continue;
    const kept = byClass.get(r.task_class);
    if (!kept || (kept.stratum !== 'all' && r.stratum === 'all')) byClass.set(r.task_class, r);
  }
  return [...byClass.values()].sort((a, b) => a.task_class.localeCompare(b.task_class));
}

const COLUMNS: DataColumn<AcceptanceEvalRow>[] = [
  { key: 'task_class', label: 'Class', width: 'minmax(0,1.3fr)',
    render: (r) => <span data-testid="acceptance-eval-class" data-class={r.task_class}>{taskLabel(r.task_class)}</span> },
  { key: 'accepted_n', label: 'Accepted n', num: true, width: 'minmax(0,1fr)', render: (r) => count(r.accepted_n) },
  { key: 'false_pass_count', label: 'False passes', num: true, width: 'minmax(0,1.1fr)', render: (r) => count(r.false_pass_count) },
  { key: 'false_pass_upper_bound', label: 'False-pass bound', num: true, width: 'minmax(0,1.3fr)',
    render: (r) => <span data-testid="acceptance-eval-bound" data-class={r.task_class}>{bound(r.false_pass_upper_bound)}</span> },
  { key: 'false_pass_line_verdict', label: 'Line', width: 'minmax(0,1.6fr)',
    render: (r) => (
      <span data-testid="acceptance-eval-verdict" data-class={r.task_class}>
        {lineVerdictLabel(r.false_pass_line_verdict, r.false_pass_required_n)}
      </span>
    ) },
  { key: 'false_refusal_count', label: 'False refusals', num: true, width: 'minmax(0,1.2fr)',
    render: (r) => `${count(r.false_refusal_count)} of ${count(r.refused_n)}` },
  { key: 'undetermined_share', label: 'Undetermined', num: true, width: 'minmax(0,1.2fr)', render: (r) => pct(r.undetermined_share) },
  { key: 'flip_rate', label: 'Flip rate', num: true, render: (r) => pct(r.flip_rate) },
  { key: 'gate_version', label: 'Gate version', truncate: true, render: (r) => r.gate_version ?? NOT_MEASURED },
];

export function AcceptanceEvalTable({ rows, reason }: { rows: readonly AcceptanceEvalRow[]; reason?: string | null }) {
  const classRows = latestRunClassRows(rows);
  if (classRows.length === 0) {
    return (
      <Panel title="Acceptance eval">
        <EvEmpty title="No acceptance-eval run" reason={reason ?? null}
          note="No eval run has written per-class results for this tenant yet." />
      </Panel>
    );
  }
  const run = classRows[0];
  return (
    <Panel title="Acceptance eval"
      sub={`Latest run ${shortId(run.eval_run_id)} · ${classRows.length} classes · ${run.observed_at}`}>
      <div data-testid="acceptance-eval-table">
        <DataTable columns={COLUMNS} rows={classRows} rowKey={(r) => r.task_class} />
      </div>
    </Panel>
  );
}

export function AcceptanceEvalPanel() {
  const q = useDelegationAcceptanceEval();
  if (q.isLoading) return <Panel title="Acceptance eval"><EvEmpty title="Loading…" /></Panel>;
  return <AcceptanceEvalTable rows={q.data?.rows ?? []} reason={q.data?.degradedReason ?? null} />;
}
