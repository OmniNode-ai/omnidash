/**
 * OMN-10875: client seam for the self-service onboarding backend.
 *
 * Owns the `/api/onboarding/*` path literals (the `local/no-api-literal`
 * ESLint rule requires them to live in src/services/). This is the flow's
 * UI entry point: once the Vite app carries the Keycloak OIDC session (the
 * operator-gated OMN-13824 remainder), the post-login shell calls
 * `provisionTenant` automatically for any session whose token lacks a
 * tenant claim — the OMN-10875 "app triggers provisioning automatically and
 * idempotently" criterion. No display surface is added here; UI polish is
 * out of scope for the backend slice.
 */

const PROVISION_ENDPOINT = '/api/onboarding/provision';
const ME_ENDPOINT = '/api/onboarding/me';

export interface OnboardingTenant {
  tenant_id: string;
  tenant_slug: string;
  principal_id: string;
  display_name: string;
  status: string;
  created_at: string;
}

export interface OnboardingApplyPlanStep {
  kind: 'keycloak_admin';
  method: 'GET' | 'PUT';
  path: string;
  description: string;
}

export interface ProvisionTenantResponse {
  outcome: 'created' | 'existing';
  tenant: OnboardingTenant;
  keycloak: { applied: boolean; plan: OnboardingApplyPlanStep[] };
  credentials: { status: 'deferred'; reason: string; ticket: string };
}

export interface OnboardingStatusResponse {
  subject: string;
  provisioned: boolean;
  tenant: OnboardingTenant | null;
}

export interface ProvisionTenantRequest {
  requestedSlug?: string;
  displayName?: string;
}

/**
 * Idempotently provision the signed-in user's tenant. `accessToken` is the
 * OIDC access token from the session — the endpoint verifies it against the
 * realm JWKS itself (a new user's token has no tenant claim yet). Throws on
 * non-2xx so callers can surface the failure.
 */
export async function provisionTenant(
  accessToken: string,
  request: ProvisionTenantRequest = {},
): Promise<ProvisionTenantResponse> {
  const body: Record<string, unknown> = {};
  if (request.requestedSlug !== undefined) body.requested_slug = request.requestedSlug;
  if (request.displayName !== undefined) body.display_name = request.displayName;

  const res = await fetch(PROVISION_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`tenant provisioning failed: HTTP ${res.status}`);
  }
  return (await res.json() as unknown) as ProvisionTenantResponse;
}

/** Provisioning status for the signed-in user. Throws on non-2xx. */
export async function fetchOnboardingStatus(
  accessToken: string,
): Promise<OnboardingStatusResponse> {
  const res = await fetch(ME_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`onboarding status failed: HTTP ${res.status}`);
  }
  return (await res.json() as unknown) as OnboardingStatusResponse;
}
