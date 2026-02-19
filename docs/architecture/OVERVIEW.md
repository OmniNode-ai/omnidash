# Omnidash Architecture Overview

## System Purpose

Omnidash is a real-time monitoring dashboard for the OmniNode AI agent system. It visualizes agent routing decisions, pattern enforcement, context enrichment, LLM cost trends, and system health across the OmniNode platform. Data flows exclusively from Kafka event topics into a local read-model database — omnidash never queries upstream services directly.

## Monorepo Structure

```text
omnidash/
├── client/          # React frontend (Vite, TanStack Query, Wouter)
│   └── src/
│       ├── pages/           # Page-level components (one per route)
│       ├── components/      # Shared UI components (shadcn/ui based)
│       ├── contexts/        # React contexts (DemoMode, Theme)
│       ├── hooks/           # Custom hooks (useWebSocket, useProjectionStream)
│       └── lib/
│           └── data-sources/ # Client-side API wrappers (API-first + mock fallback)
├── server/          # Express backend (Node.js, KafkaJS, Drizzle ORM)
│   ├── read-model-consumer.ts  # Projects Kafka events → omnidash_analytics DB
│   ├── event-consumer.ts       # In-memory aggregation for WebSocket delivery
│   ├── routes.ts               # Route registration (all /api/* prefixes)
│   └── websocket.ts            # WebSocket server (/ws endpoint)
└── shared/          # Shared types and database schemas
    ├── schema.ts               # User auth tables
    ├── intelligence-schema.ts  # 30+ agent observability tables (Drizzle ORM)
    └── topics.ts               # Canonical Kafka topic name constants
```

**Import path aliases** (configured in `tsconfig.json` and `vite.config.ts`):

- `@/` → `client/src/`
- `@shared/` → `shared/`

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18, Wouter (SPA router) |
| State management | TanStack Query v5 (server state), React Context (UI state) |
| UI components | shadcn/ui (New York variant) on Radix UI primitives |
| Styling | Tailwind CSS, IBM Plex Sans/Mono (Google Fonts) |
| Backend | Node.js, Express |
| Event streaming | KafkaJS (`192.168.86.200:29092`) |
| Database ORM | Drizzle ORM with `@neondatabase/serverless` driver |
| Database | PostgreSQL (`omnidash_analytics` on `192.168.86.200:5436`) |
| Type validation | Zod (schemas generated from Drizzle via `drizzle-zod`) |
| Build | Vite (frontend), esbuild (backend) |
| Testing | Vitest, @testing-library/react |

## Core Data Flow

### Durable Projection Path (Read-Model)

Events from the OmniNode platform are published to Kafka topics and consumed by omnidash's `ReadModelConsumer`, which projects them into the local `omnidash_analytics` PostgreSQL database. The Express API reads from this database to serve dashboard data.

```text
OmniNode platform services
        |
        | publish events
        v
  Kafka topics (192.168.86.200:29092)
  ├── agent-routing-decisions
  ├── agent-actions
  ├── agent-transformation-events
  ├── onex.evt.omniclaude.pattern-enforcement.v1
  ├── onex.evt.omniclaude.llm-cost-reported.v1
  ├── onex.evt.omnibase-infra.baselines-computed.v1
  ├── onex.evt.omniclaude.context-enrichment.v1
  └── onex.evt.omniclaude.llm-routing-decision.v1
        |
        | KafkaJS consumer
        | group: omnidash-read-model-v1
        v
  server/read-model-consumer.ts
  (projects events → DB rows, ON CONFLICT DO NOTHING dedup)
        |
        v
  omnidash_analytics PostgreSQL database
  ├── agent_routing_decisions
  ├── agent_actions
  ├── agent_transformation_events
  ├── pattern_enforcement_events
  ├── llm_cost_aggregates
  ├── context_enrichment_events
  ├── llm_routing_decisions
  ├── baselines_snapshots / baselines_comparisons / baselines_trend / baselines_breakdown
  └── projection_watermarks  (consumer progress tracking)
        |
        | Drizzle ORM queries
        v
  Express API endpoints (/api/*)
  server/routes.ts → server/*-routes.ts files
        |
        | HTTP (TanStack Query)
        v
  React dashboards
  client/src/lib/data-sources/*-source.ts
  (API-first with mock fallback)
        |
        v
  Page components (client/src/pages/*.tsx)
```

