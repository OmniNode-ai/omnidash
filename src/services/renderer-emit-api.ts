/**
 * OMN-13131 (W2): client seam for the renderer bus-native command emit path.
 *
 * Every UI action the renderer takes is emitted as a canonical onex.cmd.*
 * command envelope onto the bus via the server thin producer at
 * /api/renderer/emit (server/renderer-command-emitter.ts). This module is the
 * single seam that owns the `/api/renderer/emit` path literal — the
 * `local/no-api-literal` ESLint rule (OMN-13019/13065) requires it to live in
 * src/services/, not at component call sites.
 *
 * The client is transport-only: it forwards the action's contract id, version,
 * identity, and payload. It does not choose a workflow or branch on action type
 * — the capability-driven dispatcher (W4) owns routing downstream.
 */

import { authedFetch } from '@/data-source/authed-fetch';

/** The renderer command emit endpoint (W2). */
const RENDERER_EMIT_ENDPOINT = '/api/renderer/emit';

/** Default renderer identity for the omnidash web client. */
export const DEFAULT_RENDERER_ID = 'omnidash-web';

export interface RendererEmitRequest {
  /** The action contract this emission satisfies (e.g. 'delegation.trigger.v1'). */
  actionContractId: string;
  /** The contract version the renderer rendered against (e.g. 'v1'). */
  contractVersion: string;
  /** The action payload, carried verbatim. */
  payload: Record<string, unknown>;
  /** Optional renderer id; defaults to the omnidash web client. */
  rendererId?: string;
  /** Optional correlation id; the server mints one when absent. */
  correlationId?: string;
  /** Required when this action follows a prior projection/event. */
  causationId?: string;
}

export interface RendererEmitResponse {
  accepted: boolean;
  correlation_id: string;
  causation_id: string | null;
  envelope_id: string;
  topic: string;
}

/**
 * Emit a UI action onto the bus through the server thin producer. Throws on a
 * non-OK HTTP status so the caller can surface the failure to the user.
 */
export async function emitRendererAction(
  req: RendererEmitRequest,
): Promise<RendererEmitResponse> {
  const body: Record<string, unknown> = {
    renderer_id: req.rendererId ?? DEFAULT_RENDERER_ID,
    action_contract_id: req.actionContractId,
    contract_version: req.contractVersion,
    payload: req.payload,
  };
  if (req.correlationId !== undefined) {
    body.correlation_id = req.correlationId;
  }
  if (req.causationId !== undefined) {
    body.causation_id = req.causationId;
  }

  const res = await authedFetch(RENDERER_EMIT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Renderer emit failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json() as unknown) as RendererEmitResponse;
}
