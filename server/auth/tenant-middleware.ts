// OMN-13824 / OMN-1636: Express middleware that authenticates the request's
// bearer token and threads the tenant identity into the async request context.
//
// Modes (contract-driven, auth.tenant_mode):
//   - disabled (default): pass-through, no tenant context. Preserves current
//     single-tenant behavior; the Postgres reader runs unscoped exactly as
//     before. This is the rollout-safe default until the Keycloak realm carries
//     the tenant claim (deploy/keycloak/ APPLY PLAN).
//   - required: every non-OPTIONS request must present a valid Keycloak-issued
//     bearer token whose tenant claim is non-empty. Missing/invalid token ->
//     401; verified token without tenant claim -> 403. No default-tenant
//     fallback (fail closed).

import type { Request, RequestHandler } from 'express';
import type { AuthConfig } from '../data-source-contract.js';
import { createKeycloakTokenVerifier, extractTenantId, type TokenVerifier } from './oidc-token.js';
import { runWithTenantContext } from './tenant-context.js';

export interface TenantMiddlewareOptions {
  config: AuthConfig;
  /** Injectable for tests; defaults to the Keycloak JWKS verifier. */
  verifier?: TokenVerifier;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

export function createTenantMiddleware(options: TenantMiddlewareOptions): RequestHandler {
  const { config } = options;

  if (config.tenantMode === 'disabled') {
    return (_req, _res, next) => next();
  }

  // Fail fast at construction, not first-request time.
  const verifier = options.verifier ?? createKeycloakTokenVerifier(config);

  return (req, res, next) => {
    // CORS preflights carry no Authorization header by design.
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'missing bearer token' });
      return;
    }

    verifier(token).then(
      (payload) => {
        const tenantId = extractTenantId(payload, config.tenantClaim);
        if (!tenantId) {
          res.status(403).json({ error: `token missing tenant claim '${config.tenantClaim}'` });
          return;
        }
        const subject = typeof payload.sub === 'string' ? payload.sub : null;
        // next() is invoked inside run() so the whole downstream async chain
        // (route handlers, pg queries) observes the tenant context.
        runWithTenantContext({ tenantId, subject }, () => next());
      },
      () => {
        // Signature/issuer/audience/expiry failure. Do not leak verifier detail.
        res.status(401).json({ error: 'invalid bearer token' });
      },
    );
  };
}
