// OMN-10875: Keycloak admin surface for self-service onboarding.
//
// After a tenant row is provisioned (tenant-provisioning.ts), the signing-up
// user's Keycloak account must carry `tenant_id` / `tenant_slug` attributes so
// the tenant client scope (deploy/keycloak/tenant-client-scope.json,
// OMN-13824) mints the tenant claim into subsequent tokens.
//
// Live-apply policy: mutating the live realm is an OPERATOR-GATED action.
// This module therefore has two contract-driven modes
// (onboarding.keycloak_apply_mode):
//   - plan (default): NO network call is made. The client returns the exact
//     admin-API steps it WOULD execute as a typed ApplyPlanStep[] — the
//     onboarding endpoint surfaces them in its response so the flow is fully
//     inspectable end-to-end without touching the realm.
//   - execute: performs the calls against the admin REST API using a
//     confidential service-account client (client_credentials grant). This
//     mode is only for environments where the operator has explicitly
//     enabled it in the deployment overlay.

/** One admin-API action the onboarding flow needs applied to the realm. */
export interface ApplyPlanStep {
  kind: 'keycloak_admin';
  method: 'GET' | 'PUT';
  /** Admin REST path relative to the realm admin base URL. */
  path: string;
  /** Human-auditable description of the mutation. */
  description: string;
}

export interface TenantAttributes {
  tenantId: string;
  tenantSlug: string;
}

export interface ApplyResult {
  /** True only when the live realm was actually mutated (execute mode). */
  applied: boolean;
  /** The steps that were (execute) or would be (plan) performed. */
  plan: ApplyPlanStep[];
}

export interface KeycloakAdminOptions {
  applyMode: 'plan' | 'execute';
  /** Realm admin base, e.g. https://auth.omninode.ai/admin/realms/omninode */
  adminBaseUrl: string;
  /** OIDC token endpoint for the service-account client_credentials grant. */
  tokenUrl: string;
  clientId: string;
  /** Resolved secret value; required only in execute mode. */
  clientSecret: string | null;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export interface KeycloakAdminClient {
  readonly applyMode: 'plan' | 'execute';
  /**
   * Ensure the user identified by OIDC `sub` carries the tenant attributes.
   * Plan mode returns the steps without any I/O; execute mode performs them.
   */
  applyTenantAttributes(subject: string, attrs: TenantAttributes): Promise<ApplyResult>;
}

/** The exact admin-API steps needed to bind a user to a tenant. Pure. */
export function planTenantAttributeSteps(
  subject: string,
  attrs: TenantAttributes,
): ApplyPlanStep[] {
  return [
    {
      kind: 'keycloak_admin',
      method: 'GET',
      path: `/users/${encodeURIComponent(subject)}`,
      description: `read user ${subject} to merge existing attributes`,
    },
    {
      kind: 'keycloak_admin',
      method: 'PUT',
      path: `/users/${encodeURIComponent(subject)}`,
      description:
        `set attributes.tenant_id=["${attrs.tenantId}"], `
        + `attributes.tenant_slug=["${attrs.tenantSlug}"] on user ${subject}`,
    },
  ];
}

export function createKeycloakAdminClient(options: KeycloakAdminOptions): KeycloakAdminClient {
  const { applyMode } = options;

  if (applyMode === 'plan') {
    return {
      applyMode,
      applyTenantAttributes: (subject, attrs) =>
        Promise.resolve({ applied: false, plan: planTenantAttributeSteps(subject, attrs) }),
    };
  }

  // Execute mode: fail fast at construction, not first-provision time.
  if (!options.adminBaseUrl || !options.tokenUrl || !options.clientId) {
    throw new Error(
      "onboarding.keycloak_apply_mode 'execute' needs keycloak_admin_base_url, a token URL, and keycloak_admin_client_id",
    );
  }
  if (!options.clientSecret) {
    throw new Error(
      "onboarding.keycloak_apply_mode 'execute' needs the admin client secret (onboarding.keycloak_admin_client_secret_ref)",
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const adminBase = options.adminBaseUrl.replace(/\/$/, '');
  const { tokenUrl, clientId, clientSecret } = options;

  async function adminToken(): Promise<string> {
    const res = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret as string,
      }),
    });
    if (!res.ok) {
      throw new Error(`keycloak admin token request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) {
      throw new Error('keycloak admin token response missing access_token');
    }
    return body.access_token;
  }

  return {
    applyMode,
    async applyTenantAttributes(subject, attrs): Promise<ApplyResult> {
      const plan = planTenantAttributeSteps(subject, attrs);
      const token = await adminToken();
      const userUrl = `${adminBase}/users/${encodeURIComponent(subject)}`;

      const getRes = await fetchImpl(userUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!getRes.ok) {
        throw new Error(`keycloak admin GET user failed: HTTP ${getRes.status}`);
      }
      const user = (await getRes.json()) as { attributes?: Record<string, string[]> };

      const putRes = await fetchImpl(userUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...user,
          attributes: {
            ...(user.attributes ?? {}),
            tenant_id: [attrs.tenantId],
            tenant_slug: [attrs.tenantSlug],
          },
        }),
      });
      if (!putRes.ok) {
        throw new Error(`keycloak admin PUT user failed: HTTP ${putRes.status}`);
      }
      return { applied: true, plan };
    },
  };
}
