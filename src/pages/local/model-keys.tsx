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

/** OMN-19996 AC2: the served last time a key was used in a run, read like Set; a key never used, or a row from a server
 * older than the column, reads Never. */
function LastUsed({ value }: { value: unknown }) {
  return missing(value) ? <>Never</> : <KeyTime value={value} />;
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

type StatusTone = 'pass' | 'fail' | 'idle' | 'off';

/** OMN-21970 AC10: the failure class is the served reason's text before its first colon ("timeout: ..." is timeout). */
function failureClass(reason: string | null | undefined): string | null {
  if (missing(reason)) return null;
  const head = String(reason).split(':')[0].trim();
  return head === '' || head.length > 40 ? null : head;
}

function statusOf(row: ModelProviderRow): { text: string; tone: StatusTone } {
  if (!row.set_up) return { text: 'Not set up', tone: 'off' };
  const last = row.last_test;
  if (last === null || last.status === 'not_set_up') return { text: 'Set up, not tested yet', tone: 'idle' };
  if (last.status === 'passed') return { text: 'Last test passed', tone: 'pass' };
  const cause = failureClass(last.reason);
  return { text: cause === null ? 'Last test failed' : `Last test failed · ${cause}`, tone: 'fail' };
}

const MODELS_SHOWN = 3;

/** The first three models, and the rest behind one closed disclosure, so an 18-model list never runs on. */
function ModelList({ provider, models }: { provider: string; models: readonly string[] }) {
  if (models.length === 0) return <p className="local-provider-empty">No models listed</p>;
  const rest = models.slice(MODELS_SHOWN);
  return <div className="local-provider-models">
    <ul aria-label={`${provider} models`} className="local-provider-chips">
      {models.slice(0, MODELS_SHOWN).map(model => <li key={model} className="mono">{model}</li>)}
    </ul>
    {rest.length > 0 && <details className="local-provider-more">
      <summary>{`+${rest.length} more`}</summary>
      <ul className="local-provider-chips">{rest.map(model => <li key={model} className="mono">{model}</li>)}</ul>
    </details>}
  </div>;
}

/** A provider's keys as a short list of facts: name, fingerprint prefix, set time, Last used (OMN-19996), and Expires
 * and Bound host only when a key records one. Never a value or the full key reference id. */
function KeyList({ provider, list }: { provider: string; list: readonly CredentialKeyRow[] }) {
  if (list.length === 0) return <p className="local-provider-empty">No key</p>;
  return <ul aria-label={`${provider} keys`} className="local-provider-keys">{list.map((key, index) => (
    <li key={`${String(key.name)}-${index}`}>
      <span className="local-provider-key-name mono">{served(key.name)}</span>
      <dl className="local-provider-facts local-provider-facts--inline">
        <div><dt>Fingerprint</dt><dd className="mono">{served(key.fingerprint)}</dd></div>
        <div><dt>Set</dt><dd><KeyTime value={key.set_at} /></dd></div>
        <div><dt>Last used</dt><dd><LastUsed value={key.last_used_at} /></dd></div>
        {!missing(key.expires_at) && <div><dt>Expires</dt><dd><KeyTime value={key.expires_at} /></dd></div>}
        {!missing(key.bound_host) && <div><dt>Bound host</dt><dd className="mono">{String(key.bound_host)}</dd></div>}
      </dl>
    </li>
  ))}</ul>;
}

/** One card per provider: every field below is served by GET /models or tenant-credentials.v1, and a null one is left out. */
function ProviderCard({ row, keys, listed = true }: { row: ModelProviderRow; keys: readonly CredentialKeyRow[]; listed?: boolean }) {
  const name = providerName(row.provider);
  const status = listed ? statusOf(row) : { text: 'Not listed by onex models', tone: 'off' as StatusTone };
  const last = row.last_test;
  const tested = last !== null && last.status !== 'not_set_up';
  const facts: Array<[string, ReactNode, boolean?]> = [];
  if (tested && !missing(last.tested_at)) facts.push(['Last test', <KeyTime key="t" value={last.tested_at} />]);
  if (tested && !missing(last.model)) facts.push(['Tested model', String(last.model), true]);
  if (tested && !missing(last.backend_id)) facts.push(['Backend', String(last.backend_id), true]);
  if (tested && !missing(last.endpoint)) facts.push(['Endpoint', String(last.endpoint), true]);
  const reason = last?.status === 'failed' && !missing(last.reason) ? String(last.reason) : null;
  const command = row.provider === 'ollama' ? null : `onex models add ${row.provider}`;
  return <article className="local-provider-card" aria-label={name} data-tone={status.tone}>
    <header className="local-provider-head">
      <h3>{name}</h3>
      <span className="local-provider-status" data-tone={status.tone}>{status.text}</span>
      {row.tried_first === true && <span className="local-provider-badge">
        {missing(row.first_model) ? 'Tried first' : `Tried first · ${String(row.first_model)}`}</span>}
    </header>
    {facts.length > 0 && <dl className="local-provider-facts">{facts.map(([label, value, mono]) => (
      <div key={label}><dt>{label}</dt><dd className={mono ? 'mono' : undefined}>{value}</dd></div>
    ))}</dl>}
    {reason !== null && <details className="local-provider-error">
      <summary>Show the full error</summary>
      <pre>{reason}</pre>
    </details>}
    {listed && <section className="local-provider-block" aria-label={`${name} model list`}>
      <h4>{`Models${row.models.length > 0 ? ` (${row.models.length})` : ''}`}</h4>
      <ModelList provider={name} models={row.models} />
    </section>}
    <section className="local-provider-block" aria-label={`${name} key list`}>
      <h4>Keys</h4>
      <KeyList provider={name} list={keys} />
    </section>
    {listed && <p className="local-provider-setup">
      {command === null ? OLLAMA_HOW : <>Set up with <code className="mono">{command}</code></>}
    </p>}
  </article>;
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
        // The four in their fixed order, then any name the page does not know in the served order (OMN-21970 AC10).
        const known = ORDER.flatMap((provider) => served.filter((row) => row.provider === provider));
        setRows([...known, ...served.filter((row) => !(ORDER as readonly string[]).includes(String(row.provider)))]);
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
        <thead><tr><th>Provider</th><th>Key ref</th><th>Fingerprint</th><th>Set</th><th>Last used</th></tr></thead>
        <tbody>{keys.map((key, index) => (
          <tr key={`${String(key.provider)}-${String(key.name)}-${index}`}>
            <td data-label="Provider">{missing(key.provider) ? 'Not recorded' : providerName(key.provider)}</td>
            <td data-label="Key ref">{served(key.name)}</td>
            <td data-label="Fingerprint">{served(key.fingerprint)}</td>
            <td data-label="Set"><KeyTime value={key.set_at} /></td>
            <td data-label="Last used"><LastUsed value={key.last_used_at} /></td>
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
  return (
    <section className="local-model-keys" aria-label="Model providers">
      <div className="local-provider-grid">
        {rows.map((row) => <ProviderCard key={String(row.provider)} row={row} keys={keysOf(String(row.provider))} />)}
        {unlisted.map(provider => <ProviderCard key={`unlisted-${provider}`} listed={false} keys={keysOf(provider)}
          row={{ provider, set_up: false, last_test: null, models: [] }} />)}
      </div>
      <p className="local-dashboard-caption">Keys are added, replaced and removed in the terminal with onex models add and onex models remove; this page only shows them.</p>
      {keys.length > 0 && !showExpires && !showHost && <p className="local-dashboard-caption">No key records an expiry or a bound host.</p>}
      {keys.length > 0 && showExpires && !showHost && <p className="local-dashboard-caption">No key records a bound host.</p>}
      {keys.length > 0 && !showExpires && showHost && <p className="local-dashboard-caption">No key records an expiry.</p>}
    </section>
  );
}
