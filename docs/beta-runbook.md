# OmniDash — Beta Runbook

**Last updated:** 2026-07-09
**Branch:** `feat/multitenant-auth-tenant-isolation`
**Cluster:** `onex-dev` (`18.209.126.195`), namespace `onex-dev`

This runbook covers canonical start, required env vars, verification steps, and known caveats for the OmniDash beta deployment. A fresh operator should be able to start, verify, and restart the dashboard using this document alone.

---

## Prerequisites

- Node.js (version pinned in `.nvmrc` or `package.json` `engines` field)
- A Keycloak realm account for `https://auth.omninode.ai/realms/omninode`
- Access to the Postgres analytics DB (`omnidash_analytics`)
- Access to the Redis/Valkey session store (`omninode-valkey.data-plane.svc.cluster.local:6379` in cluster)
- A `.env` file populated from the env vars listed below (never committed — in `.gitignore`)

### Critical: RLS migration must be applied before deploying this branch

This branch removes all application-level `WHERE tenant_id = $1` clauses. Tenant isolation is now enforced entirely by Postgres Row-Level Security (RLS) policies, which were introduced by migration `db/migrations/0001_tenant_rls.sql` in OMN-13824.

**If this migration has not been applied to `omnidash_analytics`, deploying this branch will expose all tenants' data to every authenticated user — there is no application-level fallback.**

Before deploying:
```sql
-- Verify RLS is enabled on projection tables (run as superuser)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('delegation_events', 'savings_estimates', 'generation_events', 'swarm_runs', 'delegation_event_log');
-- Every row must show rowsecurity = true
```

If any row shows `rowsecurity = false`, apply `db/migrations/0001_tenant_rls.sql` (from the `origin/dev` branch, OMN-13824) before proceeding.

---

## Required environment variables

All variables must be set for beta. Missing any of these causes auth or data reads to fail.

### Auth + session

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | **Required** | Random secret used to sign session cookies. Minimum 32 chars. Generate with `openssl rand -hex 32`. **Must not be `dev-secret-change-me` in production.** |
| `SESSION_STORE_URL` | **Required** | Redis/Valkey connection URL for server-side session storage. In-cluster: `redis://omninode-valkey.data-plane.svc.cluster.local:6379`. Without this, sessions are in-memory (lost on restart). |
| `KEYCLOAK_ISSUER` | **Required** | Keycloak realm URL. Beta value: `https://auth.omninode.ai/realms/omninode` |
| `KEYCLOAK_CLIENT_ID` | **Required** | Keycloak client ID. Beta value: `omnidash` |
| `KEYCLOAK_CLIENT_SECRET` | **Required** | Client secret from Keycloak for the `omnidash` confidential client. Obtain from Keycloak admin console → Clients → omnidash → Credentials. |
| `OMNIDASH_BASE_URL` | **Required** | Public URL of the OmniDash deployment. Used for CORS allowlist and Keycloak redirect URI. Example: `https://dash.omninode.ai`. Must NOT have a trailing slash. |

### Data

| Variable | Required | Description |
|----------|----------|-------------|
| `OMNIDASH_ANALYTICS_DB_URL` | **Required** | Postgres connection string for the analytics DB. Example: `postgresql://omnidash_app:password@host:5432/omnidash_analytics`. The user must be `omnidash_app` (non-owner) so RLS policies apply. |
| `OMNIDASH_DATA_SOURCE` | **Required** | Set to `postgres` for beta. Other modes (`sqlite`, `file`) are dev-only. |

### Optional (have safe defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `KEYCLOAK_CLIENT_SECRET` | (none) | No default — required for production as noted above. |
| `NODE_ENV` | `development` | Set to `production` in beta so session cookies use `secure: true` (HTTPS only). |

---

## Start commands

Run these in two separate terminals (or as two processes in the same process manager):

```bash
# Terminal 1 — Express server (auth, API routes, Postgres reader)
npm run dev:server

# Terminal 2 — Vite frontend
npm run dev
```

For production/beta (built assets, not dev mode):

```bash
# Build frontend
npm run build

# Start Express server (serves built assets + API)
NODE_ENV=production node dist/server/index.js
```

The Express server listens on port `3002` by default. The Vite dev server listens on port `3001`.

---

## Verify after start

### 1. Login redirect works

Navigate to `http://localhost:3002` (or the deployed URL). You should be redirected to Keycloak login. After logging in you should be returned to the OmniDash dashboard.

If you see a `401` or blank page instead of a redirect, check:
- `KEYCLOAK_ISSUER` is set and reachable
- `KEYCLOAK_CLIENT_ID` and `KEYCLOAK_CLIENT_SECRET` are correct
- `OMNIDASH_BASE_URL` matches the URL you navigated to (CORS check)

### 2. Session persists across page refreshes

After logging in, refresh the page. You should still be logged in without being redirected to Keycloak again.

If you are redirected on every refresh, `SESSION_STORE_URL` is likely not set or the Redis connection is failing. Check the server logs for `[omnidash session] Redis connect failed`.

### 3. Dashboard data loads

After login, the dashboard should show data in at least some panels. Navigate to Delegation Evidence, Event Bus, and SEA Control Plane to verify projection reads.

