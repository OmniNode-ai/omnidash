/**
 * OMN-20816: add, replace and remove model keys from the Credentials page, after onboarding.
 *
 * The rows are what `GET /models` serves, the same status `onex models list` prints: each of the four providers the
 * page manages, set up or not, and its last pinned test. Adding or replacing a key sends it once, in the request
 * body, with the models the developer chose (first tried first), and shows the one pinned test the server ran. The
 * key field is a password field and is emptied as soon as the request is sent, whatever the answer. Removing asks
 * first, and the server's refusal (the last usable provider) is shown as it said it. Ollama is set up by onboarding,
 * so its row has no key controls. Nothing here decides a state: every word on a row is a served field.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ModelKeysError, listModelKeys, putModelKey, removeModelKey,
  type ModelProviderId, type ModelProviderRow, type ModelTest,
} from '@/services/models-api';

export interface ModelKeysClient {
  list: () => Promise<ModelProviderRow[]>;
  put: (provider: ModelProviderId, key: string, models: readonly string[]) => Promise<ModelTest>;
  remove: (provider: ModelProviderId) => Promise<void>;
}

const LIVE_CLIENT: ModelKeysClient = { list: listModelKeys, put: putModelKey, remove: removeModelKey };

const LABELS: Record<ModelProviderId, string> = { gemini: 'Gemini', openrouter: 'OpenRouter', openai: 'OpenAI', ollama: 'Ollama' };
const ORDER: readonly ModelProviderId[] = ['gemini', 'openrouter', 'openai', 'ollama'];
const OLLAMA_HOW = 'Set up by onboarding (run it again with --provider ollama); no key to add here.';

function stateOf(row: ModelProviderRow): string {
  if (!row.set_up) return 'Not set up';
  const last = row.last_test;
  if (last === null || last.status === 'not_set_up') return 'Set up, not tested yet';
  if (last.status === 'passed') return 'Last test passed';
  return `Last test failed: ${last.reason ?? 'no reason recorded'}`;
}

function message(error: unknown): string {
  return error instanceof ModelKeysError ? error.message : 'The dashboard could not be reached. Nothing was changed.';
}

export function ModelKeys({ client = LIVE_CLIENT }: { client?: ModelKeysClient }) {
  const [rows, setRows] = useState<ModelProviderRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [adding, setAdding] = useState<ModelProviderId | null>(null);
  const [removing, setRemoving] = useState<ModelProviderId | null>(null);
  const [key, setKey] = useState('');
  const [models, setModels] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const served = await client.list();
      setRows(ORDER.flatMap((provider) => served.filter((row) => row.provider === provider)));
      setListError(null);
    } catch (error) {
      setRows(null);
      setListError(message(error));
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (adding === null) return;
    const provider = adding;
    const sent = key;
    const chosen = models.split(',').map((model) => model.trim()).filter((model) => model !== '');
    setKey('');
    setBusy(true);
    setResult(null);
    setRefusal(null);
    try {
      const test = await client.put(provider, sent, chosen);
      setResult(test.status === 'passed'
        ? `${LABELS[provider]} test passed`
        : `${LABELS[provider]} test failed: ${test.reason ?? 'no reason recorded'}`);
      setAdding(null);
      setModels('');
      await load();
    } catch (error) {
      setRefusal(message(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (provider: ModelProviderId) => {
    setBusy(true);
    setResult(null);
    setRefusal(null);
    try {
      await client.remove(provider);
      setResult(`${LABELS[provider]} key removed`);
      await load();
    } catch (error) {
      setRefusal(message(error));
    } finally {
      setRemoving(null);
      setBusy(false);
    }
  };

  if (listError !== null) return <p className="local-dashboard-empty" role="status">{listError}</p>;
  if (rows === null) return <p className="local-dashboard-empty">Reading model providers…</p>;

  return (
    <section className="local-model-keys" aria-label="Model keys">
      <div className="local-dashboard-table-wrap">
        <table aria-label="Model providers">
          <thead><tr><th>Provider</th><th>State</th><th>Models</th><th>Change</th></tr></thead>
          <tbody>{rows.map((row) => {
            const label = LABELS[row.provider];
            return (
              <tr key={row.provider}>
                <th scope="row">{label}</th>
                <td data-label="State">{stateOf(row)}</td>
                <td data-label="Models">{row.models.length > 0 ? row.models.map((model) => <span key={model} className="mono">{model} </span>) : '—'}</td>
                <td data-label="Change">
                  {row.provider === 'ollama' ? OLLAMA_HOW : (
                    <>
                      <button type="button" disabled={busy} onClick={() => { setAdding(row.provider); setRemoving(null); setRefusal(null); }}>
                        {row.set_up ? `Replace ${label} key` : `Add ${label} key`}
                      </button>
                      {row.set_up && (
                        <button type="button" disabled={busy} onClick={() => { setRemoving(row.provider); setAdding(null); setRefusal(null); }}>
                          {`Remove ${label} key`}
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {adding !== null && (
        <form className="local-model-keys-form" onSubmit={(event) => { void submit(event); }}>
          <label>
            {`${LABELS[adding]} API key`}
            <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(event) => setKey(event.target.value)} required />
          </label>
          <label>
            Model id
            <input type="text" autoComplete="off" spellCheck={false} value={models} onChange={(event) => setModels(event.target.value)}
              placeholder="from the provider's model page; separate several with commas" required />
          </label>
          <p className="local-dashboard-caption">The key is sent once, tested with one delegation pinned to {LABELS[adding]}, and never shown again.</p>
          <button type="submit" disabled={busy}>Save and test</button>
          <button type="button" disabled={busy} onClick={() => { setAdding(null); setKey(''); setModels(''); }}>Cancel</button>
        </form>
      )}
      {removing !== null && (
        <div className="local-model-keys-confirm">
          <p>{`Remove the ${LABELS[removing]} key? Delegation stops using ${LABELS[removing]} until a key is added again.`}</p>
          <button type="button" disabled={busy} onClick={() => { void remove(removing); }}>{`Yes, remove the ${LABELS[removing]} key`}</button>
          <button type="button" disabled={busy} onClick={() => setRemoving(null)}>Keep it</button>
        </div>
      )}
      {busy && adding !== null && <p className="local-dashboard-caption">Testing {LABELS[adding]} with one delegation; this can take a few minutes.</p>}
      {result !== null && <p role="status">{result}</p>}
      {refusal !== null && <p role="alert">{refusal}</p>}
    </section>
  );
}
