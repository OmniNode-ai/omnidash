/** The two demo terminal producers and their latest-status projection contract. */
export const DEMO_NODES = ['demo_rehearsal', 'demo_drift_detector'] as const;
export type DemoNodeId = typeof DEMO_NODES[number];
export type DemoStatus = 'GREEN' | 'DEGRADED' | 'BROKEN' | 'UNCONFIGURED' | 'DRY_RUN';
export type DashboardConfiguration = 'CONFIGURED' | 'UNCONFIGURED';

export interface DemoReadinessRow {
  node_id: DemoNodeId;
  run_id: string;
  status: DemoStatus;
  dashboard_configuration: DashboardConfiguration;
  dry_run: boolean;
  observed_at: string;
  evidence_path: string | null;
  failure_count: number | null;
  demo_blocker_count: number | null;
  demo_degraded_count: number | null;
  total_finding_count: number | null;
  source_event_id: string;
  projection_cursor: number;
}

function isCount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

/** Reject malformed rows instead of letting a missing configuration become green. */
export function parseDemoReadinessRow(value: unknown): DemoReadinessRow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.node_id !== 'demo_rehearsal' && row.node_id !== 'demo_drift_detector') return null;
  if (typeof row.run_id !== 'string' || !row.run_id) return null;
  if (row.status !== 'GREEN' && row.status !== 'DEGRADED' && row.status !== 'BROKEN' && row.status !== 'UNCONFIGURED' && row.status !== 'DRY_RUN') return null;
  if (row.dashboard_configuration !== 'CONFIGURED' && row.dashboard_configuration !== 'UNCONFIGURED') return null;
  if (typeof row.dry_run !== 'boolean') return null;
  if ((row.dashboard_configuration === 'UNCONFIGURED') !== (row.status === 'UNCONFIGURED')) return null;
  if (row.dry_run && row.dashboard_configuration === 'CONFIGURED' && row.status !== 'DRY_RUN') return null;
  if (!row.dry_run && row.status === 'DRY_RUN') return null;
  if (typeof row.observed_at !== 'string' || !Number.isFinite(Date.parse(row.observed_at))) return null;
  if (row.evidence_path !== null && typeof row.evidence_path !== 'string') return null;
  if (row.dry_run && row.evidence_path !== null) return null;
  if (!row.dry_run && (typeof row.evidence_path !== 'string' || !row.evidence_path)) return null;
  if (!isCount(row.failure_count) || !isCount(row.demo_blocker_count) || !isCount(row.demo_degraded_count) || !isCount(row.total_finding_count)) return null;
  if (row.node_id === 'demo_rehearsal' && (
    row.failure_count === null || row.demo_blocker_count !== null || row.demo_degraded_count !== null || row.total_finding_count !== null
  )) return null;
  if (row.node_id === 'demo_drift_detector' && (
    row.failure_count !== null || row.demo_blocker_count === null || row.demo_degraded_count === null || row.total_finding_count === null
  )) return null;
  if (typeof row.source_event_id !== 'string' || !row.source_event_id) return null;
  if (!isCount(row.projection_cursor) || row.projection_cursor === null) return null;
  return row as unknown as DemoReadinessRow;
}
