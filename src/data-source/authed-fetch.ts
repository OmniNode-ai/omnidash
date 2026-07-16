import { fetchWithTimeout } from './fetch-with-timeout';
import { getToken } from '../auth/token-store';

export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) return fetchWithTimeout(url, init);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetchWithTimeout(url, {
    ...init,
    headers,
  });
}
