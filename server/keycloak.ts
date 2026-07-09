// keycloak-connect is CJS; the default export is the constructor.
import KeycloakConnect from 'keycloak-connect';
import { decodeJwt } from 'jose';
import type { Request } from 'express';
import type { TenantContext } from './auth-middleware.js';

function realm(): string {
  // KEYCLOAK_ISSUER = https://auth.omninode.ai/realms/omninode
  const issuer = process.env.KEYCLOAK_ISSUER ?? '';
  const match = issuer.match(/\/realms\/([^/]+)/);
  return match?.[1] ?? 'omninode';
}

function authServerUrl(): string {
  const issuer = process.env.KEYCLOAK_ISSUER ?? '';
  // Strip the /realms/... suffix to get the base Keycloak URL.
  return issuer.replace(/\/realms\/.*$/, '') || 'https://auth.omninode.ai';
}

function clientId(): string {
  return process.env.KEYCLOAK_CLIENT_ID ?? 'omnidash';
}

let _keycloak: InstanceType<typeof KeycloakConnect> | null = null;

export function getKeycloak(store?: Parameters<typeof KeycloakConnect>[0]['store']) {
  if (!_keycloak) {
    _keycloak = new KeycloakConnect(
      { store },
      {
        realm: realm(),
        'auth-server-url': authServerUrl(),
        resource: clientId(),
        'ssl-required': 'external',
        'confidential-port': 0,
      },
    );
  }
  return _keycloak;
}

/**
 * Extract tenant context from a session-stored Keycloak token.
 * Returns null if the session has no token or the token is missing tenant_id.
 */
export function tenantFromSession(req: Request): TenantContext | null {
  const session = (req as Request & { session?: Record<string, unknown> }).session;
  if (!session) return null;

  // keycloak-connect stores the serialised grant under 'keycloak-token'.
  const raw = session['keycloak-token'];
  if (typeof raw !== 'string') return null;

  try {
    // The grant is stored as JSON: { access_token: '<jwt>', ... }
    const grant = JSON.parse(raw) as { access_token?: string };
    const jwt = grant.access_token;
    if (!jwt) return null;

    const payload = decodeJwt(jwt);

    // Fail-closed on exp: reject if exp is missing, non-numeric, or in the past.
    // decodeJwt() does not verify signature (token obtained server-side via
    // confidential client back-channel; Keycloak verified at issuance; stored in
    // a SESSION_SECRET-signed Redis session). Expiry must be enforced locally;
    // a token with no numeric exp claim is not trusted.
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;

    const tenant_id = payload['tenant_id'] as string | undefined;
    if (!tenant_id) return null;

    const extractRoles = (): string[] => {
      const realm_roles = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
      const client_roles =
        (payload.resource_access as Record<string, { roles?: string[] }> | undefined)?.[
          clientId()
        ]?.roles ?? [];
      return [...new Set([...realm_roles, ...client_roles])];
    };

    return {
      tenant_id,
      tenant_slug: (payload['tenant_slug'] as string | undefined) ?? '',
      sub: payload.sub ?? '',
      roles: extractRoles(),
    };
  } catch {
    return null;
  }
}
