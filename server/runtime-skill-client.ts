import { loadRuntimeEdgeConfig } from './data-source-contract.js';

export interface RuntimeCommandRequest {
  commandName: string;
  payload: object;
  correlationId?: string;
  timeoutMs?: number;
}

export interface RuntimeSkillErrorBody {
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
}

export interface RuntimeSkillResponse {
  ok: boolean;
  command_name: string;
  resolved_node_name?: string;
  contract_name?: string;
  command_topic?: string;
  terminal_event?: string;
  correlation_id?: string;
  output_payloads?: Array<Record<string, unknown>>;
  error?: RuntimeSkillErrorBody;
}

export class RuntimeEdgeError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    message: string,
    options: { code?: string; retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = 'RuntimeEdgeError';
    this.code = options.code ?? 'runtime_edge_error';
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? 503;
  }
}

export interface RuntimeSkillClientDeps {
  fetchImpl?: typeof fetch;
}

function isRuntimeSkillResponse(value: unknown): value is RuntimeSkillResponse {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof (value as { ok?: unknown }).ok === 'boolean'
      && typeof (value as { command_name?: unknown }).command_name === 'string',
  );
}

/**
 * Invoke one contract-declared runtime command through the generic HTTP edge.
 * OmniDash supplies only the command name and typed payload; the runtime owns
 * broker auth, topic resolution, correlation, dispatch, and terminal waiting.
 */
export async function invokeRuntimeCommand(
  request: RuntimeCommandRequest,
  deps: RuntimeSkillClientDeps = {},
): Promise<RuntimeSkillResponse> {
  const config = loadRuntimeEdgeConfig();
  if (!config.url) {
    throw new RuntimeEdgeError(
      'runtime edge is not configured; set runtime_edge.url or OMNIDASH_RUNTIME_EDGE_URL',
      { code: 'runtime_unavailable' },
    );
  }

  const timeoutMs = request.timeoutMs ?? config.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600_000) {
    throw new RuntimeEdgeError(`timeoutMs must be an integer from 1 to 600000, got: ${timeoutMs}`, {
      code: 'validation_error',
      status: 400,
    });
  }

  const body: Record<string, unknown> = {
    command_name: request.commandName,
    payload: request.payload,
    timeout_ms: timeoutMs,
  };
  if (request.correlationId) body.correlation_id = request.correlationId;

  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs + 5_000),
    });
  } catch (error) {
    throw new RuntimeEdgeError(`runtime edge request failed: ${String(error)}`, {
      code: 'runtime_unavailable',
      retryable: true,
    });
  }

  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch (error) {
    throw new RuntimeEdgeError(`runtime edge returned invalid JSON: ${String(error)}`, {
      code: 'invalid_runtime_response',
      status: response.status || 502,
    });
  }

  if (!isRuntimeSkillResponse(decoded)) {
    throw new RuntimeEdgeError('runtime edge returned an invalid response shape', {
      code: 'invalid_runtime_response',
      status: response.status || 502,
    });
  }
  if (!response.ok || !decoded.ok) {
    throw new RuntimeEdgeError(
      decoded.error?.message ?? `runtime command failed with HTTP ${response.status}`,
      {
        code: decoded.error?.code ?? 'dispatch_error',
        retryable: decoded.error?.retryable ?? false,
        status: response.ok ? 503 : response.status,
      },
    );
  }
  return decoded;
}
