# Self-service onboarding backend (OMN-10875)

Backend slice for no-operator tenant onboarding, built on the OMN-13824 /
OMN-1636 multi-tenant foundation (Keycloak tenant claims as code, OIDC tenant
context, Postgres RLS).

## Flow

```
Keycloak signup/login (realm `omninode`)
        │  access token: verified sub, NO tenant claim yet
        ▼
POST /api/onboarding/provision          (onboarding-routes.ts)
        │  verifies the bearer token against the realm JWKS itself —
        │  mounted BEFORE the tenant gate, which would 403 tenantless tokens
        ▼
tenant-provisioning.ts                  (idempotent per OIDC subject)
        │  INSERT ... ON CONFLICT (created_by_subject) DO NOTHING + re-read
        │  tenant_id minted once; principal_id = sha256(tenant_id) — immutable
        │  under slug rename (OMN-12911 identity triple)
        ▼
tenants registry row                    (db/migrations/0002_tenant_onboarding.sql)
        │  RLS-scoped: app role sees only the active tenant's row; no
        │  context => zero rows (fail closed)
        ▼
keycloak-admin.ts
        │  plan mode (default): returns the exact admin-API steps as a typed
        │  apply-plan — NO live realm mutation
        │  execute mode (operator-enabled overlay only): service-account
        │  client_credentials → GET user → PUT merged tenant attributes
        ▼
next login: token carries tenant_id claim → tenant gate + RLS take over
```

Client seam: `src/services/onboarding-api.ts` (`provisionTenant`,
`fetchOnboardingStatus`). The post-login shell calls `provisionTenant`
automatically for a session without a tenant claim once the Vite app carries
the Keycloak OIDC session (operator-gated OMN-13824 remainder).

## Config (contract.yaml `onboarding:` section)

Ships **disabled** and **plan-mode**. See the commented block in
`contract.yaml`; loader: `loadOnboardingConfig()` in
`server/data-source-contract.ts` (fail-fast when enabled without a resolvable
writer DB ref).

## Deliberately NOT in this slice

- **Per-tenant broker credentials / quotas / topic provisioning** — that is
  the OMN-12911 P0B surface (unstarted). The provision response returns a
  typed `credentials: { status: "deferred", ticket: "OMN-12911" }` stub; the
  `principal_id` column is the P0B attachment point.
- **Live Keycloak realm mutation** — plan mode is the default everywhere;
  execute mode requires an operator-edited deployment overlay.
- **Login UX in the Vite app** — operator-gated OMN-13824 remainder.

## APPLY PLAN (operator-executed, in order)

1. **Keycloak realm** — apply `deploy/keycloak/README.md` steps 1–3 (tenant
   client scope + omnidash client). Unchanged from OMN-13824.
2. **DB migration** — apply `db/migrations/0002_tenant_onboarding.sql` to the
   target database (after `0001_tenant_rls.sql`), per `db/README.md`.
3. **Onboarding service account (execute mode only)** — create a confidential
   Keycloak client (e.g. `omnidash-onboarding`) with service account enabled
   and the `realm-management: manage-users` role; store its secret in the
   deployment secret store and reference it via
   `onboarding.keycloak_admin_client_secret_ref: "env:..."`.
4. **Deployment overlay** — in `contract.local.yaml`: set
   `onboarding.enabled: "true"`, `onboarding.postgres_database_url_secret_ref`
   (writer role), `auth.issuer_url`; leave
   `onboarding.keycloak_apply_mode: "plan"` until step 3 is done, then flip to
   `"execute"` if automatic attribute binding is wanted.
5. **Tenant gate cutover** — `auth.tenant_mode: "required"` (per
   `deploy/keycloak/README.md` post-apply rollout; RLS migration must be live
   first).
