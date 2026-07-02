/**
 * OMN-13832: pure aggregation service for the skill-adoption widget.
 *
 * Reads are performed by the widget through the canonical `useProjectionQuery`
 * projection path (topic `TOPICS.skillExecutions`) — this module owns only the
 * deterministic row → summary transform, so it is unit-testable without a
 * React tree or a projection source. No HTTP routes, no bespoke endpoints:
 * the widget renders rows the projection layer already serves.
 *
 * Source of truth: `skill_executions` table (omnibase_infra migration 048,
 * OMN-2934). One row per skill-started or skill-completed event; a started and
 * its completed counterpart share `run_id`. Aggregation derives, per skill:
 *   - invocation counts (started vs completed)
 *   - completed-event status breakdown (success / failed / partial)
 *   - receipt coverage = completed / started (proxy for lifecycle-pair closure)
 */

export type SkillEventType = 'started' | 'completed';
export type SkillStatus = 'success' | 'failed' | 'partial';

/**
 * One `skill_executions` projection row. Optional columns are populated on
 * only one event type (see migration 048): `args_count` on started rows;
 * `status` / `duration_ms` / `error_type` / `started_emit_failed` on completed
 * rows.
 */
export interface SkillExecutionRow {
  event_id: string;
  run_id: string;
  event_type: SkillEventType;
  skill_name: string;
  skill_id?: string | null;
  repo_id: string;
  correlation_id: string;
  args_count?: number | null;
  status?: SkillStatus | null;
  duration_ms?: number | null;
  error_type?: string | null;
  started_emit_failed?: boolean | null;
  session_id?: string | null;
  emitted_at: string;
  received_at?: string | null;
}

/** Per-skill adoption aggregate. */
export interface SkillAdoptionRow {
  skill_name: string;
  /** Repos that emitted this skill, sorted ascending. */
  repos: string[];
  started: number;
  completed: number;
  success: number;
  failed: number;
  partial: number;
  /**
   * completed / started, guarded against divide-by-zero. 0 when no started
   * events were observed. May exceed 1 when completed rows are orphaned
   * (started emission failed) — surfaced rather than clamped so the gap is
   * visible.
   */
  receiptCoverage: number;
}

/** Dashboard-level rollup across every skill. */
export interface SkillAdoptionSummary {
  totalStarted: number;
  totalCompleted: number;
  totalSuccess: number;
  totalFailed: number;
  totalPartial: number;
  /** totalCompleted / totalStarted, guarded against divide-by-zero. */
  overallReceiptCoverage: number;
  /** Per-skill rows, sorted by started desc then skill_name asc. */
  skills: SkillAdoptionRow[];
}

interface SkillAccumulator {
  skill_name: string;
  repos: Set<string>;
  started: number;
  completed: number;
  success: number;
  failed: number;
  partial: number;
}

/** completed / started, returning 0 when there is no started baseline. */
export function receiptCoverage(started: number, completed: number): number {
  if (started <= 0) return 0;
  return completed / started;
}

function isSkillStatus(value: unknown): value is SkillStatus {
  return value === 'success' || value === 'failed' || value === 'partial';
}

/**
 * Aggregate raw `skill_executions` rows into a per-skill adoption summary.
 * Pure and deterministic: same input rows always yield the same output,
 * independent of array order.
 */
export function aggregateSkillAdoption(rows: readonly SkillExecutionRow[]): SkillAdoptionSummary {
  const bySkill = new Map<string, SkillAccumulator>();

  for (const row of rows) {
    if (!row || typeof row.skill_name !== 'string' || row.skill_name === '') continue;

    let acc = bySkill.get(row.skill_name);
    if (!acc) {
      acc = {
        skill_name: row.skill_name,
        repos: new Set<string>(),
        started: 0,
        completed: 0,
        success: 0,
        failed: 0,
        partial: 0,
      };
      bySkill.set(row.skill_name, acc);
    }

    if (typeof row.repo_id === 'string' && row.repo_id !== '') {
      acc.repos.add(row.repo_id);
    }

    if (row.event_type === 'started') {
      acc.started += 1;
    } else if (row.event_type === 'completed') {
      acc.completed += 1;
      if (isSkillStatus(row.status)) {
        acc[row.status] += 1;
      }
    }
  }

  const skills: SkillAdoptionRow[] = Array.from(bySkill.values())
    .map((acc) => ({
      skill_name: acc.skill_name,
      repos: Array.from(acc.repos).sort(),
      started: acc.started,
      completed: acc.completed,
      success: acc.success,
      failed: acc.failed,
      partial: acc.partial,
      receiptCoverage: receiptCoverage(acc.started, acc.completed),
    }))
    .sort((a, b) => b.started - a.started || a.skill_name.localeCompare(b.skill_name));

  const totalStarted = skills.reduce((sum, s) => sum + s.started, 0);
  const totalCompleted = skills.reduce((sum, s) => sum + s.completed, 0);
  const totalSuccess = skills.reduce((sum, s) => sum + s.success, 0);
  const totalFailed = skills.reduce((sum, s) => sum + s.failed, 0);
  const totalPartial = skills.reduce((sum, s) => sum + s.partial, 0);

  return {
    totalStarted,
    totalCompleted,
    totalSuccess,
    totalFailed,
    totalPartial,
    overallReceiptCoverage: receiptCoverage(totalStarted, totalCompleted),
    skills,
  };
}
