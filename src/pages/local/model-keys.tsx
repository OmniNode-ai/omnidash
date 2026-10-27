/**
 * OMN-20816: the model providers delegation can use, listed read-only on the Credentials page.
 *
 * The rows are what `GET /models` serves, the same status `onex models list` prints: each of the four providers the
 * page shows, set up or not, its models and its last pinned test. Keys are added, replaced and removed only in the
 * terminal (`onex models add|remove`), as the operator ruled on the ticket (2026-10-21T10:24:32Z: no key entry on the
 * Credentials page, which stays read-only), so this section has no button, form or field, and no key reaches it.
 * Ollama is set up by onboarding. Nothing here decides a state: every word on a row is a served field or the command
 * that changes it.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { SettingsEmptyState } from '@/components/dashboard/SettingsEmptyState';
import { readableTime } from '@/components/format/readable-time';
import { ModelKeysError, listModelKeys, type ModelProviderId, type ModelProviderRow } from '@/services/models-api';

/** A served key reference row from tenant-credentials.v1: its name, fingerprint prefix and times. Never a value. */
export type CredentialKeyRow = Record<string, unknown>;

const missing = (value: unknown) => value === null || value === undefined || value === '';
const served = (value: unknown) => (missing(value) ? 'Not recorded' : String(value));

/** A served time as "Oct 14, 08:24:11 UTC", the served value whole in the title. */
function KeyTime({ value }: { value: unknown }) {
  if (missing(value)) return <>Not recorded</>;
  const text = String(value);
  const readable = readableTime(text);
  return readable === null ? <>{text}</> : <time className="local-cell-time" dateTime={text} title={text}>{readable}</time>;
}

/** One cell per key a provider has (most have one); a provider with no key reads "No key" in the first, "—" after. */
function KeyCells({ list, field, first, render }: { list: readonly CredentialKeyRow[]; field: string; first?: boolean; render?: (value: unknown) => ReactNode }) {
  if (list.length === 0) return <>{first ? 'No key' : '—'}</>;
  return <>{list.map((key, index) => <div key={index}>{render ? render(key[field]) : served(key[field])}</div>)}</>;
}

export interface ModelKeysClient {
  list: () => Promise<ModelProviderRow[]>;
}

const LIVE_CLIENT: ModelKeysClient = { list: listModelKeys };

/**
 * One read of GET /models at a time per client: a mount that starts while another's read is still out shares it, so
 * React's development double mount (StrictMode) asks once. A settled read is dropped, so a later visit reads afresh.
 */
const IN_FLIGHT = new WeakMap<ModelKeysClient, Promise<ModelProviderRow[]>>();
function listOnce(client: ModelKeysClient): Promise<ModelProviderRow[]> {
  const pending = IN_FLIGHT.get(client);
  if (pending) return pending;
  const read = client.list();
  IN_FLIGHT.set(client, read);
  const drop = () => { if (IN_FLIGHT.get(client) === read) IN_FLIGHT.delete(client); };
  read.then(drop, drop);
  return read;
}

const LABELS: Record<ModelProviderId, string> = { gemini: 'Gemini', openrouter: 'OpenRouter', openai: 'OpenAI', ollama: 'Ollama' };
const ORDER: readonly ModelProviderId[] = ['gemini', 'openrouter', 'openai', 'ollama'];
const OLLAMA_HOW = 'Set up by onboarding (run it again with --provider ollama)';

