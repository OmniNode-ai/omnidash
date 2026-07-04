# Keycloak realm config for omnidash multi-tenancy (OMN-13824 / OMN-1636)

Source-controlled Keycloak configuration for the `omninode` realm at
`https://auth.omninode.ai/realms/omninode`. **Nothing here is applied
automatically** — the live realm is treated as read-only reference until an
operator executes the APPLY PLAN below. These files are the source of truth
for the dashboard's tenant-claim contract; drift between them and the live
realm is a defect.

## Files

| File | Keycloak resource | Purpose |
|------|-------------------|---------|
| `tenant-client-scope.json` | ClientScopeRepresentation | Client scope `tenant` with protocol mappers that mint `tenant_id` (and `org_id`) claims from user attributes into access/ID/userinfo tokens. |
| `omnidash-client.json` | ClientRepresentation | Confidential `omnidash` client: standard flow + PKCE S256, dashboard redirect URIs, `tenant` in its default client scopes. |

## Tenant-claim contract (what the app depends on)

- Access tokens for the `omnidash` client carry a top-level string claim
  `tenant_id` (claim name is contract-configurable via `auth.tenant_claim` in
  `contract.yaml`; `tenant_id` is the default).
- The claim value is the row-level tenant key: it must equal the `tenant_id`
  column value of the rows that user may see (RLS policy in
  `db/migrations/0001_tenant_rls.sql`). The pre-multitenant default tenant is
  `omninode`.
- A user with no `tenant_id` attribute gets **no** claim and is rejected with
  403 by the app when tenant auth is required — fail closed, no default
  tenant fallback.

App-side consumers: `server/auth/oidc-token.ts` (JWKS verification + claim
extraction), `server/auth/tenant-middleware.ts` (gate), configured by the
`auth:` section of `contract.yaml`.

## APPLY PLAN (operator-executed, not automated)

Prereqs: `kcadm.sh` authenticated against the auth host with realm-admin on
`omninode`. All commands are idempotency-checked (get before create).

```bash
REALM=omninode

# 1. Create the tenant client scope + mappers (skip if it already exists).
kcadm.sh get client-scopes -r "$REALM" --fields name | grep -q '"tenant"' \
  || kcadm.sh create client-scopes -r "$REALM" -f deploy/keycloak/tenant-client-scope.json

# 2. Create or update the omnidash client.
CID=$(kcadm.sh get clients -r "$REALM" -q clientId=omnidash --fields id --format csv --noquotes)
if [ -z "$CID" ]; then
  kcadm.sh create clients -r "$REALM" -f deploy/keycloak/omnidash-client.json
else
  kcadm.sh update "clients/$CID" -r "$REALM" -f deploy/keycloak/omnidash-client.json
fi

# 3. Attach the tenant scope as a DEFAULT client scope (idempotent).
SCOPE_ID=$(kcadm.sh get client-scopes -r "$REALM" --fields id,name --format csv --noquotes | awk -F, '$2=="tenant"{print $1}')
CID=$(kcadm.sh get clients -r "$REALM" -q clientId=omnidash --fields id --format csv --noquotes)
kcadm.sh update "clients/$CID/default-client-scopes/$SCOPE_ID" -r "$REALM"

# 4. Seed tenant attributes on users (per user; example for the default tenant).
UID=$(kcadm.sh get users -r "$REALM" -q username=<user> --fields id --format csv --noquotes)
kcadm.sh update "users/$UID" -r "$REALM" -s 'attributes.tenant_id=["omninode"]'

# 5. Verify: mint a token for the omnidash client and confirm the claim.
#    Decode the access token payload and check `.tenant_id == "omninode"`
#    and `.iss` ends with /realms/omninode.
```

Post-apply app rollout (separate step, also operator-gated):

1. Set `auth.issuer_url: "https://auth.omninode.ai/realms/omninode"` and
   `auth.tenant_mode: "required"` in the deployment's `contract.local.yaml`
   overlay (or the OMNIDASH_* env overrides).
2. Apply `db/migrations/0001_tenant_rls.sql` per `db/README.md` FIRST — the
   token gate without RLS is app-level-only isolation, which is exactly what
   OMN-1636 exists to remove.

## Live-realm caveats

- The realm currently gating `dash.dev.omninode.ai` fronts the **legacy
  rest-express** deployment (OMN-13823/B11). The gated migration of the live
  dashboard onto this Vite app — including the session/login UX — is the
  operator-approval-gated remainder of OMN-13824 and is NOT performed by this
  config.
- If the live `omnidash` client already exists with different redirect URIs,
  reconcile toward this file (update the file first if the live URIs are
  correct — this directory is the source of truth going forward).
