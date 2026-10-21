/**
 * OMN-20816: client seam for the local dashboard's read-only model provider list.
 *
 * `onex dashboard` serves `GET /models` beside the projection reads, on the same origin and behind the same start
 * token: the status `onex models list` prints, with no key in it. This module owns that path literal and only reads
 * it. Keys change in the terminal (`onex models add|remove`), never through the dashboard (operator ruling on the
 * ticket, 2026-10-21T10:24:32Z), so there is no write here.
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

/** A refusal or failure, carrying the server's own text. */
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

function base(): string {
  const resolved = resolveCommandBaseUrl();
  if (resolved === null) {
    throw new ModelKeysError(0, 'file_mode', 'Model providers are listed on the live local dashboard (onex dashboard), not in file mode.');
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
