/**
 * OMN-19988: the Overview Environment panel's two widgets over `local-environment.v1`.
 *
 * Each served row already carries the projection's verdict (RUNNING, UNHEALTHY, DOWN or STALE), the reason for it and
 * its open alert, so these functions only choose how a verdict is drawn: the severity a status_grid tile is coloured
 * and iconed with, and which rows give an alert_banner line. Nothing is judged here; a verdict the projection does not
 * serve is drawn as unknown under its own word, never as one of the four.
 */
import { AlertBanner } from '@/components/dashboard/alert-banner/AlertBanner';
import { StatusGrid } from '@/components/dashboard/status-grid/StatusGrid';
import type { AlertBannerRow, StatusGridRow, StatusGridSeverity } from '@shared/types/component-manifest';

export const ENVIRONMENT_TOPIC = 'onex.snapshot.projection.local-environment.v1';

/** R2: each error links to the runs that failed. */
export const FAILED_RUNS_LINK = '/runs?status=failed';

const VERDICT_SEVERITY: Readonly<Record<string, StatusGridSeverity>> = {
  running: 'nominal',
  unhealthy: 'attention',
  down: 'critical',
  stale: 'unknown',
};

const ALERT_SEVERITY: Readonly<Record<string, StatusGridSeverity>> = {
  critical: 'critical',
  warning: 'attention',
};

type EnvironmentRow = Readonly<Record<string, unknown>>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function inMode(rows: readonly EnvironmentRow[], mode: string): EnvironmentRow[] {
  return rows.filter((row) => text(row.mode) === mode);
}

export function environmentTileRows(rows: readonly EnvironmentRow[], mode: string): StatusGridRow[] {
  return inMode(rows, mode).map((row) => {
    const verdict = text(row.verdict);
    return {
      key: text(row.service),
      label: text(row.service),
      status: verdict.toUpperCase(),
      severity: VERDICT_SEVERITY[verdict] ?? 'unknown',
      status_reason: text(row.verdict_reason),
      last_seen: typeof row.last_seen === 'string' ? row.last_seen : null,
    };
  });
}

export function environmentAlertRows(rows: readonly EnvironmentRow[], mode: string): AlertBannerRow[] {
  return inMode(rows, mode)
    .filter((row) => text(row.alert_code) !== '')
    .map((row) => ({
      alert_id: `${text(row.mode)}:${text(row.service)}:${text(row.alert_code)}`,
      code: text(row.alert_code),
      severity: ALERT_SEVERITY[text(row.alert_severity)] ?? 'unknown',
      subject: text(row.service),
      since: text(row.alert_since),
      link: FAILED_RUNS_LINK,
    }));
}

interface EnvironmentPanelProps {
  rows: readonly EnvironmentRow[];
  mode: string;
}

export function EnvironmentStatus({ rows, mode }: EnvironmentPanelProps) {
  return <StatusGrid title="Environment" rows={environmentTileRows(rows, mode)} waitsOn={[ENVIRONMENT_TOPIC]} />;
}

export function EnvironmentAlerts({ rows, mode }: EnvironmentPanelProps) {
  return <AlertBanner alerts={environmentAlertRows(rows, mode)} waitsOn={[ENVIRONMENT_TOPIC]} />;
}
