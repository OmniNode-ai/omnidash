/**
 * OMN-21015 AC10 (AK-2): the dashboard's own access, from local-environment.v1.
 *
 * `onex dashboard` writes one native row for itself at each start (service `local-runtime`), carrying the access
 * mode, the mint time of the token it just minted and how to rotate it. This card shows those three values as
 * served; a value the row does not carry reads "Not recorded", and with no such row the card says what it waits on.
 */
import { notAvailableYet } from './plain-text';

const DASHBOARD_SERVICE = 'local-runtime';

type EnvironmentRow = Readonly<Record<string, unknown>>;

export function dashboardAccessRow(rows: readonly EnvironmentRow[]): EnvironmentRow | null {
  return rows.find((row) => row.mode === 'native' && row.service === DASHBOARD_SERVICE) ?? null;
}

function served(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : 'Not recorded';
}

export function DashboardAccess({ rows }: { rows: readonly EnvironmentRow[] }) {
  const row = dashboardAccessRow(rows);
  if (row === null) {
    // Waits on local-environment.v1; the user reads what it holds (OMN-21166 AC39).
    return <p className="local-dashboard-empty" role="status">{notAvailableYet('dashboard access details')}</p>;
  }
  return (
    <dl className="local-dashboard-fields">
      <div><dt>Access</dt><dd>{served(row.access_mode)}</dd></div>
      <div><dt>Token minted</dt><dd>{served(row.token_minted_at)}</dd></div>
      <div><dt>Rotate</dt><dd>{served(row.rotate_hint)}</dd></div>
    </dl>
  );
}
