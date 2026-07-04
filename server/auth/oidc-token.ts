// OMN-13824: OIDC access-token verification + tenant-claim extraction.
//
// The Keycloak realm config that mints the tenant claim is source-controlled
// in deploy/keycloak/ (client scope `tenant` -> claim `tenant_id`). This module
// is the app-side counterpart: verify the RS256 JWT against the realm JWKS and
// extract the tenant claim. Verification config is contract-driven
// (loadAuthConfig in server/data-source-contract.ts) — no env fallbacks here.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthConfig } from '../data-source-contract.js';

/** Verifies a raw bearer token and returns its validated claims. */
export type TokenVerifier = (token: string) => Promise<JWTPayload>;

/**
 * Build a verifier bound to the Keycloak realm issuer. Keys are fetched from
 * the realm JWKS endpoint (`<issuer>/protocol/openid-connect/certs`) and
 * cached by jose between calls.
 */
export function createKeycloakTokenVerifier(config: AuthConfig): TokenVerifier {
  if (!config.issuerUrl) {
    throw new Error(
      'auth.issuer_url must be configured (contract.yaml / contract.local.yaml) when tenant auth is required',
    );
  }
  const issuer = config.issuerUrl.replace(/\/$/, '');
  const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
  return async (token: string): Promise<JWTPayload> => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      ...(config.audience ? { audience: config.audience } : {}),
    });
    return payload;
  };
}

/**
 * Extract the tenant id from verified claims. Returns null when the claim is
 * absent, empty, or not a string — callers must treat null as unauthorized
 * (fail closed), never fall back to a default tenant.
 */
export function extractTenantId(payload: JWTPayload, tenantClaim: string): string | null {
  const value = (payload as Record<string, unknown>)[tenantClaim];
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value;
}
