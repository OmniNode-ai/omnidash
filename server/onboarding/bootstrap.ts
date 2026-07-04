// OMN-10875: composition root for the self-service onboarding surface.
//
// Wires the contract-driven config (loadOnboardingConfig / loadAuthConfig)
// into the concrete pieces: realm JWKS verifier, Keycloak admin client
// (plan-mode by default — no live realm mutation), the tenants-registry
// Postgres pool (writer role), and the Express router. server/index.ts calls
// this once; tests exercise the underlying factories with injected fakes.

import pg from 'pg';
import type { Router } from 'express';
import type { AuthConfig, OnboardingConfig } from '../data-source-contract.js';
import { createKeycloakTokenVerifier } from '../auth/oidc-token.js';
import { createKeycloakAdminClient } from './keycloak-admin.js';
import { createTenantProvisioner } from './tenant-provisioning.js';
import { createOnboardingRouter } from './onboarding-routes.js';

export function buildOnboardingRouter(
  onboardingConfig: OnboardingConfig,
  authConfig: AuthConfig,
): Router {
  if (!onboardingConfig.enabled) {
    // Disabled surface: 503 responder only — no verifier, no pool, no admin
    // client is constructed.
    return createOnboardingRouter({ enabled: false });
  }

  // The onboarding routes verify bearer tokens themselves (a new user's token
  // has no tenant claim yet, so the tenant middleware cannot gate them).
  // createKeycloakTokenVerifier fails fast when auth.issuer_url is missing.
  const verifier = createKeycloakTokenVerifier(authConfig);

  const issuer = authConfig.issuerUrl.replace(/\/$/, '');
  const keycloak = createKeycloakAdminClient({
    applyMode: onboardingConfig.keycloakApplyMode,
    adminBaseUrl: onboardingConfig.keycloakAdminBaseUrl,
    tokenUrl: `${issuer}/protocol/openid-connect/token`,
    clientId: onboardingConfig.keycloakAdminClientId,
    clientSecret: onboardingConfig.keycloakAdminClientSecret,
  });

  // loadOnboardingConfig guarantees the URL resolves when enabled.
  const pool = new pg.Pool({ connectionString: onboardingConfig.postgresDatabaseUrl as string });
  const provisioner = createTenantProvisioner({ db: pool, keycloak });

  return createOnboardingRouter({ enabled: true, verifier, provisioner });
}
