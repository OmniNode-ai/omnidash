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
import { ChevronRight } from '@/theme/design-system/icons';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { SettingsEmptyState } from '@/components/dashboard/SettingsEmptyState';
import { readableTime } from '@/theme/format';
import { ModelKeysError, listModelKeys, type ModelProviderId, type ModelProviderRow } from '@/services/models-api';
import { Badge, DataTable, EmptyState, Fact, FactList } from '@/theme/design-system/components';

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
      <FactList look="provider-inline">
        <Fact term="Fingerprint" valueClassName="mono">{served(key.fingerprint)}</Fact>
        <Fact term="Set"><KeyTime value={key.set_at} /></Fact>
        <Fact term="Last used"><LastUsed value={key.last_used_at} /></Fact>
        {!missing(key.expires_at) && <Fact term="Expires"><KeyTime value={key.expires_at} /></Fact>}
        {!missing(key.bound_host) && <Fact term="Bound host" valueClassName="mono">{String(key.bound_host)}</Fact>}
      </FactList>
    </li>
  ))}</ul>;
}

/** The served time's date alone ("Oct 29"), for a provider's one-line summary; the full time is in its details. */
function shortDate(value: unknown): string | null {
  if (missing(value)) return null;
  const readable = readableTime(String(value));
  return readable === null ? null : readable.split(',')[0];
}

