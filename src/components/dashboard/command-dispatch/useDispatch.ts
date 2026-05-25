import { useState, useEffect, useCallback } from 'react';

export interface DispatchRequest {
  command_type: 'run-node' | 'cancel';
  target_node_id: string;
  payload: Record<string, unknown>;
}

export interface DispatchResponse {
  request_id: string;
  status: string;
  message?: string;
}

export interface UseDispatchResult {
  dispatch: (req: DispatchRequest) => Promise<DispatchResponse>;
  isDispatching: boolean;
  lastResult: DispatchResponse | null;
  error: string | null;
  isAvailable: boolean;
}

export function useDispatch(): UseDispatchResult {
  const [isDispatching, setIsDispatching] = useState(false);
  const [lastResult, setLastResult] = useState<DispatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dispatch', { method: 'HEAD' })
      .then((res) => {
        if (!cancelled) setIsAvailable(res.ok || res.status !== 503);
      })
      .catch(() => {
        if (!cancelled) setIsAvailable(false);
      });
    return () => { cancelled = true; };
  }, []);

  const dispatch = useCallback(async (req: DispatchRequest): Promise<DispatchResponse> => {
    setIsDispatching(true);
    setError(null);
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Dispatch failed: ${res.status} ${text}`);
      }
      const body = (await res.json() as unknown) as DispatchResponse;
      setLastResult(body);
      return body;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setIsAvailable(false);
      throw err;
    } finally {
      setIsDispatching(false);
    }
  }, []);

  return { dispatch, isDispatching, lastResult, error, isAvailable };
}
