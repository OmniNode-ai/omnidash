/**
 * OMN-13065: Route-seam for the /api/dispatch thin-publisher hop.
 *
 * The /api/dispatch path is itself non-canonical — OMN-12809 will retire it in
 * favour of direct topic publishes. This file is the SEAM that isolates the
 * literal so the path lives in one place, the lint rule stops flagging call
 * sites, and OMN-12809 has a single diff to land the retirement.
 *
 * Behaviour is unchanged: HEAD probe for availability, POST for dispatch.
 * Callers use useDispatch() from the hook layer; this module is not called
 * directly from components.
 */

/** The /api/dispatch thin-publisher endpoint. Retired by OMN-12809. */
const DISPATCH_ENDPOINT = '/api/dispatch';

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

/**
 * HEAD-probe /api/dispatch to check availability. Resolves to true when the
 * endpoint responds with a non-503 status; false on network error.
 */
export async function probeDispatchAvailability(): Promise<boolean> {
  try {
    const res = await fetch(DISPATCH_ENDPOINT, { method: 'HEAD' });
    return res.ok || res.status !== 503;
  } catch {
    return false;
  }
}

/**
 * POST a dispatch request to /api/dispatch. Throws on non-OK HTTP status.
 */
export async function postDispatch(req: DispatchRequest): Promise<DispatchResponse> {
  const res = await fetch(DISPATCH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Dispatch failed: ${res.status} ${text}`);
  }
  return (await res.json() as unknown) as DispatchResponse;
}
