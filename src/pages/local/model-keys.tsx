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
import { useEffect, useState } from 'react';
import { ModelKeysError, listModelKeys, type ModelProviderId, type ModelProviderRow } from '@/services/models-api';

export interface ModelKeysClient {
  list: () => Promise<ModelProviderRow[]>;
}

const LIVE_CLIENT: ModelKeysClient = { list: listModelKeys };

const LABELS: Record<ModelProviderId, string> = { gemini: 'Gemini', openrouter: 'OpenRouter', openai: 'OpenAI', ollama: 'Ollama' };
const ORDER: readonly ModelProviderId[] = ['gemini', 'openrouter', 'openai', 'ollama'];
const OLLAMA_HOW = 'Set up by onboarding (run it again with --provider ollama)';

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

export function ModelKeys({ client = LIVE_CLIENT }: { client?: ModelKeysClient }) {
  const [rows, setRows] = useState<ModelProviderRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    client.list().then(
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

  if (listError !== null) return <p className="local-dashboard-empty" role="status">{listError}</p>;
  if (rows === null) return <p className="local-dashboard-empty">Reading model providers…</p>;

  return (
    <section className="local-model-keys" aria-label="Model providers">
      <div className="local-dashboard-table-wrap">
        <table aria-label="Model providers">
          <thead><tr><th>Provider</th><th>State</th><th>Models</th><th>Set up with</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.provider}>
              <th scope="row">{LABELS[row.provider]}</th>
              <td data-label="State">{stateOf(row)}</td>
              <td data-label="Models">{row.models.length > 0 ? row.models.map((model) => <span key={model} className="mono">{model} </span>) : '—'}</td>
              <td data-label="Set up with">
                {row.provider === 'ollama' ? OLLAMA_HOW : <span className="mono">{`onex models add ${row.provider}`}</span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="local-dashboard-caption">Keys are added, replaced and removed in the terminal with onex models add and onex models remove; this list only shows them.</p>
    </section>
  );
}