### Real-Time WebSocket Path (In-Memory)

A second consumer group (`omnidash-consumers-v2`) runs in `event-consumer.ts` for low-latency in-memory aggregation. Events from this consumer are broadcast over WebSocket to subscribed clients with sub-100ms latency.

```text
Kafka topics
        |
        | KafkaJS consumer
        | group: omnidash-consumers-v2
        v
  server/event-consumer.ts
  (in-memory aggregation + EventEmitter pub/sub)
        |
        v
  server/websocket.ts
  (WebSocket server at /ws, client subscription model)
        |
        | ws:// connection
        v
  React clients
  client/src/hooks/useWebSocket.ts
```

## Key Architectural Constraints

### Arch-Guard: No Direct Upstream DB Access

A CI enforcement rule (`ci: arch-guard`) blocks any code in omnidash from directly querying the upstream `omninode_bridge` database (`192.168.86.200:5436`). All intelligence data must flow through Kafka into omnidash's own `omnidash_analytics` read-model database. This constraint:

- Keeps omnidash decoupled from upstream schema changes
- Prevents read-load from monitoring from impacting production services
- Makes the data flow auditable through Kafka topic inspection

### Port Binding

The application must run on port 3000 (`PORT=3000 npm run dev`). Other ports are firewalled in the deployment environment.

### Dual Consumer Groups

The read-model consumer (`omnidash-read-model-v1`) and the real-time event consumer (`omnidash-consumers-v2`) use separate consumer group IDs. This ensures they track offsets independently — the read-model consumer can lag behind or replay without affecting the real-time stream, and vice versa.

### Infrastructure Availability

Kafka/Redpanda and the `omnidash_analytics` PostgreSQL database are **required infrastructure**. The application will not display real data without them.

**What happens when Kafka is unreachable** (an error state, not a design feature):

- `ReadModelConsumer` cannot consume events; no new data is projected into the database
- Data source classes in `client/src/lib/data-sources/` fall back to mock data — this signals a configuration error, not normal operation
- The health endpoint at `/api/health` will report Kafka as down; this must be remediated

**What happens when a DB migration is missing** (a deployment error, not graceful degradation):

- New tables that have not yet been migrated trigger a warning log and advance the watermark rather than crashing the consumer — this is a recovery heuristic for rolling deployments, not an intended long-term state. Run `npm run db:migrate` to resolve it.

## Route Registration

All API routes are registered in `server/routes.ts` and mounted under `/api`:

| Mount prefix | Route file | Purpose |
|---|---|---|
| `/api/intelligence` | `intelligence-routes.ts` | Agent observability metrics |
| `/api/savings` | `savings-routes.ts` | Compute/token savings tracking |
| `/api/agents` | `agent-registry-routes.ts` | Agent discovery and management |
| `/api/chat` | `chat-routes.ts` | AI assistant interactions |
| `/api/event-bus` | `event-bus-routes.ts` | Event querying and statistics |
| `/api/registry` | `registry-routes.ts` | ONEX node registry discovery |
| `/api/demo` | `playback-routes.ts` | Recorded event replay |
| `/api/patterns` | `patterns-routes.ts` | Learned patterns API |
| `/api/validation` | `validation-routes.ts` | Cross-repo validation |
| `/api/extraction` | `extraction-routes.ts` | Pattern extraction pipeline |
| `/api/effectiveness` | `effectiveness-routes.ts` | Injection effectiveness |
| `/api/projections` | `projection-routes.ts` | Server-side materialized views |
| `/api/insights` | `insights-routes.ts` | Learned insights |
| `/api/baselines` | `baselines-routes.ts` | Cost + outcome comparison |
| `/api/costs` | `cost-routes.ts` | LLM cost and token usage |
| `/api/intents` | `intent-routes.ts` | Real-time intent classification |
| `/api/enforcement` | `enforcement-routes.ts` | Pattern enforcement metrics |
| `/api/executions` | `execution-routes.ts` | Live ONEX node execution graph |
| `/api/enrichment` | `enrichment-routes.ts` | Context enrichment metrics |
| `/api/catalog` | `topic-catalog-routes.ts` | Topic catalog status |
| `/api/health` | `health-data-sources-routes.ts` | Data source health audit |
| `/api/llm-routing` | `llm-routing-routes.ts` | LLM routing effectiveness |