/**
 * OMN-21970 AC10 (Lakshman 2026-11-02, "yes best way", after reading how leading AI products list providers): one slim
 * row per provider that opens to its details, as OpenRouter's and Vercel's provider lists do. The row says, at a glance,
 * the provider's status, model count, key fingerprint and last test date; the details hold every served test field, the
 * full error behind its own disclosure, the models, the keys with Last used (OMN-19996) and the set-up command. Every
 * value is served by GET /models or tenant-credentials.v1, and a null one is left out. The row opens with a native
 * disclosure, so the page still has no button, form or input (OMN-20816).
 */
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
  const setup = command === null ? <>{OLLAMA_HOW}</> : <>Set up with <code className="mono">{command}</code></>;
  const testedOn = tested ? shortDate(last.tested_at) : null;
  const firstKey = keys.find(key => !missing(key.fingerprint));
  return <article className="local-provider-row" aria-label={name} data-tone={status.tone}>
    <details className="local-provider-disclosure">
      <summary className="local-provider-line">
        <span className="local-provider-cell local-provider-cell--name">
          <h3 className="local-provider-name">{name}</h3>
          <span className="local-provider-id mono">{String(row.provider)}</span>
        </span>
        <span className="local-provider-cell local-provider-cell--status">
          <span className="local-provider-status" data-tone={status.tone}><span className="local-provider-dot" aria-hidden="true" />{status.text}</span>
          {row.tried_first === true && <Badge look="provider">
            {missing(row.first_model) ? 'Tried first' : `Tried first · ${String(row.first_model)}`}</Badge>}
        </span>
        {listed && !row.set_up
          ? <span className="local-provider-cell local-provider-cell--setup">{setup}</span>
          : <>
            <span className="local-provider-cell local-provider-cell--figure" data-label="Models">
              {listed && row.models.length > 0 ? <><strong>{row.models.length}</strong><small>{row.models.length === 1 ? 'model' : 'models'}</small></> : <small>None listed</small>}
            </span>
            <span className="local-provider-cell local-provider-cell--key mono" data-label="Key">
              {firstKey ? `${String(firstKey.fingerprint)}${keys.length > 1 ? ` +${keys.length - 1}` : ''}` : '—'}
            </span>
            <span className="local-provider-cell local-provider-cell--tested" data-label="Last test">{testedOn ? `Tested ${testedOn}` : 'Not tested'}</span>
          </>}
        <ChevronRight className="local-provider-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="local-provider-detail">
        {facts.length > 0 && <FactList look="provider">{facts.map(([label, value, mono]) => (
          <Fact term={label} key={label} valueClassName={mono ? 'mono' : undefined}>{value}</Fact>
        ))}</FactList>}
        {reason !== null && <details className="local-provider-error">
          <summary>Show the full error</summary>
          <pre>{reason}</pre>
        </details>}
        <div className="local-provider-columns">
          {listed && <section className="local-provider-block" aria-label={`${name} model list`}>
            <h4>{`Models${row.models.length > 0 ? ` (${row.models.length})` : ''}`}</h4>
            <ModelList provider={name} models={row.models} />
          </section>}
          <section className="local-provider-block" aria-label={`${name} key list`}>
            <h4>Keys</h4>
            <KeyList provider={name} list={keys} />
          </section>
        </div>
        {listed && row.set_up && <p className="local-provider-setup">{setup}</p>}
      </div>
    </details>
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
    <DataTable aria-label="Provider key references">
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
    </DataTable>
  );
  // Revision 3 (AC161): an unread list says so once, with the terminal command that shows the same status.
  // OMN-23330 AC3 (live 2026-11-10: the notice sat above the two served keys): the notice is the section's statement only
  // when no provider row is served. With keys served, their table comes first and the unread list is one line below it.
  if (listError !== null && keysAlone === null) return (
    <section className="local-model-keys" aria-label="Model providers">
      <SettingsEmptyState icon={<ConceptIcon concept="credentials" label="Model providers" size={16} />} title="Model providers could not be read"
        action={<span className="local-dashboard-caption">See them in your terminal with <code>onex models list</code>.</span>}>{listError}</SettingsEmptyState>
    </section>
  );
  if (listError !== null) return (
    <section className="local-model-keys" aria-label="Model providers">
      {keysAlone}
      <p className="local-dashboard-caption">Each provider&apos;s status and models could not be read: <span>{listError}</span> See them in
        your terminal with <code>onex models list</code>.</p>
    </section>
  );
  if (rows === null) return <section className="local-model-keys" aria-label="Model providers"><EmptyState status={false}>Reading model providers…</EmptyState>{keysAlone}</section>;

  // Revision 3 (AC161): nothing listed and no key recorded is one empty state, never a table of headers.
  if (rows.length === 0 && keys.length === 0 && empty) return <section className="local-model-keys" aria-label="Model providers">{empty}</section>;
  const keysOf = (provider: string) => keys.filter(key => String(key.provider ?? '').toLowerCase() === provider);
  const listed = new Set(rows.map(row => row.provider as string));
  const unlisted = [...new Set(keys.map(key => String(key.provider ?? '').toLowerCase()).filter(provider => !listed.has(provider)))];
  const showExpires = keys.some(key => !missing(key.expires_at));
  const showHost = keys.some(key => !missing(key.bound_host));
  return (
    <section className="local-model-keys" aria-label="Model providers">
      <FactList look="provider-figures">
        {/* Overview's headline cards (Lakshman 2026-11-05, "full platform uniform"): each figure in its concept colour. */}
        <Fact data-field-tone="pass" term={<><ConceptIcon concept="pass" label="Passed their last test" size={14} />Passed their last test</>}><strong>{rows.filter(row => row.last_test?.status === 'passed').length}</strong><small>{`of ${rows.length} providers`}</small></Fact>
        <Fact data-field-tone="contract" term={<><ConceptIcon concept="contract" label="Set up" size={14} />Set up</>}><strong>{rows.filter(row => row.set_up).length}</strong><small>{`of ${rows.length} providers`}</small></Fact>
        <Fact data-field-tone="cloud-keys" term={<><ConceptIcon concept="cloud-keys" label="Keys in use" size={14} />Keys in use</>}><strong>{keys.length}</strong><small>{keys.length === 1 ? 'key' : 'keys'}</small></Fact>
        <Fact data-field-tone="model" term={<><ConceptIcon concept="model" label="Models listed" size={14} />Models listed</>}><strong>{rows.reduce((sum, row) => sum + row.models.length, 0)}</strong><small>across providers</small></Fact>
      </FactList>
      <div className="local-provider-list">
        <div className="local-provider-head-band" aria-hidden="true">
          {/* Headers as every table writes them: glyph and colour per column (Lakshman 2026-11-05). */}
          {([['backend', 'Provider'], ['run-outcome', 'Status'], ['model', 'Models'], ['cloud-keys', 'Key'], ['age', 'Last test']] as const).map(([concept, label]) =>
            <span key={label} className="local-table-head" data-field-tone={concept}><ConceptIcon concept={concept} label={label} size={13} />{label}</span>)}<span />
        </div>
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