To verify the Postgres reader is working and the GUC is set correctly:

```bash
# Check server logs for projection read activity
# Expected: no errors, rows returned for delegation/event bus panels
# Expected: empty-state (not error) for delegation-savings and delegation-decisions panels
#           if OMN-14058 has not yet landed (see caveats below)
```

### 4. Logout clears session

Click logout (or navigate to `/logout`). You should be redirected to Keycloak's logout page and the OmniDash session should be cleared. Navigating back to the dashboard should require re-login.

### 5. Verify tenant isolation (if multiple tenants are set up)

Log in as `Tenant A`. Navigate to Delegation Evidence. The rows shown should only be for Tenant A.

Log out. Log in as `Tenant B`. The same panels should show only Tenant B's rows.

If you see data mixing between tenants, the `app.tenant_id` GUC is not being set correctly on the Postgres connection. Check that:
- `KEYCLOAK_ISSUER` points at a Keycloak that issues tokens with a `tenant_id` claim
- The server logs show a successful session establishment

---

## Projection API

The dashboard reads projection data from the Express server at the same origin. All projection reads go through:

```
GET /projection/:topic
```

Base URL (in-browser, relative): `/projection/`
Base URL (from server or tools): `http://localhost:3002/projection/`

### Live topics (as of 2026-07-09)

These topics are backed by Postgres and served in beta:

| Topic | Panel |
|-------|-------|
| `onex.snapshot.projection.delegation.decisions.v1` | Delegation Evidence — decisions table |
| `onex.snapshot.projection.delegation.summary.v1` | Delegation Evidence — summary stats |
| `onex.snapshot.projection.delegation.model-routing.v1` | Delegation Evidence — model routing |
| `onex.snapshot.projection.delegation.quality-gate.v1` | Delegation Evidence — quality gate |
| `onex.snapshot.projection.delegation.token-usage.v1` | Delegation Evidence — token usage |
| `onex.snapshot.projection.delegation.savings.v1` | Delegation Evidence — savings (see caveat) |
| `onex.snapshot.projection.savings.v1` | Cost savings detail |
| `onex.snapshot.projection.savings.summary.v1` | Cost savings summary |
| `onex.snapshot.projection.cost.savings-overview.v1` | Cost savings overview (see caveat) |
| `onex.snapshot.projection.live-events.v1` | Event Bus — live event stream |
| `onex.snapshot.projection.node-registry.v1` | Node registry |
| `onex.snapshot.projection.mcp-tools.v1` | MCP tools list |
| `onex.snapshot.projection.swarm.runs.v1` | Swarm runs |
| `onex.snapshot.projection.swarm-runs.v1` | Swarm runs (v2 shape) |
| `onex.evt.omnimarket.node-generation-completed.v1` | Node generation events |

---

## Known caveats for beta

### OMN-14058 — Delegation/savings panels show empty for all tenants

**Expected behaviour, not a bug.**

The delegation/savings panels (`delegation.savings.v1`, `cost.savings-overview.v1`) read from `delegation_events` and `savings_estimates` tables. As of 2026-07-09, not all projection rows carry a `tenant_id` yet — OMN-14058 (tracked separately) stamps `tenant_id` across those tables.

Until OMN-14058 lands, RLS correctly returns zero rows for those tables (the `tenant_id = current_setting('app.tenant_id', true)` policy evaluates false for rows with no `tenant_id`). These panels will show the `NO DATA` empty-state.

**What to tell beta users:** "Delegation savings and cost savings history panels are populating — live data will appear once the data pipeline processes your activity."

**These panels are NOT broken.** The empty-state is the correct fail-closed behavior of RLS.

### Feature Flags page — hidden from beta nav

The Feature Flags nav item is not shown in beta. The flag server is not wired for the beta deploy. Post-beta work will connect it to the live flag server configuration. The page is still accessible via direct URL (`/` → set `activePage = 'feature-flags'` via dev tools) for internal testing.

---

## Restart procedure

```bash
# Graceful restart (preserves Redis sessions — users stay logged in)
# Send SIGTERM to the server process; it will drain and exit cleanly
kill -TERM <server-pid>
npm run dev:server  # or re-deploy

# Hard restart (clears in-memory state but Redis sessions survive)
# Users do NOT need to re-login if SESSION_STORE_URL is set
pkill -f "tsx.*server/index.ts"
npm run dev:server
```

If `SESSION_STORE_URL` is set (it must be in beta), sessions survive restarts. Users will not be logged out.

If you need to force all users to re-authenticate (e.g. after a Keycloak client secret rotation):

```bash
# Flush all sessions from Redis
redis-cli -u "$SESSION_STORE_URL" FLUSHDB
```

---

## Health check

```bash
# Verify server is up and responding
curl -I http://localhost:3002/health || curl -I http://localhost:3002/api/runtime-config

# Verify Postgres connectivity (should return projection envelope, possibly empty rows)
curl -H "Cookie: <session-cookie>" http://localhost:3002/projection/onex.snapshot.projection.node-registry.v1

# Verify login redirect is working
curl -I http://localhost:3002/
# Expected: 302 to https://auth.omninode.ai/realms/omninode/protocol/openid-connect/auth
```
