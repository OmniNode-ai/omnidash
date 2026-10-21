/**
 * OMN-20816: client seam for the local dashboard's model-key routes.
 *
 * `onex dashboard` serves `GET /models`, `PUT /models/{provider}` and `DELETE /models/{provider}` beside the
 * projection reads, on the same origin and behind the same start token, and runs the path `onex models
 * add|list|remove` runs. This module owns those path literals. The key travels only in the PUT body; it is never put
 * in a URL, a thrown message or anything this module returns.
 */
import { fetchWithTimeout } from '@/data-source/fetch-with-timeout';
import { resolveCommandBaseUrl } from '@/data-source/projection-base-url';

export type ModelProviderId = 'gemini' | 'openrouter' | 'openai' | 'ollama';

export interface ModelTest {
  provider: string;
  status: 'passed' | 'failed' | 'not_set_up';
  tested_at: string;
  backend_id?: string | null;
  model?: string | null;
  endpoint?: string | null;
  reason?: string | null;
}

export interface ModelProviderRow {
  provider: ModelProviderId;
  set_up: boolean;
  last_test: ModelTest | null;
  models: string[];
}

/** A refusal or failure, carrying the server's own text (which never holds the key). */
export class ModelKeysError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ModelKeysError';
  }
}

const MODELS_PATH = '/models';
/** One pinned test delegation can take up to five minutes; the add waits for it. */
const ADD_TIMEOUT_MS = 330_000;

function base(): string {
  const resolved = resolveCommandBaseUrl();
  if (resolved === null) {
    throw new ModelKeysError(0, 'file_mode', 'Model keys are managed on the live local dashboard (onex dashboard), not in file mode.');
  }
  return resolved;
}

async function read(res: Response): Promise<unknown> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const fields = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const code = typeof fields.error === 'string' ? fields.error : 'http_error';
    const detail = typeof fields.detail === 'string' ? fields.detail : `The dashboard answered HTTP ${res.status}.`;
    throw new ModelKeysError(res.status, code, detail);
  }
  return body;
}

export async function listModelKeys(): Promise<ModelProviderRow[]> {
  const body = (await read(await fetchWithTimeout(`${base()}${MODELS_PATH}`))) as { providers?: ModelProviderRow[] };
  return Array.isArray(body?.providers) ? body.providers : [];
}

export async function putModelKey(provider: ModelProviderId, key: string, models: readonly string[]): Promise<ModelTest> {
  const res = await fetchWithTimeout(
    `${base()}${MODELS_PATH}/${encodeURIComponent(provider)}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, models }) },
    ADD_TIMEOUT_MS,
  );
  return ((await read(res)) as { test: ModelTest }).test;
}

export async function removeModelKey(provider: ModelProviderId): Promise<void> {
  await read(await fetchWithTimeout(`${base()}${MODELS_PATH}/${encodeURIComponent(provider)}`, { method: 'DELETE' }));
}
