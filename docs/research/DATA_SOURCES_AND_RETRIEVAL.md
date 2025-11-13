# OmniDash Data Sources & Retrieval Guide

This guide summarizes live data sources (PostgreSQL, Kafka, Memgraph, Qdrant), required environment settings, and how to query them from Omnidash.

## Running Services (from Docker)

- **PostgreSQL** (`omninode-bridge-postgres`)
  - Container: `pgvector/pgvector:pg15`
  - Port: `0.0.0.0:5436->5432/tcp` (external:5436)
  - Status: ✅ Healthy

- **Qdrant** (`archon-qdrant`)
  - Container: `qdrant/qdrant:v1.7.4`
  - Port: `0.0.0.0:6333-6334->6333-6334/tcp` (HTTP:6333, gRPC:6334)
  - Status: ✅ Healthy
  - Collections: `quality_vectors`, `workflow_events`, `test_patterns`, `code_patterns`, `file_locations`, `archon_vectors`, `execution_patterns`

- **Omniarchon Intelligence** (`archon-intelligence`)
  - Port: `0.0.0.0:8053->8053/tcp`
  - Status: ⚠️ Degraded (Memgraph disconnected, Ollama/Freshness DB connected)
  - Health: `http://localhost:8053/health`

- **Redpanda** (`omninode-bridge-redpanda-dev`)
  - Container: `redpandadata/redpanda:latest`
  - Port: `0.0.0.0:19092->19092/tcp` (Kafka protocol)
  - Status: ✅ Healthy

## Services Overview

### PostgreSQL (Intelligence DB)

**Connection Details:**
- Host: `192.168.86.200` (from host) or `omninode-bridge-postgres` (from Docker network)
- Port: `5436` (external) → `5432` (container)
- Database: `omninode_bridge`
- User: `postgres`
- Password: See `.env` file (never commit passwords to git)

**Environment Variables in `.env`:**
```bash
# IMPORTANT: Replace <your_password> with actual password from .env file
# NOTE: POSTGRES_* variables are the canonical configuration (as of 2025-11-12)
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omninode_bridge
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your_password>

# Optional: Connection string (takes priority if set)
# DATABASE_URL=postgresql://postgres:<your_password>@192.168.86.200:5436/omninode_bridge
```

**Usage:** Used via Drizzle ORM in `server/intelligence-routes.ts` and `shared/intelligence-schema.ts`.

### Qdrant (Vector DB)

**Connection Details:**
- Host: `localhost` (from host) or `archon-qdrant` (from Docker network)
- Port: `6333` (HTTP API), `6334` (gRPC)
- URL: `http://localhost:6333`

**Available Collections:**
- `quality_vectors` - Code quality embeddings
- `workflow_events` - Workflow pattern vectors
- `test_patterns` - Test pattern embeddings
- `code_patterns` - Code pattern embeddings
- `file_locations` - File location vectors
- `archon_vectors` - Archon service vectors
- `execution_patterns` - Execution pattern vectors

**Status:** ✅ Accessible. Direct integration not yet implemented in Omnidash (placeholder in `server/intelligence-routes.ts`). Can be accessed via:
- Direct HTTP API: `http://localhost:6333/collections/{collection_name}/points/search`
- Via Omniarchon APIs (recommended for pattern similarity)

### Memgraph (Knowledge Graph)

**Connection Details:**
- Access via Omniarchon Intelligence service (HTTP API)
- Direct Bolt connection: `bolt://memgraph:7687` (internal Docker network only)
- Service URL: `http://localhost:8053`

**Status:** ⚠️ Degraded - Memgraph connection currently down (Ollama and Freshness DB connected)

**Usage:** Access via Omniarchon Intelligence API endpoints. Direct Bolt connection not configured in Omnidash (use Omniarchon HTTP APIs instead).

### Kafka/Redpanda (Event Bus)

**Connection Details:**
- Host: `192.168.86.200`
- Port: `19092` (external), `9092` (internal Docker network)
- Broker: `192.168.86.200:9092`

**Environment Variables:**
```bash
KAFKA_BROKERS=192.168.86.200:9092
KAFKA_BOOTSTRAP_SERVERS=192.168.86.200:9092
```

**Active Topics:**
- `agent-routing-decisions` - Routing decision events
- `agent-transformation-events` - Agent transformation events
- `router-performance-metrics` - Router performance metrics
- `agent-actions` - Agent action events

**Usage:** Consumed via `server/event-consumer.ts` (in-memory stream) and metrics aggregation.

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

## Current Integration Status (2025-10-31)

### ✅ Fully Integrated (Live Data)
1. **Intelligence Event Adapter**
   - Kafka-based request/response pattern for code analysis
   - Endpoint: `/api/intelligence/analysis/patterns`
   - Status: ✅ Working end-to-end with OmniArchon consumer
   - Test: `curl "http://localhost:3000/api/intelligence/events/test/patterns?path=node_*_effect.py&lang=python&timeout=15000"`

2. **PatternLearning Page**
   - Live pattern discovery via `/api/intelligence/analysis/patterns`
   - Shows real-time discovered patterns from intelligence service
   - Status: ✅ Integrated with live endpoint

3. **AgentOperations Page**
   - Live agent metrics via `/api/intelligence/agents/summary`
   - Live actions via `/api/intelligence/actions/recent`
   - Health checks via `/api/intelligence/health`
   - WebSocket integration for real-time updates
   - Status: ✅ Fully wired with explicit queryFn + error handling

