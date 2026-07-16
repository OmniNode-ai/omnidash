import { fetchWithTimeout } from './fetch-with-timeout';
import { getToken } from '../auth/token-store';

export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) return fetchWithTimeout(url, init);
  const existing = (init.headers ?? {}) as Record<string, string>;
  return fetchWithTimeout(url, {
    ...init,
    headers: { ...existing, Authorization: `Bearer ${token}` },
  });
}
