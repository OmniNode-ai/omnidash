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

// Selection among served rows, not a computed fact: the newest matching row by the binding's declared order key
// (updated_at) wins, whatever order the rows arrive in. A tie on the newest, or a missing/unparseable updated_at
// while several rows match, is not guessed: the card shows its not-available state (JG-19). One match is used as is.
export function dashboardAccessRow(rows: readonly EnvironmentRow[]): EnvironmentRow | null {
  const matches = rows.filter((row) => row.mode === 'native' && row.service === DASHBOARD_SERVICE);
  if (matches.length <= 1) return matches[0] ?? null;
  const stamped = matches.map((row) => ({
    row,
    at: typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : Number.NaN,
  }));
  if (stamped.some((m) => Number.isNaN(m.at))) return null;
  const newest = Math.max(...stamped.map((m) => m.at));
  const top = stamped.filter((m) => m.at === newest);
  return top.length === 1 ? top[0].row : null;
}

function served(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value : 'Not recorded';
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
