/**
 * OMN-21015 AC10 (AK-2): the dashboard's own access, from local-environment.v1.
 *
 * `onex dashboard` writes one native row for itself at each start (service `local-runtime`), carrying the access
 * mode, the mint time of the token it just minted and how to rotate it. This card shows those three values as
 * served; a value the row does not carry reads "Not recorded", and with no such row the card says what it waits on.
 */
import { SettingsEmptyState } from '@/components/dashboard/SettingsEmptyState';
import { readableTime } from '@/components/format/readable-time';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';

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

/** Served text with its `backticked` commands as code (part 18 AC131): the words are the served ones, unchanged. */
function WithCode({ text }: { text: string }) {
  return <>{text.split('`').map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))}</>;
}

/** Part 27: when the data server serves no access exposure at all (an older onex dashboard), the Access section says so
 * once, instead of each of its two panels repeating the same not-served line. */
export function AccessNotServed() {
  // Both subtitles stay (AC5: Local identity remains); the one message under them replaces two identical lines.
  return (
    <div className="local-access-unserved">
      <div className="local-access-unserved-titles">
        <h2><ConceptIcon concept="local-identity" label="Local identity" size={15} />Local identity</h2>
        <h2><ConceptIcon concept="local-access" label="Dashboard access" size={15} />Dashboard access</h2>
      </div>
      <SettingsEmptyState icon={<ConceptIcon concept="local-access" label="Access" size={16} />} title="Access details are not available yet">
        The data server on this machine does not serve them yet. Your local identity and how this dashboard is protected
        appear here once <code>onex dashboard</code> serves them.
      </SettingsEmptyState>
    </div>
  );
}

export function DashboardAccess({ rows, complete = true }: { rows: readonly EnvironmentRow[]; complete?: boolean }) {
  const row = dashboardAccessRow(rows);
  if (row === null && !complete) {
    // No row because the read failed is not "not reported yet" (OMN-19988 E10; found by review of eddb28d6).
    return (
      <SettingsEmptyState icon={<ConceptIcon concept="local-access" label="Access" size={16} />} title="Access details could not be read">
        This dashboard could not read the access details of this machine.
      </SettingsEmptyState>
    );
  }
  if (row === null) {
    // Waits on local-environment.v1; the user reads what it holds (OMN-21166 AC39) and what writes it (revision 3, AC162).
    return (
      <SettingsEmptyState icon={<ConceptIcon concept="local-access" label="Access" size={16} />} title="Access details not reported yet">
        The access mode, when its token was minted and how to rotate it appear here each time <code>onex dashboard</code> starts on this machine.
      </SettingsEmptyState>
    );
  }
  return (
    <dl className="local-dashboard-fields">
      {/* Part 18 AC129: every field label has its icon, as Local identity's do. */}
      <div><dt><ConceptIcon concept="local-access" label="Access" />Access</dt><dd>{served(row.access_mode)}</dd></div>
      {/* OMN-21166 AC60: "Oct 25, 10:36:18 UTC", the served timestamp kept in the title. */}
      <div><dt><ConceptIcon concept="age" label="Token minted" />Token minted</dt><dd title={served(row.token_minted_at)}>{readableTime(served(row.token_minted_at)) ?? served(row.token_minted_at)}</dd></div>
      <div><dt><ConceptIcon concept="credentials" label="Rotate" />Rotate</dt><dd><WithCode text={served(row.rotate_hint)} /></dd></div>
    </dl>
  );
}
