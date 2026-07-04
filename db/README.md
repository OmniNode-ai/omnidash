# omnidash database migrations

Source-controlled SQL for the dashboard projection database(s). Nothing in
this directory runs automatically — migrations are applied deliberately per
the APPLY PLAN below.

## Migrations

| File | Tickets | What it does |
|------|---------|--------------|
| `migrations/0001_tenant_rls.sql` | OMN-13824, OMN-1636 | Adds `tenant_id` (default `'omninode'`) to every dashboard projection table, enables Row-Level Security with a fail-closed `tenant_isolation` policy keyed on the `app.tenant_id` GUC, creates the `omnidash_app` NOLOGIN read role and grants it SELECT. Idempotent; absent tables are skipped with a NOTICE. |

## Tenant model

- The Express bridge authenticates requests via Keycloak OIDC (see
  `deploy/keycloak/` and `server/auth/`). The verified token's `tenant_id`
  claim is threaded through `AsyncLocalStorage` into
  `server/postgres-projection-reader.ts`, which sets
  `app.tenant_id` on the session for the duration of the read (and provably
  resets it before the connection returns to the pool).
- RLS policy: `tenant_id = current_setting('app.tenant_id', true)` for both
  `USING` and `WITH CHECK`. Unset GUC ⇒ NULL ⇒ no rows (fail closed).
- RLS is `ENABLE`d, not `FORCE`d: the table **owner** (the projection writer
  role) bypasses the policy, so existing single-tenant projection writers keep
  working; their rows land under the default tenant `'omninode'`. Any
  non-owner role — including `omnidash_app` — is fully constrained.

## Verification

`server/__tests__/tenant-rls.integration.test.ts` applies
`migrations/0001_tenant_rls.sql` to a throwaway Postgres (local docker or the
CI `tenant-rls` job's postgres service) and proves the beta-gate invariant:

- tenant A sees only tenant-A rows; tenant B only tenant-B rows
- no tenant context ⇒ zero rows (fail closed)
- cross-tenant INSERT by a non-owner writer is rejected (`WITH CHECK`)
- the end-to-end app path (`PostgresProjectionReader` under
  `runWithTenantContext`) returns only the active tenant's rows

## APPLY PLAN (live databases — NOT executed from this repo)

Targets, in order:

1. `omnidash_dev` on cloud dev-postgres (`dev/dev-postgres`, k8s namespace
   `dev`) — the database the deployed dashboard currently reads.
2. `omnidash_analytics` — the target database per the standing "wire omnidash
   to omnidash_analytics" item; apply before or at cutover.

Steps per database (operator, with port-forward or in-cluster psql):

```bash
# 1. Preflight: confirm which projection tables exist and who owns them.
psql "$DB_URL" -c "\dt public.*"

# 2. Apply the migration (idempotent).
psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/migrations/0001_tenant_rls.sql

# 3. Create the LOGIN role the bridge will connect as (credential material is
#    deployment-owned; store the password in the k8s secret, not in git).
psql "$DB_URL" -c "CREATE ROLE omnidash_app_login LOGIN PASSWORD '<from-secret-store>' IN ROLE omnidash_app;"

# 4. Point the bridge's contract secret ref at the new role's DSN
#    (data_source.postgres_database_url_secret_ref -> env holding the
#    omnidash_app_login URL) and enable auth.tenant_mode: "required".

# 5. Verify fail-closed from the app role:
psql "<app-role-DSN>" -c "SELECT COUNT(*) FROM delegation_events;"   # expect 0 (no GUC)
psql "<app-role-DSN>" -c "SELECT set_config('app.tenant_id','omninode',false); SELECT COUNT(*) FROM delegation_events;"  # expect real count
```

Rollback: `ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;` per table (policy and
column are inert while RLS is disabled), then revert the bridge to its previous
DSN. Dropping `tenant_id` is not required for rollback.

Risk note: if any projection **writer** connects as a non-owner role, its
INSERTs are rejected after apply — `WITH CHECK` evaluates against the unset
GUC (NULL) and fails closed. Preflight step 1 exists to catch this: verify
writer role = table owner before applying to a live database, or have the
writer `SELECT set_config('app.tenant_id','omninode',false)` at connect time.