/** A provider's name in one case everywhere: its label, else the served id with a capital first letter. */
export function providerName(provider: unknown): string {
  const id = String(provider ?? '').toLowerCase();
  if (id === '') return 'Not recorded';
  return (LABELS as Record<string, string>)[id] ?? `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}

function stateOf(row: ModelProviderRow): string {
  if (!row.set_up) return 'Not set up';
  const last = row.last_test;
  if (last === null || last.status === 'not_set_up') return 'Set up, not tested yet';
  if (last.status === 'passed') return 'Last test passed';
  return `Last test failed: ${last.reason ?? 'no reason recorded'}`;
}

function message(error: unknown): string {
  return error instanceof ModelKeysError ? error.message : 'The dashboard could not be reached.';
}

/**
 * OMN-21166 part 18 AC128: one table, one row per provider. Beside each provider's served state and models sit the key
 * references tenant-credentials.v1 serves for it (name, fingerprint prefix, set time: never a value or the full id). A
 * key whose provider GET /models does not list keeps its own row; Expires and Bound host appear only when a key records
 * one. Revoked keys are the page's key history, not this table.
 */
export function ModelKeys({ client = LIVE_CLIENT, keys = [], empty }: { client?: ModelKeysClient; keys?: readonly CredentialKeyRow[]; empty?: ReactNode }) {
  const [rows, setRows] = useState<ModelProviderRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listOnce(client).then(
      (served) => {
        if (!live) return;
        setRows(ORDER.flatMap((provider) => served.filter((row) => row.provider === provider)));
        setListError(null);
      },
      (error: unknown) => {
        if (!live) return;
        setRows(null);
        setListError(message(error));
      },
    );
    return () => { live = false; };
  }, [client]);

  // Part 18 AC128: the served keys never depend on GET /models. While it loads, or when it cannot be read, they are listed
  // on their own beside the reason.
  const keysAlone = keys.length === 0 ? null : (
    <div className="local-dashboard-table-wrap">
      <table aria-label="Provider key references">
        <thead><tr><th>Provider</th><th>Key ref</th><th>Fingerprint</th><th>Set</th></tr></thead>
        <tbody>{keys.map((key, index) => (
          <tr key={`${String(key.provider)}-${String(key.name)}-${index}`}>
            <td data-label="Provider">{missing(key.provider) ? 'Not recorded' : providerName(key.provider)}</td>
            <td data-label="Key ref">{served(key.name)}</td>
            <td data-label="Fingerprint">{served(key.fingerprint)}</td>
            <td data-label="Set"><KeyTime value={key.set_at} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
  // Revision 3 (AC161): an unread list says so once, with the terminal command that shows the same status.
  if (listError !== null) return (
    <section className="local-model-keys" aria-label="Model providers">
      <SettingsEmptyState icon={<ConceptIcon concept="credentials" label="Model providers" size={16} />} title="Model providers could not be read"
        action={<span className="local-dashboard-caption">See them in your terminal with <code>onex models list</code>.</span>}>{listError}</SettingsEmptyState>
      {keysAlone}
    </section>
  );
  if (rows === null) return <section className="local-model-keys" aria-label="Model providers"><p className="local-dashboard-empty">Reading model providers…</p>{keysAlone}</section>;

  // Revision 3 (AC161): nothing listed and no key recorded is one empty state, never a table of headers.
  if (rows.length === 0 && keys.length === 0 && empty) return <section className="local-model-keys" aria-label="Model providers">{empty}</section>;
  const keysOf = (provider: string) => keys.filter(key => String(key.provider ?? '').toLowerCase() === provider);
  const listed = new Set(rows.map(row => row.provider as string));
  const unlisted = [...new Set(keys.map(key => String(key.provider ?? '').toLowerCase()).filter(provider => !listed.has(provider)))];
  const showExpires = keys.some(key => !missing(key.expires_at));
  const showHost = keys.some(key => !missing(key.bound_host));
  const keyCells = (list: readonly CredentialKeyRow[]) => <>
    <td data-label="Key ref"><KeyCells list={list} field="name" first /></td>
    <td data-label="Fingerprint"><KeyCells list={list} field="fingerprint" /></td>
    <td data-label="Set"><KeyCells list={list} field="set_at" render={value => <KeyTime value={value} />} /></td>
    {showExpires && <td data-label="Expires"><KeyCells list={list} field="expires_at" render={value => (missing(value) ? 'No expiry recorded' : <KeyTime value={value} />)} /></td>}
    {showHost && <td data-label="Bound host"><KeyCells list={list} field="bound_host" /></td>}
  </>;
  return (
    <section className="local-model-keys" aria-label="Model providers">
      <div className="local-dashboard-table-wrap">
        <table aria-label="Model providers">
          <thead><tr><th>Provider</th><th>State</th><th>Models</th><th>Key ref</th><th>Fingerprint</th><th>Set</th>
            {showExpires && <th>Expires</th>}{showHost && <th>Bound host</th>}<th>Set up with</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.provider}>
              <th scope="row">{LABELS[row.provider]}</th>
              <td data-label="State">{stateOf(row)}</td>
              <td data-label="Models">{row.models.length > 0 ? row.models.map((model) => <span key={model} className="mono">{model} </span>) : '—'}</td>
              {keyCells(keysOf(row.provider))}
              <td data-label="Set up with">
                {row.provider === 'ollama' ? OLLAMA_HOW : <span className="mono">{`onex models add ${row.provider}`}</span>}
              </td>
            </tr>
          ))}
          {unlisted.map(provider => (
            <tr key={`unlisted-${provider}`}>
              <th scope="row">{providerName(provider)}</th>
              <td data-label="State">Not listed by onex models</td>
              <td data-label="Models">—</td>
              {keyCells(keysOf(provider))}
              <td data-label="Set up with">—</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="local-dashboard-caption">Keys are added, replaced and removed in the terminal with onex models add and onex models remove; this list only shows them.</p>
      {keys.length > 0 && !showExpires && !showHost && <p className="local-dashboard-caption">No key records an expiry or a bound host.</p>}
      {keys.length > 0 && showExpires && !showHost && <p className="local-dashboard-caption">No key records a bound host.</p>}
      {keys.length > 0 && !showExpires && showHost && <p className="local-dashboard-caption">No key records an expiry.</p>}
    </section>
  );
}
