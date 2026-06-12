import { useState, useEffect, useCallback } from 'react';
import {
  probeDispatchAvailability,
  postDispatch,
  type DispatchRequest,
  type DispatchResponse,
} from '@/services/dispatch-api';

export type { DispatchRequest, DispatchResponse };

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
    void probeDispatchAvailability().then((available) => {
      if (!cancelled) setIsAvailable(available);
    });
    return () => { cancelled = true; };
  }, []);

  const dispatch = useCallback(async (req: DispatchRequest): Promise<DispatchResponse> => {
    setIsDispatching(true);
    setError(null);
    try {
      const body = await postDispatch(req);
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
