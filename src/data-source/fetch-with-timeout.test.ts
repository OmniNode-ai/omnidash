import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, FetchTimeoutError } from './fetch-with-timeout';

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves normally when fetch completes before the timeout', async () => {
    const response = { ok: true, status: 200 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response));

    const result = await fetchWithTimeout('http://localhost:3002/x', {}, 20_000);

    expect(result).toBe(response);
  });

  it('passes an AbortSignal through to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, status: 200 }));

    await fetchWithTimeout('http://localhost:3002/x');

    expect(fetch).toHaveBeenCalledWith('http://localhost:3002/x', {
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects with FetchTimeoutError when the request never settles within the timeout', async () => {
    vi.useFakeTimers();
    // A fetch mock that honors the AbortSignal, like the real browser fetch does —
    // otherwise the timer fires but nothing ever rejects, and the test hangs.
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })));

    const pending = fetchWithTimeout('http://localhost:3002/slow', {}, 5_000);
    const assertion = expect(pending).rejects.toThrow(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it('propagates non-abort fetch errors unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('connect ECONNREFUSED')));

    await expect(fetchWithTimeout('http://localhost:3002/x')).rejects.toThrow(/ECONNREFUSED/);
  });
});
