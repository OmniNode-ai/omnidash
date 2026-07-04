# OmniDash

Real-time monitoring and observability dashboard for the OmniNode platform.

> ## ⚠️ SOURCE OF RECORD — deployed legacy app + Keycloak auth gate (B11 / OMN-13823)
>
> This branch (`recovered/omnidash-legacy-rest-express`) is the **source of record for the
> application actually deployed at `https://dash.dev.omninode.ai`** (k8s namespaces
> `onex-dev` and `onex-prod`), including the **Keycloak OIDC auth gate**
> (`server/auth/oidc-client.ts`, `server/auth/auth-routes.ts`, `server/auth/middleware.ts`,
> `server/auth/session-config.ts`, `client/src/pages/LoginPage.tsx`,
> `client/src/hooks/useAuth.ts` — originally landed in `acfe4d87` / PR #225 / OMN-3698,
> hardened in `6527a19d` / PR #280 / OMN-4960).
>
> **This lineage is NOT the app on `origin/dev` / `origin/main`.** Those refs hold the
> newer Vite + React rewrite (Express 5, **no auth**) with a disjoint orphan root — this
> branch cannot be merged into them. Migration of the auth gate onto the Vite app is
> architecture-gated under **OMN-13824** and has not been executed.
>
> **Deployed-image provenance:**
>
> - Live deployments run image digest `sha256:483939d1…` (recovered from the drifted
>   mutable `omnidash:dev` tag on 2026-07-02; committed manifests previously pinned
>   `55493fb7…`).
> - The annotated tag **`omnidash-legacy-deployed-483939d1`** marks commit `a8f87b60`,
>   the source state matching that deployed image (package.json byte-match +
>   `initOidcClient`/`requireAuth`/`configureSession`/`/auth/callback` symbol match in
>   the deployed `/app/dist/index.js`; the image ships no sourcemaps, so byte-exact tree
>   equivalence is attested via those probes, not a full reproducible build).
> - k8s manifests were digest-pinned to `483939d1` in `omninode_infra` PR #552 (onex-dev,
>   applied) and PR #553 (onex-prod, operator-applied only).
>
> **Rebuild policy: any rebuild of the deployed dashboard image MUST be built FROM this
> branch (or the tag above) — never from `origin/dev` — and the resulting image must be
> deployed by immutable digest, never by the mutable `:dev` tag.** Building from any
> other branch silently removes the auth gate and reopens the dashboard pre-auth.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in database and Kafka credentials
PORT=3000 npm run dev
```

Required environment variables:

```bash
PORT=3000
OMNIDASH_ANALYTICS_DB_URL="postgresql://postgres:<password>@localhost:5436/omnidash_analytics"
KAFKA_BROKERS=localhost:29092   # cloud bus; use localhost:19092 for local Docker bus
KAFKA_CLIENT_ID=omnidash-dashboard
KAFKA_CONSUMER_GROUP=omnidash-consumers-v2
ENABLE_REAL_TIME_EVENTS=true
```

## Key Pages

| Page            | Route             | Data Source                               |
| --------------- | ----------------- | ----------------------------------------- |
| Epic Pipeline   | `/epic-pipeline`  | `onex.evt.omniclaude.epic-run-updated.v1` |
| PR Watch        | `/pr-watch`       | `onex.evt.omniclaude.pr-watch-updated.v1` |
| Gate Decisions  | `/gate-decisions` | `onex.evt.omniclaude.gate-decision.v1`    |
| Events (live)   | `/live-events`    | All topics (WebSocket)                    |
| Execution Graph | `/graph`          | Node execution events                     |
| Patterns        | `/patterns`       | `onex.evt.omniintelligence.pattern-*.v1`  |

## Key Features

- **Kafka projections**: Events consumed into local PostgreSQL read-model
- **Real-time WebSocket**: Live event streaming to browser
- **Multi-page dashboard**: Epic pipeline, PR watch, patterns, LLM routing, and more
- **React 18 + Vite**: Fast dev server with HMR
- **Express backend**: API routes + Kafka consumer process

## Documentation

- [Architecture overview](docs/architecture/OVERVIEW.md)
- [Route catalog](docs/architecture/ROUTE_CATALOG.md)
- [Event-to-component mapping](docs/EVENT_TO_COMPONENT_MAPPING.md)
- [Full index](docs/INDEX.md)
- [CLAUDE.md](CLAUDE.md) -- developer context and conventions
- [AGENT.md](AGENT.md) -- LLM navigation guide

## License

[MIT](LICENSE)
