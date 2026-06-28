/**
 * OMN-12809: Migrated from /api/dispatch (generic router-hop) to the canonical
 * /api/renderer/emit thin-publisher. Each command_type maps to a declared
 * action_contract_id published on onex.cmd.omnidash.renderer-action.v1; the
 * capability-driven dispatcher (W4) routes downstream — the renderer never
 * chooses a target node.
 */
import { useState, useCallback } from 'react';
import {
  emitRendererAction,
  type RendererEmitResponse,
} from '@/services/renderer-emit-api';

export interface DispatchRequest {
  command_type: 'run-node' | 'cancel';
  target_node_id: string;
  payload: Record<string, unknown>;
}

export type DispatchResponse = RendererEmitResponse;

export interface UseDispatchResult {
  dispatch: (req: DispatchRequest) => Promise<DispatchResponse>;
  isDispatching: boolean;
  lastResult: DispatchResponse | null;
  error: string | null;
}

/** Per-command action contract ids for the renderer thin-publish path. */
const COMMAND_CONTRACT_ID: Record<'run-node' | 'cancel', string> = {
  'run-node': 'node.run-node.v1',
  cancel: 'node.cancel.v1',
};

export function useDispatch(): UseDispatchResult {
  const [isDispatching, setIsDispatching] = useState(false);
  const [lastResult, setLastResult] = useState<DispatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback(async (req: DispatchRequest): Promise<DispatchResponse> => {
    setIsDispatching(true);
    setError(null);
    try {
      const body = await emitRendererAction({
        actionContractId: COMMAND_CONTRACT_ID[req.command_type],
        contractVersion: 'v1',
        payload: { target_node_id: req.target_node_id, ...req.payload },
      });
      setLastResult(body);
      return body;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      throw err;
    } finally {
      setIsDispatching(false);
    }
  }, []);

  return { dispatch, isDispatching, lastResult, error };
}
