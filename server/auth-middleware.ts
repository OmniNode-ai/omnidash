import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import { tenantFromSession } from './keycloak.js';

export interface TenantContext {
  tenant_id: string;
  tenant_slug: string;
  sub: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

// Read env vars lazily so tests can set them in beforeEach without module reload.
function issuer() { return process.env.KEYCLOAK_ISSUER ?? ''; }
function clientId() { return process.env.KEYCLOAK_CLIENT_ID ?? 'omnidash'; }

// JWKS set is cached after first successful creation — jose internally caches
// key material so subsequent calls are cheap. Cache is keyed on the issuer URL
// so a KEYCLOAK_ISSUER change (test env reset) picks up a fresh set.
let _jwksCache: { url: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;
function jwks() {
  const url = `${issuer()}/protocol/openid-connect/certs`;
  if (!_jwksCache || _jwksCache.url !== url) {
    _jwksCache = { url, set: createRemoteJWKSet(new URL(url)) };
  }
  return _jwksCache.set;
}

function extractRoles(payload: Record<string, unknown>): string[] {
  const realm = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
  const client = (payload.resource_access as Record<string, { roles?: string[] }> | undefined)?.[clientId()]?.roles ?? [];
  return [...new Set([...realm, ...client])];
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Path 1: Browser session (cookie-based, set by keycloak-connect after login).
  // Primary path for human users visiting dash.omninode.ai.
  const sessionTenant = tenantFromSession(req);
  if (sessionTenant) {
    req.tenant = sessionTenant;
    return next();
  }

  // Path 2: Bearer token — for API clients / machine-to-machine calls.
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', detail: 'Session or Bearer token required' });
    return;
  }

  const token = header.slice(7);

  try {
    const { payload } = await jwtVerify(token, jwks(), { issuer: issuer() });

    const tenant_id = payload['tenant_id'] as string | undefined;
    if (!tenant_id) {
      res.status(403).json({ error: 'forbidden', detail: 'Token missing tenant_id claim' });
      return;
    }

    req.tenant = {
      tenant_id,
      tenant_slug: (payload['tenant_slug'] as string | undefined) ?? '',
      sub: payload.sub ?? '',
      roles: extractRoles(payload as Record<string, unknown>),
    };

    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', detail: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant?.roles.includes('admin')) {
    res.status(403).json({ error: 'forbidden', detail: 'Admin role required' });
    return;
  }
  next();
}
