/**
 * OMN-19988: the Overview Environment panel's two widgets over `local-environment.v1`.
 *
 * Each served row already carries the projection's verdict (RUNNING, UNHEALTHY, DOWN or STALE), the reason for it and
 * its open alert, so these functions only choose how a verdict is drawn: the severity a status_grid tile is coloured
 * and iconed with, and which rows give an alert_banner line. Nothing is judged here; a verdict the projection does not
 * serve is drawn as unknown under its own word, never as one of the four.
 */
import { readableTime } from '@/lib/readable-time';
import { AlertBanner } from '@/components/dashboard/alert-banner/AlertBanner';
import { StatusGrid } from '@/components/dashboard/status-grid/StatusGrid';
import { validateStatusGridRow, type AlertBannerRow, type StatusGridRow, type StatusGridSeverity } from '@shared/types/component-manifest';

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

/** A served word reads only the table's own keys; `constructor` or `__proto__` is unknown, not an inherited value. */
function severityOf(table: Readonly<Record<string, StatusGridSeverity>>, word: string): StatusGridSeverity {
  return Object.hasOwn(table, word) ? table[word] : 'unknown';
}

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
      severity: severityOf(VERDICT_SEVERITY, verdict),
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
      severity: severityOf(ALERT_SEVERITY, text(row.alert_severity)),
      subject: text(row.service),
      since: text(row.alert_since),
      link: FAILED_RUNS_LINK,
    }));
}

interface EnvironmentPanelProps {
  rows: readonly EnvironmentRow[];
  mode: string;
  plain?: boolean;
  allowClear?: boolean;
}

export function EnvironmentStatus({ rows, mode, plain = false }: EnvironmentPanelProps) {
  const known = new Set(inMode(rows, mode).filter(row => Object.hasOwn(VERDICT_SEVERITY, text(row.verdict))).map(row => text(row.service)));
  return <StatusGrid title={plain ? 'Services' : 'Environment'} rows={environmentTileRows(rows, mode)} waitsOn={[ENVIRONMENT_TOPIC]}
    statusLabel={plain ? tile => known.has(tile.key) ? tile.status : 'Health unknown' : undefined} />;
}

const ALERT_LABELS: Readonly<Record<string, string>> = {
  SERVICE_DOWN: 'Service down', SERVICE_DEGRADED: 'Service degraded', HEALTH_UNKNOWN: 'Health unknown',
};
const alertLabel = (code: string): string => Object.hasOwn(ALERT_LABELS, code) ? ALERT_LABELS[code]! : 'Alert type unavailable';

export function EnvironmentAlerts({ rows, mode, plain = false, allowClear = true }: EnvironmentPanelProps) {
  const alerts = environmentAlertRows(rows, mode);
  const missingCode = plain && inMode(rows, mode).some(row => !text(row.alert_code)
    && Boolean(text(row.alert_severity) || text(row.alert_since)));
  return <>
    {missingCode && <p className="local-dashboard-empty" role="status">Alert details are not available.</p>}
    {(alerts.length > 0 || (allowClear && !missingCode)) && <AlertBanner alerts={alerts} waitsOn={[plain ? `${mode} service health` : ENVIRONMENT_TOPIC]}
      codeLabel={plain ? alertLabel : undefined} refusalMessage={plain ? 'Alert details are not available.' : undefined} />}
  </>;
}

/** Native startup metadata and health stay visible even before the first delegation. */
export function EnvironmentPanel({ rows, complete = true }: { rows: readonly EnvironmentRow[]; complete?: boolean }) {
  const validModes = new Set(['native', 'compose']);
  const invalidMode = rows.some(row => !validModes.has(text(row.mode)));
  const modes = [...new Set(rows.map(row => text(row.mode)).filter(mode => validModes.has(mode)))];
  if (rows.length === 0) return <p className="local-dashboard-empty" role="status">Service health is not available yet.</p>;
  return <>
    {invalidMode && <p className="local-dashboard-empty" role="status">Some service health details are not available.</p>}
    {modes.map(mode => {
    const selected = inMode(rows, mode);
    const validHealth = selected.filter(row => validateStatusGridRow(environmentTileRows([row], mode)[0]!).valid);
    const refusedHealth = validHealth.length !== selected.length;
    // The projection owns verdicts/freshness. A missing or uncertain input
    // cannot support a positive presentation claim about this mode's health.
    const allowClear = complete && !invalidMode && !refusedHealth && selected.every(row => text(row.verdict) === 'running');
    const first = selected[0]!;
    const versions = first.versions && typeof first.versions === 'object' && !Array.isArray(first.versions)
      ? Object.entries(first.versions) : [];
    const labels: Readonly<Record<string, string>> = { omnimarket: 'Runtime', omnibase_core: 'Core', omnidash: 'Dashboard' };
    // OMN-21166 part 13: one status line in view (mode, runtime, store, services running, alerts), every served
    // word; the full table is one click away in "Environment details".
    const runtimeVersion = versions.find(([name]) => name === 'omnimarket')?.[1];
    const runningCount = selected.filter(row => text(row.verdict) === 'running').length;
    const alertCount = environmentAlertRows(selected, mode).length;
    const statusParts = [
      mode,
      text(runtimeVersion) ? `runtime ${text(runtimeVersion)}` : null,
      text(first.store_kind) || null,
      `${runningCount} of ${selected.length} ${selected.length === 1 ? 'service' : 'services'} running`,
      alertCount === 0 ? (allowClear ? 'no open alerts' : null) : `${alertCount} open ${alertCount === 1 ? 'alert' : 'alerts'}`,
    ].filter((part): part is string => part !== null);
    return <section key={mode} data-environment-mode={mode} aria-label={`${mode} environment`}>
      <p className="local-environment-line" role="status" data-environment-state={alertCount > 0 ? 'alert' : allowClear ? 'clear' : 'unknown'}>
        <span className="local-environment-dot" aria-hidden="true" />{statusParts.join(' · ')}
      </p>
      <details className="local-more">
      <summary>Environment details</summary>
      <dl className="local-dashboard-fields">
        <div><dt>Mode</dt><dd>{mode}</dd></div>
        {mode === 'native' && <>
          {versions.length > 0 ? versions.map(([name, version]) => <div key={name}><dt>{labels[name] ?? name}</dt><dd>{text(version) || 'Not recorded'}</dd></div>)
            : <div><dt>Versions</dt><dd>Not recorded</dd></div>}
          <div><dt>Store</dt><dd>{text(first.store_kind) || 'Not recorded'}</dd></div>
          <div><dt>Last start</dt><dd title={text(first.token_minted_at) || undefined}>{text(first.token_minted_at) ? readableTime(text(first.token_minted_at)) ?? text(first.token_minted_at) : 'Not recorded'}</dd></div>
        </>}
      </dl>
      {refusedHealth && <p className="local-dashboard-empty" role="status">Some service health details are not available.</p>}
      {validHealth.length > 0 && <div role="status"><EnvironmentStatus rows={validHealth} mode={mode} plain /></div>}
      <div role="status"><EnvironmentAlerts rows={selected} mode={mode} plain allowClear={allowClear} /></div>
      </details>
    </section>;
  })}</>;
}
