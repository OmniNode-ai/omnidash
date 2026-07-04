// OMN-10875: self-service onboarding HTTP surface.
//
//   POST /api/onboarding/provision  — idempotently provision the caller's tenant
//   GET  /api/onboarding/me         — provisioning status for the caller
//
// Auth posture: these routes are mounted BEFORE the tenant middleware
// (server/index.ts) because a brand-new user's token has NO tenant claim yet —
// the tenant gate would 403 exactly the users onboarding exists for. The
// routes are NOT unauthenticated: they verify the bearer token against the
// realm JWKS themselves (same verifier as the tenant gate) and key everything
// on the verified `sub`. What they relax is only the tenant-claim requirement.
//
// Fail-closed: onboarding ships disabled (onboarding.enabled: "false" in
// contract.yaml). When disabled every endpoint returns 503 and no provisioner
// or verifier is even constructed.

import { Router, type Request, type Response } from 'express';
import type { JWTPayload } from 'jose';
import type { TokenVerifier } from '../auth/oidc-token.js';
import type { ProvisionResult, TenantProvisioner, TenantRecord } from './tenant-provisioning.js';

export interface OnboardingRouterOptions {
  enabled: boolean;
  /** Required when enabled. */
  verifier?: TokenVerifier;
  /** Required when enabled. */
  provisioner?: TenantProvisioner;
}

const MAX_SLUG_INPUT = 64;
const MAX_DISPLAY_NAME_INPUT = 120;

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

function tenantWire(tenant: TenantRecord) {
  return {
    tenant_id: tenant.tenantId,
    tenant_slug: tenant.tenantSlug,
    principal_id: tenant.principalId,
    display_name: tenant.displayName,
    status: tenant.status,
    created_at: tenant.createdAt,
  };
}

function provisionWire(result: ProvisionResult) {
  return {
    outcome: result.outcome,
    tenant: tenantWire(result.tenant),
    keycloak: {
      applied: result.keycloak.applied,
      plan: result.keycloak.plan,
    },
    credentials: result.credentials,
  };
}

export function createOnboardingRouter(options: OnboardingRouterOptions): Router {
  const router = Router();

  if (!options.enabled) {
    router.use('/api/onboarding', (_req, res) => {
      res.status(503).json({ error: 'self-service onboarding is disabled (onboarding.enabled)' });
    });
    return router;
  }

  const { verifier, provisioner } = options;
  if (!verifier || !provisioner) {
    // Construction-time contract: a misconfigured onboarding surface must
    // never boot half-wired.
    throw new Error('onboarding enabled requires both a token verifier and a provisioner');
  }

  async function authenticate(req: Request, res: Response): Promise<JWTPayload | null> {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'missing bearer token' });
      return null;
    }
    let payload: JWTPayload;
    try {
      payload = await verifier!(token);
    } catch {
      res.status(401).json({ error: 'invalid bearer token' });
      return null;
    }
    if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
      res.status(401).json({ error: 'token missing subject' });
      return null;
    }
    return payload;
  }

  router.get('/api/onboarding/me', (req, res) => {
    void (async () => {
      const payload = await authenticate(req, res);
      if (!payload) return;
      const tenant = await provisioner!.lookup(payload.sub as string);
      res.json({
        subject: payload.sub,
        provisioned: tenant !== null,
        tenant: tenant ? tenantWire(tenant) : null,
      });
    })().catch(() => {
      res.status(500).json({ error: 'onboarding lookup failed' });
    });
  });

  router.post('/api/onboarding/provision', (req, res) => {
    void (async () => {
      const payload = await authenticate(req, res);
      if (!payload) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const requestedSlug = body.requested_slug;
      const displayName = body.display_name;
      if (requestedSlug !== undefined
        && (typeof requestedSlug !== 'string' || requestedSlug.length > MAX_SLUG_INPUT)) {
        res.status(400).json({ error: `requested_slug must be a string of <= ${MAX_SLUG_INPUT} chars` });
        return;
      }
      if (displayName !== undefined
        && (typeof displayName !== 'string' || displayName.length > MAX_DISPLAY_NAME_INPUT)) {
        res.status(400).json({ error: `display_name must be a string of <= ${MAX_DISPLAY_NAME_INPUT} chars` });
        return;
      }

      const result = await provisioner!.provision({
        subject: payload.sub as string,
        email: typeof payload.email === 'string' ? payload.email : null,
        requestedSlug: (requestedSlug as string | undefined) ?? null,
        displayName: (displayName as string | undefined) ?? null,
      });

      res.status(result.outcome === 'created' ? 201 : 200).json(provisionWire(result));
    })().catch((err: unknown) => {
      console.error('[onboarding] provision failed:', err);
      res.status(500).json({ error: 'tenant provisioning failed' });
    });
  });

  return router;
}
