import { fetchWithTimeout } from './fetch-with-timeout';

export async function authedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  return fetchWithTimeout(url, init, timeoutMs);
}
