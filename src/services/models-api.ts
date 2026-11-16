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
  tested_at?: string | null;
  backend_id?: string | null;
  model?: string | null;
  endpoint?: string | null;
  reason?: string | null;
}

export interface ModelProviderRow {
  /** One of the four the server lists (OMN-20816 decision b); the page also renders a name it does not know. */
  provider: ModelProviderId | (string & {});
  set_up: boolean;
  last_test: ModelTest | null;
  models: string[];
  /** Whether routing tries this provider first, and the model it starts with, when the server serves them. */
  tried_first?: boolean | null;
  first_model?: string | null;
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

const TEST_STATUSES: ReadonlySet<string> = new Set(['passed', 'failed', 'not_set_up']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const optionalText = (value: unknown): boolean => value === undefined || value === null || typeof value === 'string';

/** The first field of a served provider row that does not hold what the page reads, or null (OMN-24616 AC5). */
function malformedField(row: unknown): string | null {
  if (!isRecord(row)) return 'row';
  if (typeof row.provider !== 'string' || row.provider === '') return 'provider';
  if (typeof row.set_up !== 'boolean') return 'set_up';
  if (!Array.isArray(row.models) || !row.models.every(model => typeof model === 'string')) return 'models';
  if (!(row.tried_first === undefined || row.tried_first === null || typeof row.tried_first === 'boolean')) return 'tried_first';
  if (!optionalText(row.first_model)) return 'first_model';
  const test = row.last_test;
  if (test === null || test === undefined) return null;
  if (!isRecord(test)) return 'last_test';
  if (typeof test.status !== 'string' || !TEST_STATUSES.has(test.status)) return 'last_test.status';
  if (!optionalText(test.tested_at)) return 'last_test.tested_at';
  for (const field of ['backend_id', 'model', 'endpoint', 'reason'] as const) {
    if (!optionalText(test[field])) return `last_test.${field}`;
  }
  return null;
}

export async function listModelKeys(): Promise<ModelProviderRow[]> {
  const res = await fetchWithTimeout(`${base()}${MODELS_PATH}`);
  const body = await read(res);
  // OMN-21166 revision 3: an answer with no providers list (a page served in its place) is not "no providers".
  if (!isRecord(body) || !Array.isArray(body.providers)) throw new ModelKeysError(res.status, 'bad_response', 'The dashboard did not list model providers.');
  // OMN-24616 AC5: every row is checked, so a malformed one is refused by name instead of rendered as a status.
  body.providers.forEach((row, index) => {
    const field = malformedField(row);
    if (field !== null) {
      throw new ModelKeysError(res.status, 'bad_response', `The dashboard listed provider ${index + 1} with a malformed ${field}.`);
    }
  });
  return body.providers as ModelProviderRow[];
}