4. **IntelligenceAnalytics Page**
   - Attempts live `/api/agents/performance` with transformation
   - Falls back to mock data if endpoint unavailable
   - Status: ✅ Partial (live with fallback)

### ⚠️ Partially Integrated
- **Intelligence Analytics**: Live endpoint attempted but may need backend transformation
- **Pattern Lineage**: Backend route exists, frontend may need wiring update

### 📋 Still Using Mock Data (Next Steps)
- Feature Showcase demos (using interactive mockups)
- Some intelligence metrics endpoints (fallbacks in place)

## Available Data & Replacing Mock Data

### PostgreSQL Tables (39 tables available)

**Agent Execution & Routing:**
- `agent_routing_decisions` - Routing decision history
- `agent_actions` - Agent action events
- `agent_manifest_injections` - Pattern injection events
- `agent_transformation_events` - Transformation events
- `v_agent_execution_trace` - View of execution traces

**Pattern & Code Intelligence:**
- `pattern_lineage_nodes` - Pattern node metadata
- `pattern_lineage_edges` - Pattern relationships
- `code_patterns` - Discovered code patterns
- `pattern_quality_scores` - Quality metrics

**Performance & Metrics:**
- `router_performance_metrics` - Router performance data
- `agent_performance_summary` - Aggregated agent metrics

### Quick Wins: Replace Mock Data

1. **Intelligence Analytics (`IntelligenceAnalytics.tsx`)**
   - **Issue:** `/api/agents/performance` returns object `{ overview: {...} }` but component expects array
   - **Fix:** Transform response in backend or add adapter in component:
     ```typescript
     // In intelligence-routes.ts or component
     const performanceArray = Object.entries(overview).map(([agentId, metrics]) => ({
       agentId,
       ...metrics
     }));
     ```

2. **Pattern Lineage (`PatternLineage.tsx`)**
   - **Source:** PostgreSQL `pattern_lineage_nodes` + `pattern_lineage_edges`
   - **Route:** Already exists at `/api/intelligence/patterns/lineage`
   - **Action:** Replace mock `patternNodes` with live query

3. **Node Network Visualization (`AgentNetwork.tsx`, `NodeNetworkComposer.tsx`)**
   - **Source:** Consul service registry + PostgreSQL agent metadata
   - **Route:** Query Consul at `http://192.168.86.200:28500/v1/agent/services` or use Omniarchon bridge
   - **Action:** Add API endpoint to aggregate service/node data

4. **Qdrant Pattern Search**
   - **Source:** Qdrant collections (`code_patterns`, `execution_patterns`)
   - **Action:** Add endpoint to query Qdrant directly:
     ```typescript
     // POST /api/intelligence/patterns/search
     // Body: { query: string, collection: 'code_patterns', limit: 10 }
     // Use: http://localhost:6333/collections/{collection}/points/search
     ```

5. **Feature Showcase Demos**
   - Use Omniarchon Intelligence API (`http://localhost:8053`) for:
     - Pattern similarity searches
     - Knowledge graph queries
     - Quality trend data

### Example: Querying PostgreSQL Directly

```typescript
// server/intelligence-routes.ts
import { db } from './storage';
import { agentActions } from '../shared/intelligence-schema';

// Get recent agent actions
const recentActions = await db
  .select()
  .from(agentActions)
  .orderBy(desc(agentActions.createdAt))
  .limit(100);
```

### Example: Querying Qdrant

```typescript
// server/intelligence-routes.ts
import fetch from 'node-fetch';

// Search code patterns
const response = await fetch('http://localhost:6333/collections/code_patterns/points/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    vector: embeddingVector, // 768-dim from embedding model
    limit: 10,
    with_payload: true
  })
});
const results = await response.json();
```

## PostgreSQL CRUD Adapter

Omnidash now includes a full CRUD adapter (`server/db-adapter.ts`) for direct database operations:

```typescript
import { dbAdapter } from './server/db-adapter';

// Query with filters, ordering, pagination
const actions = await dbAdapter.query('agent_actions', {
  where: { agent_name: 'test-agent' },
  limit: 100,
  orderBy: { column: 'created_at', direction: 'desc' }
});

// Insert, Update, Delete, Upsert
await dbAdapter.insert('agent_actions', { ... });
await dbAdapter.update('agent_actions', { id: '123' }, { status: 'completed' });
await dbAdapter.delete('agent_actions', { id: '123' });
await dbAdapter.upsert('agent_actions', { ... }, ['id']);
```

See `EVENT_BUS_AND_DB_ADAPTER.md` for complete usage guide.

## Event Bus Integration

Omnidash consumes Kafka events via `server/event-consumer.ts` for real-time updates. Future enhancement: Event bus publisher for async writes (see `EVENT_BUS_AND_DB_ADAPTER.md`).

## Appendix: References

- `INTELLIGENCE_INTEGRATION.md`
- `DASHBOARD_DATA_INTEGRATION_AUDIT.md`
- `EVENT_BUS_AND_DB_ADAPTER.md` - Event bus and CRUD adapter guide
- `server/intelligence-routes.ts`
- `server/db-adapter.ts` - PostgreSQL CRUD adapter
- `shared/intelligence-schema.ts`
- Scripts: `scripts/test-db-query.ts`, `scripts/test-routing-decisions.ts`


