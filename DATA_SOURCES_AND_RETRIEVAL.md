# OmniDash Data Sources & Retrieval Guide

This guide summarizes live data sources (PostgreSQL, Kafka, Memgraph, Qdrant), required environment settings, and how to query them from Omnidash.

## Services Overview

- PostgreSQL (Intelligence DB)
  - Host: 192.168.86.200
  - Port: 5436
  - Database: omninode_bridge
  - User: postgres
  - Env keys:
    - `DATABASE_URL="postgresql://postgres:<password>@192.168.86.200:5436/omninode_bridge"`
    - `POSTGRES_HOST=192.168.86.200`
    - `POSTGRES_PORT=5436`
    - `POSTGRES_DATABASE=omninode_bridge`
    - `POSTGRES_USER=postgres`
    - `POSTGRES_PASSWORD=<password>`
  - Notes: Used via Drizzle ORM in `server/intelligence-routes.ts` and `shared/intelligence-schema.ts`.

- Kafka (Event Bus)
  - Topics: `agent-routing-decisions`, `agent-transformation-events`, `router-performance-metrics`, `agent-actions`
  - Used by: `server/event-consumer.ts` (in-memory stream) and metrics aggregation.

- Qdrant (Vector DB)
  - Host: `archon-qdrant` (Docker network) or `192.168.86.101:6333`
  - Port: 6333 (HTTP)
  - Status: Placeholder in Omnidash (see comments in `server/intelligence-routes.ts`). Live integration available via Omniarchon APIs.

- Memgraph (Knowledge Graph)
  - Accessed via Omniarchon intelligence service (HTTP API); direct Bolt connection is not configured in Omnidash.

## Where Omnidash Uses Live Data

- `server/intelligence-routes.ts`: PostgreSQL-backed endpoints for:
  - Pattern Discovery
  - Agent Transformations
  - Developer Experience
  - Document Access
- `scripts/test-db-query.ts`, `scripts/test-routing-decisions.ts`: Example Drizzle queries against PostgreSQL.
- `client/src/pages/AgentOperations.tsx`: Uses live WebSocket events + aggregated queries (via API).

## Enable Live PostgreSQL

1. Set `.env` in `omnidash`:
   - `DATABASE_URL=postgresql://postgres:<password>@192.168.86.200:5436/omninode_bridge`
2. Restart the server: `npm run dev`
3. Verify health:
   - System Health page (PostgreSQL shows healthy)
   - API: GET `/api/intelligence/health`
4. Test queries:
   - `node scripts/test-db-query.ts`

## Accessing Omniarchon (Memgraph-backed) Intelligence

- Base URL: `http://localhost:8053`
- Provides aggregated graph/insights endpoints backed by Memgraph.
- Use Omniarchon APIs where appropriate to avoid direct Bolt connections in Omnidash.

## Qdrant Integration Paths

- Direct (future): Add client and env (`QDRANT_URL`, `QDRANT_API_KEY`) and implement queries where marked in `intelligence-routes.ts`.
- Via Omniarchon: Call Omniarchon endpoints that already leverage Qdrant for pattern similarity/search.

## Kafka Events

- Ensure event producers (OmniClaude/Omniarchon agents) are running.
- Omnidash consumes via in-memory consumer (`server/event-consumer.ts`).

## Troubleshooting

- PostgreSQL not reachable:
  - Confirm host/port and firewall
  - `psql -h 192.168.86.200 -p 5436 -U postgres -d omninode_bridge -c "SELECT 1;"`
- Qdrant:
  - Confirm `http://<qdrant-host>:6333/collections`
- Omniarchon:
  - Check service at `http://localhost:8053`

## Next Steps to Replace Mocks

- Intelligence Analytics: swap mock `agentPerformance` with `/api/agents/performance` once backend returns array shape or add transform.
- Node Network/Pattern Lineage: connect to PostgreSQL tables (`pattern_lineage_nodes`, `pattern_lineage_edges`) via existing routes.
- Feature Showcase demos: where possible, fetch from Omniarchon/Qdrant instead of local mocks.

## Appendix: References

- `INTELLIGENCE_INTEGRATION.md`
- `DASHBOARD_DATA_INTEGRATION_AUDIT.md`
- `server/intelligence-routes.ts`
- `shared/intelligence-schema.ts`
- Scripts: `scripts/test-db-query.ts`, `scripts/test-routing-decisions.ts`


