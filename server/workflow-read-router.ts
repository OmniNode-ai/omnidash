import { Router, type Request } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { WorkflowReadConfig } from './data-source-contract.js';

type VerifyToken = (token: string) => Promise<JWTPayload>;

export interface WorkflowReadDeps {
  verifyToken?: VerifyToken;
  fetchImpl?: typeof fetch;
}

function sessionAccessToken(req: Request): string | null {
  const session = (req as Request & { session?: Record<string, unknown> }).session;
  const raw = session?.['keycloak-token'];
  if (typeof raw !== 'string') return null;
  try {
    const grant: unknown = JSON.parse(raw);
    if (typeof grant !== 'object' || grant === null || Array.isArray(grant)) return null;
    const token = (grant as Record<string, unknown>).access_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function canonicalPrincipal(tenantId: string): string | null {
  const match = tenantId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  return match ? `t-${tenantId.replace(/-/g, '').toLowerCase()}` : null;
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Server-only same-origin bridge to the generic workflow ingress. The browser
 * never receives an access token, and the gateway remains the sole authority
 * for workflow authorization, tenant ownership, and topic resolution.
 */
export function createWorkflowReadRouter(config: WorkflowReadConfig, deps: WorkflowReadDeps = {}): Router {
  const router = Router();
  if (!config.enabled) {
    router.post('/api/workflow-reads', (_req, res) => {
      res.status(503).json({ error: 'workflow_reads_disabled' });
    });
    router.get('/api/workflow-reads/:workflowId/result', (_req, res) => {
      res.status(503).json({ error: 'workflow_reads_disabled' });
    });
    return router;
  }

  if (!config.gatewayUrl || !config.issuerUrl || config.audience !== 'onex-api') {
    throw new Error('workflow read bridge requires gateway URL, issuer, and onex-api audience');
  }
  const issuer = config.issuerUrl.replace(/\/$/, '');
  const jwks = deps.verifyToken ? null : createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
  const verifyToken = deps.verifyToken ?? (async (token: string) => {
    const verified = await jwtVerify(token, jwks!, { issuer, audience: config.audience });
    return verified.payload;
  });
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function authorizedSessionToken(req: Request): Promise<
    { token: string } | { status: 401 | 403; error: string }
  > {
    const token = sessionAccessToken(req);
    if (!token || !req.tenant) return { status: 401, error: 'session_required' };
    let claims: JWTPayload;
    try {
      claims = await verifyToken(token);
    } catch {
      return { status: 401, error: 'invalid_session_token' };
    }
    const tenantId = claims.tenant_id;
    const principal = typeof tenantId === 'string' ? canonicalPrincipal(tenantId) : null;
    if (!principal || typeof claims.sub !== 'string' || claims.sub.length === 0
      || tenantId !== req.tenant.tenant_id || claims.sub !== req.tenant.sub
      || (claims.principal_id !== undefined && claims.principal_id !== principal)) {
      return { status: 403, error: 'session_tenant_mismatch' };
    }
    return { token };
  }

  router.post('/api/workflow-reads', (req, res) => {
    void (async () => {
      // A caller's own Authorization header is never forwarded. This route is
      // exclusively for an authenticated confidential-client browser session.
      const session = await authorizedSessionToken(req);
      if (!('token' in session)) {
        res.status(session.status).json({ error: session.error });
        return;
      }
      if (!isRecord(req.body) || Object.keys(req.body).some((key) => !['payload', 'correlation_id'].includes(key))
        || !isRecord(req.body.payload)) {
        res.status(400).json({ error: 'invalid_workflow_read' });
        return;
      }
      const { payload, correlation_id: correlationId } = req.body;
      if (correlationId !== undefined && typeof correlationId !== 'string') {
        res.status(400).json({ error: 'invalid_workflow_read' });
        return;
      }
      let gatewayResponse: Response;
      try {
        gatewayResponse = await fetchImpl(`${config.gatewayUrl}/v1/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({
            workflow_type: config.workflowType,
            payload,
            ...(correlationId === undefined ? {} : { correlation_id: correlationId }),
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        res.status(503).json({ error: 'workflow_gateway_unavailable' });
        return;
      }
      if (!gatewayResponse.ok) {
        res.status(gatewayResponse.status === 401 || gatewayResponse.status === 403 ? gatewayResponse.status : 503)
          .json({ error: 'workflow_gateway_refused' });
        return;
      }
      const result: unknown = await gatewayResponse.json();
      if (!isRecord(result) || !isCanonicalUuid(result.workflow_id)
        || !isCanonicalUuid(result.correlation_id)
        || (correlationId !== undefined && result.correlation_id !== correlationId)) {
        res.status(502).json({ error: 'invalid_workflow_gateway_response' });
        return;
      }
      res.status(202).json({ workflow_id: result.workflow_id, correlation_id: result.correlation_id });
    })().catch(() => {
      res.status(502).json({ error: 'workflow_read_bridge_failed' });
    });
  });

  router.get('/api/workflow-reads/:workflowId/result', (req, res) => {
    void (async () => {
      const session = await authorizedSessionToken(req);
      if (!('token' in session)) {
        res.status(session.status).json({ error: session.error });
        return;
      }
      const workflowId = req.params.workflowId;
      if (!isCanonicalUuid(workflowId)) {
        res.status(400).json({ error: 'invalid_workflow_id' });
        return;
      }
      let gatewayResponse: Response;
      try {
        gatewayResponse = await fetchImpl(`${config.gatewayUrl}/v1/workflows/${workflowId}/result`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${session.token}` },
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        res.status(503).json({ error: 'workflow_gateway_unavailable' });
        return;
      }
      if (gatewayResponse.status === 409) {
        res.status(409).json({ error: 'workflow_result_pending' });
        return;
      }
      if (!gatewayResponse.ok) {
        const status = gatewayResponse.status === 401 || gatewayResponse.status === 403 || gatewayResponse.status === 404
          ? gatewayResponse.status : 503;
        res.status(status).json({ error: status === 404 ? 'workflow_not_found' : 'workflow_gateway_refused' });
        return;
      }
      const result: unknown = await gatewayResponse.json();
      if (!isRecord(result) || result.workflow_id !== workflowId
        || result.workflow_type !== config.workflowType
        || (result.status !== 'completed' && result.status !== 'failed')
        || (isRecord(result.result) === isRecord(result.refusal))) {
        res.status(502).json({ error: 'invalid_workflow_gateway_response' });
        return;
      }
      res.status(200).json(result);
    })().catch(() => {
      res.status(502).json({ error: 'workflow_read_bridge_failed' });
    });
  });
  return router;
}
