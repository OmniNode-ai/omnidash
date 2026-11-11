// OMN-23330 AC24: part of the local pages, split out of LocalDashboardPage.tsx (3,926 lines) with no change to what
// any page draws. Settings panels: provider keys and alerts.
import { ColumnTip, DataTable, EmptyState } from '@/theme/design-system/components';
import { providerName } from '@/pages/local/model-keys';
import { SettingsEmptyState } from '@/components/dashboard/SettingsEmptyState';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { CellTime, CopyButton, type Row, asRecords, isMissing, recorded } from '@/pages/local/page-shared';
import { KEY_HEADERS } from '@/pages/local/page-runs';
import { type DeclaredColumn } from '@/pages/local/page-tables';

/** OMN-21166 revision 3 (AC161): no provider listed and no key recorded. `onex models add` stores a provider's key and
 * tests it with one delegation (OMN-20816 ruling: keys change only in the terminal). */
export function NoProviderKeys() {
  return (
    <SettingsEmptyState icon={<ConceptIcon concept="credentials" label="Model providers" size={16} />} title="No model providers listed yet"
      action={<><code>onex models add &lt;provider&gt;</code><CopyButton text="onex models add" label="Copy the command that adds a provider key" /></>}>
      Add a provider's key in your terminal: Gemini, OpenRouter, OpenAI, Anthropic, Ollama or a local model server. OmniNode tests it with one delegation and lists it here.
    </SettingsEmptyState>
  );
}

/** CR-1 to CR-3: provider key references only (never a value), with their fingerprint prefix and set time; the key
 * history keeps the revoked ones. */
export function CredentialsTable({ rows }: { rows: readonly unknown[] }) {
  const keys = asRecords(rows);
  // Revision 3 (AC161): with no key recorded the provider list above says so once (NoProviderKeys) or shows each
  // provider's own set-up command, so this part draws nothing.
  if (keys.length === 0) return null;
  // OMN-21166 part 13: the keys in use are in view; revoked history is one click away. Rows stay as served.
  const current = keys.filter(key => isMissing(key.revoked_at));
  const revoked = keys.filter(key => !isMissing(key.revoked_at));
  const table = (list: Row[], label: string) => (
    <DataTable className="local-credentials-records" aria-label={label}>
        {/* Headers as every other table writes them: glyph, colour and an explanation on hover (Lakshman 2026-11-05). */}
        <thead><tr>{KEY_HEADERS.map(([concept, name, tip]) => <th key={name}><ColumnTip tone={concept} tip={tip}>
          <span className="local-table-head" data-field-tone={concept} tabIndex={0}><ConceptIcon concept={concept} label={name} size={13} />{name}</span></ColumnTip></th>)}</tr></thead>
        <tbody>{list.map((key, index) => (
          <tr key={`${String(key.provider)}-${String(key.name)}-${index}`}>
            {/* Part 27 round 7: the provider's name in the one case the Model providers table uses (Gemini, not gemini). */}
            <td data-label="Provider">{isMissing(key.provider) ? recorded(key.provider) : providerName(key.provider)}</td>
            <td data-label="Key ref">{recorded(key.name)}</td>
            {/* OMN-19985: the served fingerprint prefix (8 hex of sha256) and the time the key was set; a row its
                producer sent without them says so. created_at is when the projection first saw the row, not this. */}
            <td data-label="Fingerprint">{recorded(key.fingerprint)}</td>
            {/* OMN-21166 AC60/AC66: times read as "Oct 14, 08:24:11 UTC" with the served value in the title; the served
                expiry and bound host are shown, and say so when the producer recorded none. Never a secret. */}
            <td data-label="Set"><CellTime value={key.set_at} /></td>
            {/* OMN-19996 AC2: the served last time the key was used in a run, read like Set; a key never used, or a row
                from a server older than the column, reads Never. */}
            <td data-label="Last used">{isMissing(key.last_used_at) ? 'Never' : <CellTime value={key.last_used_at} />}</td>
            <td data-label="Revoked">{isMissing(key.revoked_at) ? 'Not revoked' : <CellTime value={key.revoked_at} />}</td>
            <td data-label="Expires">{isMissing(key.expires_at) ? 'No expiry recorded' : <CellTime value={key.expires_at} />}</td>
            <td data-label="Bound host">{recorded(key.bound_host)}</td>
          </tr>
        ))}</tbody>
    </DataTable>
  );
  // Part 18 AC128: the keys in use are on their providers' rows of the one Model providers table above (ModelKeys); this
  // part keeps what that table does not: no key in use, and the key history.
  return (
    <>
      {current.length === 0 && <EmptyState>No key is in use; every recorded key is revoked</EmptyState>}
      {revoked.length > 0 && (
        <div className="local-more local-more--open" data-section="Key history">
          {table(revoked, 'Revoked key references')}
        </div>
      )}
    </>
  );
}

/**
 * OMN-19991: the alerts omnimarket's `local_alerts` exposure serves, on System status beside Environment. The rows
 * are the writer's own alert transitions, newest raised first as the exposure orders them (`raised_at DESC`), and the
 * columns are the ones the page declares. This table decides nothing: an alert is open or cleared because its own
 * `state` field says so, and a field the writer recorded no value for says so rather than reading as all clear.
 */
export function AlertsTable({ rows, columns }: { rows: readonly unknown[]; columns: readonly DeclaredColumn[] }) {
  const alerts = asRecords(rows);
  // A served exposure with no rows is the healthy case, and it has to say which it is: an unread exposure is handled
  // above this renderer, so reaching here with no rows means the store holds no alert.
  if (alerts.length === 0) return <EmptyState>No alert has been raised on this machine</EmptyState>;
  const cell = (alert: Row, column: DeclaredColumn) => {
    const value = alert[column.key];
    // An alert that is still open has no cleared_at, which is the one missing time that means something.
    if (column.key === 'cleared_at' && isMissing(value)) return 'Not cleared';
    return column.key.endsWith('_at') && !isMissing(value) ? <CellTime value={value} /> : recorded(value);
  };
  return (
    <DataTable className="local-alerts-records" aria-label="Alerts raised on this machine">
      <thead><tr>{columns.map(column => <th key={column.key}>{column.header}</th>)}</tr></thead>
      <tbody>{alerts.map((alert, index) => (
        <tr key={`${String(alert.code)}-${String(alert.subject)}-${index}`} data-alert-state={recorded(alert.state)}>
          {columns.map(column => <td key={column.key} data-label={column.header}>{cell(alert, column)}</td>)}
        </tr>
      ))}</tbody>
    </DataTable>
  );
}
