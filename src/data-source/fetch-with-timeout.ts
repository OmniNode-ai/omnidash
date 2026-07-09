/**
 * OMN-14152: plain `fetch()` never times out on its own — a stalled TCP
 * connection (e.g. a lossy/relayed network path) leaves the promise pending
 * forever. Every projection read went through bare `fetch()` with no bound,
 * so a widget backed by a slow topic showed "Loading..." indefinitely: the
 * existing error-state UI (ProjectionContainer's InlineErrorState, etc.)
 * never got a chance to fire because no error — and no timeout — ever
 * arrived.
 *
 * This wraps `fetch()` with an AbortController-driven timeout so a stalled
 * request eventually rejects with a clear, user-facing message instead of
 * hanging the widget (or, if a caller awaits it before rendering anything,
 * the page) forever.
 */
export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
  }
}

/** Default bound for a single projection read. Generous for a genuinely slow
 * connection; still short enough that a widget surfaces a retry-able error
 * within the session rather than spinning indefinitely. */
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
