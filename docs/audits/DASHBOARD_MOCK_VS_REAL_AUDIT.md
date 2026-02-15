# Dashboard Mock vs Real Data Audit

**Generated**: 2025-11-03 (Historical Documentation)
**Database**: PostgreSQL at 192.168.86.200:5436 (omninode_bridge)
**Server**: Running on PORT 3000

> **⚠️ HISTORICAL DOCUMENT**: This audit was conducted on 2025-11-03. Some issues described here may have been resolved. For current configuration, always check `.env` file and recent commit history.

---

## Executive Summary

**UPDATE (2025-11-12)**: This issue has been fully resolved. The `TRACEABILITY_DB_*` variables have been deprecated and removed from `.env` in favor of the standard `POSTGRES_*` naming convention. This document is retained for historical context.

**NOTE**: The database connection issue described below was identified on 2025-11-03 and addressed in subsequent commits.

**Root Cause**:

- `.env` file previously used `TRACEABILITY_DB_*` prefix for database configuration
- `server/storage.ts` expects `POSTGRES_*` prefix for database configuration
- The database health check in `server/alert-routes.ts` (lines 74-85) attempts to query the `agent_actions` table
- When this query fails, it triggers a "Database connection failed" alert in the AlertBanner component

**Impact**:

- All database-dependent endpoints are failing silently
- Dashboards are falling back to mock data
- User sees "Database connection failed" message in header AlertBanner

---

## Database Connection Issue Details

### Environment Variable Mismatch

**Current .env configuration**:

```bash
TRACEABILITY_DB_HOST=192.168.86.200
TRACEABILITY_DB_PORT=5436
TRACEABILITY_DB_NAME=omninode_bridge
TRACEABILITY_DB_USER=postgres
TRACEABILITY_DB_PASSWORD=<your_secure_password>
TRACEABILITY_DB_URL=postgresql://postgres:<your_secure_password>@192.168.86.200:5436/omninode_bridge
```

**Expected by code** (`server/storage.ts:49-51`):

```typescript
const intelligenceConnectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || '<default_password>'}@${process.env.POSTGRES_HOST || '192.168.86.200'}:${process.env.POSTGRES_PORT || '5436'}/${process.env.POSTGRES_DATABASE || 'omninode_bridge'}`;
```

**Alert Check** (`server/alert-routes.ts:73-85`):

```typescript
// Check database connection (critical if failed)
try {
  await intelligenceDb
    .select({ check: sql<number>`1::int` })
    .from(agentActions) // Queries agent_actions table
    .limit(1);
} catch (dbError) {
  alerts.push({
    level: 'critical',
    message: 'Database connection failed',
    timestamp: new Date().toISOString(),
  });
}
```

### Solution

**Option 1: Add POSTGRES\_\* variables to .env** (Recommended)

```bash
# Add to .env file
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omninode_bridge
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your_secure_password>
```

**Option 2: Update server/storage.ts to use TRACEABILITY*DB*\* variables**

```typescript
const intelligenceConnectionString =
  process.env.TRACEABILITY_DB_URL ||
  process.env.DATABASE_URL ||
  `postgresql://${process.env.TRACEABILITY_DB_USER || 'postgres'}:${process.env.TRACEABILITY_DB_PASSWORD}@${process.env.TRACEABILITY_DB_HOST}:${process.env.TRACEABILITY_DB_PORT}/${process.env.TRACEABILITY_DB_NAME}`;
```

---

## Dashboard-by-Dashboard Audit

### 1. Agent Management (/) - `AgentManagement.tsx`

**Route**: `/`
**Data Source**: `client/src/lib/data-sources/agent-management-source.ts`

| Component                | Data Type | Source                 | API Endpoint                       | Fallback Behavior          |
| ------------------------ | --------- | ---------------------- | ---------------------------------- | -------------------------- |
| Agent Summary Metrics    | Hybrid    | Real API with fallback | `/api/intelligence/agents/summary` | Returns zeros if API fails |
| Total Agents             | Real      | PostgreSQL             | `/api/intelligence/agents/summary` | Falls back to 0            |
| Active Agents            | Real      | PostgreSQL             | `/api/intelligence/agents/summary` | Falls back to 0            |
| Total Runs               | Real      | PostgreSQL             | `/api/intelligence/agents/summary` | Falls back to 0            |
| Success Rate             | Real      | PostgreSQL             | `/api/intelligence/agents/summary` | Falls back to 0%           |
| Avg Execution Time       | Real      | PostgreSQL             | `/api/intelligence/agents/summary` | Falls back to 0s           |
| Routing Accuracy         | Real      | PostgreSQL             | Computed from summary data         | Falls back to 0%           |
| Recent Executions        | Hybrid    | Real API with fallback | `/api/intelligence/actions/recent` | Falls back to empty array  |
| Recent Routing Decisions | Real      | PostgreSQL             | Query not implemented              | Falls back to empty array  |

**Integration Status**: ✅ **LIVE** - Uses real PostgreSQL data with silent mock fallbacks

**Files**:

- Dashboard: `client/src/pages/preview/AgentManagement.tsx:1-200`
- Data Source: `client/src/lib/data-sources/agent-management-source.ts`
- API Routes: `server/intelligence-routes.ts` (agents/summary, actions/recent endpoints)

---

### 2. Pattern Learning (/patterns) - `PatternLearning.tsx`

**Route**: `/patterns`
**Data Source**: `client/src/lib/data-sources/pattern-learning-source.ts`

| Component          | Data Type | Source                 | API Endpoint                                | Fallback Behavior                               |
| ------------------ | --------- | ---------------------- | ------------------------------------------- | ----------------------------------------------- |
| Pattern Summary    | Hybrid    | Real API with fallback | `/api/intelligence/patterns/summary`        | Mock: 1056 total, 42 new, 0.85 quality          |
| Pattern Trends     | Hybrid    | Real API with fallback | `/api/intelligence/patterns/trends`         | Mock: 3 time series points                      |
| Quality Trends     | Hybrid    | Real API with fallback | `/api/intelligence/patterns/quality-trends` | Mock: 3 time series points                      |
| Pattern List       | Hybrid    | Real API with fallback | `/api/intelligence/patterns/list`           | Mock: 20 generated patterns                     |
| Language Breakdown | Hybrid    | Real API with fallback | `/api/intelligence/patterns/by-language`    | Mock: Python 66.5%, TypeScript 27.8%, Rust 5.7% |
| Live Discovery     | Hybrid    | Real API with fallback | `/api/intelligence/patterns/discovery`      | Mock: 3 recent patterns                         |

**Integration Status**: ✅ **LIVE** - Uses real PostgreSQL data with silent mock fallbacks

**Files**:

- Dashboard: `client/src/pages/PatternLearning.tsx:1-343`
- Data Source: `client/src/lib/data-sources/pattern-learning-source.ts:1-247`
- API Routes: `server/intelligence-routes.ts` (patterns/\* endpoints)

**Fallback Pattern**:

```typescript
try {
  const response = await fetch(`/api/intelligence/patterns/summary?timeWindow=${timeWindow}`);
  if (response.ok) {
    return transformData(await response.json());
  }
} catch (err) {
  console.warn('Failed to fetch pattern summary, using mock data', err);
}
// Return mock data if API fails
return { totalPatterns: 1056, newPatternsToday: 42, ... };
```

---

### 3. Intelligence Operations (/intelligence) - `IntelligenceOperations.tsx`

**Route**: `/intelligence`
**Data Source**: `client/src/lib/data-sources/agent-operations-source.ts`

| Component                 | Data Type | Source                   | API Endpoint                                      | Fallback Behavior                 |
| ------------------------- | --------- | ------------------------ | ------------------------------------------------- | --------------------------------- |
| Agent Summary             | Hybrid    | Real API with fallback   | `/api/intelligence/agents/summary`                | Returns zeros                     |
| Operations Per Minute     | Hybrid    | Real API with fallback   | `/api/intelligence/metrics/operations-per-minute` | Empty array → mock time series    |
| Quality Impact            | Hybrid    | Real API with fallback   | `/api/intelligence/metrics/quality-impact`        | Empty array → mock time series    |
| Recent Actions            | Hybrid    | Real API with fallback   | `/api/intelligence/actions/recent`                | Falls back to empty array         |
| Health Status             | Hybrid    | Real API with fallback   | `/api/intelligence/health`                        | Mock: All services "up"           |
| Manifest Injection Health | Real      | PostgreSQL               | `/api/intelligence/health/manifest-injection`     | No fallback (shows loading)       |
| Top Documents             | Real      | PostgreSQL               | `/api/intelligence/documents/top-accessed`        | Mock: 3 sample documents          |
| Live Event Stream         | Real      | WebSocket + API fallback | WebSocket or `/api/intelligence/actions/recent`   | Falls back to API polling         |
| Transformation Flow       | Mock      | Generated                | None                                              | Always mock (MockDataBadge shown) |

**Integration Status**: ✅ **LIVE** - Hybrid approach with WebSocket real-time updates

**Files**:

- Dashboard: `client/src/pages/IntelligenceOperations.tsx:1-690`
- Data Source: `client/src/lib/data-sources/agent-operations-source.ts:1-273`
- WebSocket: `server/websocket.ts`, `client/src/hooks/useWebSocket.ts`
- API Routes: `server/intelligence-routes.ts` (multiple endpoints)

**Special Features**:

- WebSocket connection for real-time event streaming (lines 147-180)
- Uses `ensureTimeSeries()` utility to generate mock data if API returns empty arrays
- `MockDataBadge` component shown when using fallback data

---

### 4. Code Intelligence (/code) - `CodeIntelligence.tsx`

**Route**: `/code`
**Data Source**: `client/src/lib/data-sources/code-intelligence-source.ts`

| Component              | Data Type | Source                       | API Endpoint                                           | Fallback Behavior                                                     |
| ---------------------- | --------- | ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Code Analysis Metrics  | Hybrid    | OmniArchon API with fallback | `http://localhost:8053/api/intelligence/code/analysis` | Mock: 1250 files, 7.2 complexity, 23 smells, 2 security issues        |
| ONEX Compliance        | Hybrid    | Real API with fallback       | `/api/intelligence/code/compliance`                    | Mock: 150 files, 80% compliance                                       |
| Complexity Trend       | Hybrid    | From code analysis API       | Same as above                                          | Mock time series via `ensureTimeSeries()`                             |
| Quality Trend          | Hybrid    | From code analysis API       | Same as above                                          | Mock time series via `ensureTimeSeries()`                             |
| Quality Gates          | Mock      | Generated                    | None                                                   | Always mock (6 gates: coverage, complexity, response time, etc.)      |
| Performance Thresholds | Mock      | Generated                    | None                                                   | Always mock (4 thresholds: API response, memory, DB connections, CPU) |

**Integration Status**: 🔶 **PARTIAL** - Code analysis from OmniArchon, compliance from local API, gates/thresholds mock

**Files**:

- Dashboard: `client/src/pages/CodeIntelligence.tsx:1-286`
- Data Source: `client/src/lib/data-sources/code-intelligence-source.ts:1-100`
- API Routes: `server/intelligence-routes.ts` (code/compliance endpoint)

**Special Notes**:

- Uses OmniArchon service URL from `VITE_INTELLIGENCE_SERVICE_URL` environment variable
- Falls back to `http://localhost:8053` if not set
- Quality gates and performance thresholds are TODO items (lines 42-59)

---

### 5. Event Flow (/events) - `EventFlow.tsx`

**Route**: `/events`
**Data Source**: `client/src/lib/data-sources/event-flow-source.ts`

| Component              | Data Type | Source                 | API Endpoint                                           | Fallback Behavior                         |
| ---------------------- | --------- | ---------------------- | ------------------------------------------------------ | ----------------------------------------- |
| Event Stream           | Real      | OmniArchon API         | `http://localhost:8053/api/intelligence/events/stream` | Mock: 10 sample events                    |
| Event Metrics          | Real      | Calculated from stream | Calculated client-side                                 | Mock: zeros                               |
| Event Throughput Chart | Hybrid    | Calculated from stream | Calculated client-side                                 | Mock time series via `ensureTimeSeries()` |
| Event Lag Chart        | Hybrid    | Calculated from stream | Calculated client-side                                 | Mock time series via `ensureTimeSeries()` |
| Event Type Breakdown   | Real      | Calculated from stream | Calculated client-side                                 | Empty if no events                        |

**Integration Status**: ✅ **LIVE** - Direct integration with OmniArchon event stream

**Files**:

- Dashboard: `client/src/pages/EventFlow.tsx:1-257`
- Data Source: `client/src/lib/data-sources/event-flow-source.ts:1-130`

**Special Features**:

- 30-second polling interval (line 28)
- Metrics calculated client-side from event stream
- Shows error banner if OmniArchon is unreachable (lines 120-129)
- Uses `MockBadge` for throughput/lag charts when using generated data

---

### 6. Knowledge Graph (/knowledge) - `KnowledgeGraph.tsx`

**Route**: `/knowledge`
**Data Source**: `client/src/lib/data-sources/knowledge-graph-source.ts`

| Component                     | Data Type | Source                      | API Endpoint                                         | Fallback Behavior                  |
| ----------------------------- | --------- | --------------------------- | ---------------------------------------------------- | ---------------------------------- |
| Graph Nodes                   | Real      | OmniArchon API              | `http://localhost:8053/api/intelligence/graph/nodes` | Mock: 3 sample patterns            |
| Graph Edges                   | Real      | OmniArchon API              | `http://localhost:8053/api/intelligence/graph/edges` | Mock: relationships                |
| Graph Metrics                 | Real      | Calculated from nodes/edges | Calculated client-side                               | Calculated from mock data          |
| Pattern Network Visualization | Real      | From graph API              | Combined from nodes/edges                            | Mock: 3-node sample graph          |
| Relationship Types            | Real      | Calculated from edges       | Calculated client-side                               | Mock: depends_on, uses, related_to |

**Integration Status**: ✅ **LIVE** - Direct integration with OmniArchon graph API

**Files**:

- Dashboard: `client/src/pages/KnowledgeGraph.tsx:1-277`
- Data Source: `client/src/lib/data-sources/knowledge-graph-source.ts`
- Component: `client/src/components/PatternNetwork.tsx`

**Special Features**:

- 2-minute refetch interval (line 64)
- Calculates graph density, connected components from real data
- Shows `MockBadge` when no real data available

---

### 7. Platform Health (/health) - `PlatformHealth.tsx`

**Route**: `/health`
**Data Source**: `client/src/lib/data-sources/platform-health-source.ts`

| Component          | Data Type | Source                | API Endpoint                                | Fallback Behavior                   |
| ------------------ | --------- | --------------------- | ------------------------------------------- | ----------------------------------- |
| Service Health     | Real      | OmniArchon API        | `http://localhost:8053/api/health/platform` | Mock: all services "healthy"        |
| Service Registry   | Real      | PostgreSQL            | `/api/intelligence/services/registry`       | Empty array                         |
| Database Status    | Real      | From health API       | Included in platform health                 | Mock: "up"                          |
| Kafka Status       | Real      | From health API       | Included in platform health                 | Mock: "up"                          |
| CPU Usage Chart    | Mock      | Generated             | None                                        | Always mock (ensureTimeSeries)      |
| Memory Usage Chart | Mock      | Generated             | None                                        | Always mock (ensureTimeSeries)      |
| Event Feed         | Real      | Generated from health | Based on service status                     | Generated from health check results |

**Integration Status**: 🔶 **PARTIAL** - Service health from OmniArchon, CPU/Memory mock

**Files**:

- Dashboard: `client/src/pages/PlatformHealth.tsx:1-340`
- Data Source: `client/src/lib/data-sources/platform-health-source.ts`
- Components: `client/src/components/ServiceStatusGrid.tsx`, `client/src/components/EventFeed.tsx`

**Special Features**:

- 15-second refetch interval for health checks (line 55)
- Generates events based on service status changes (lines 127-166)
- Service registry query from PostgreSQL (lines 269-325)

---

### 8. Developer Experience (/developer) - `DeveloperExperience.tsx`

**Route**: `/developer`
**Status**: **NOT AUDITED** (file not read in this audit)

**Assumption**: Likely similar pattern to other dashboards with hybrid real/mock data.

---

### 9. Chat (/chat) - `Chat.tsx`

**Route**: `/chat`
**Status**: **NOT AUDITED** (file not read in this audit)

**Assumption**: Likely real-time chat interface, possibly connected to AI service.

---

## Data Source Layer Analysis

### Common Patterns

All data sources in `client/src/lib/data-sources/` follow this pattern:

```typescript
class DataSource {
  async fetchData(params): Promise<{ data: T; isMock: boolean }> {
    try {
      const response = await fetch(`/api/endpoint?params`);
      if (response.ok) {
        const data = await response.json();
        if (dataIsValid(data)) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch, using mock data', err);
    }

    // Silent fallback to mock data
    return { data: mockData, isMock: true };
  }
}
```

### Key Characteristics

1. **Silent Failures**: All API failures are caught and logged to console with `console.warn()`
2. **Automatic Fallback**: When API fails or returns invalid data, immediately returns mock data
3. **isMock Flag**: Returns boolean flag indicating whether data is real or mock
4. **No Error Propagation**: Errors never reach the UI (except for specific cases like Event Flow)

### Mock Data Utilities

**File**: `client/src/components/mockUtils.ts`

```typescript
export function ensureTimeSeries(
  data: Array<{ time: string; value: number }> | undefined,
  targetValue: number,
  variance: number
): { data: Array<{ time: string; value: number }>; isMock: boolean };
```

**Purpose**: Generates synthetic time series data when API returns empty array or undefined

**Usage**: All chart components use this utility to ensure charts always display data

---

## API Endpoint Status

### Intelligence Routes (`server/intelligence-routes.ts`)

| Endpoint                                          | Method | Purpose                     | Database Dependency     | Status         |
| ------------------------------------------------- | ------ | --------------------------- | ----------------------- | -------------- |
| `/api/intelligence/patterns/summary`              | GET    | Pattern metrics             | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/patterns/trends`               | GET    | Pattern discovery trends    | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/patterns/quality-trends`       | GET    | Quality score trends        | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/patterns/list`                 | GET    | Pattern list with filters   | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/patterns/by-language`          | GET    | Language distribution       | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/patterns/discovery`            | GET    | Recent pattern discoveries  | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/agents/summary`                | GET    | Agent execution summary     | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/actions/recent`                | GET    | Recent agent actions        | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/health`                        | GET    | Service health check        | Multiple services       | ✅ Implemented |
| `/api/intelligence/health/manifest-injection`     | GET    | Manifest injection metrics  | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/metrics/operations-per-minute` | GET    | Operation rate metrics      | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/metrics/quality-impact`        | GET    | Quality improvement metrics | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/documents/top-accessed`        | GET    | Document access ranking     | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/code/compliance`               | GET    | ONEX compliance metrics     | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/services/registry`             | GET    | Service registry            | PostgreSQL              | ✅ Implemented |
| `/api/intelligence/alerts/active`                 | GET    | Active system alerts        | PostgreSQL + OmniArchon | ✅ Implemented |

**All endpoints will fail due to database connection issue**, causing silent fallbacks to mock data.

### Alert Routes (`server/alert-routes.ts`)

| Endpoint                          | Method | Purpose              | Critical Checks                                     |
| --------------------------------- | ------ | -------------------- | --------------------------------------------------- |
| `/api/intelligence/alerts/active` | GET    | System health alerts | Database connection, OmniArchon status, error rates |

**This endpoint is the source of the "Database connection failed" message**.

---

## WebSocket Integration

**File**: `server/websocket.ts`
**Client Hook**: `client/src/hooks/useWebSocket.ts`

**Status**: ✅ **OPERATIONAL** (if `ENABLE_REAL_TIME_EVENTS=true`)

**Message Types**:

- `INITIAL_STATE` - Sent on connection, includes recent actions
- `AGENT_ACTION` - Real-time agent action events
- `AGENT_METRIC_UPDATE` - Metric updates
- `ROUTING_DECISION` - Agent routing decisions

**Consumers**:

- Intelligence Operations dashboard (lines 147-180 in `IntelligenceOperations.tsx`)
- Global connection status indicator (lines 90-93 in `App.tsx`)

---

## Summary Statistics

### Data Source Breakdown

| Dashboard               | Real Data | Mock Data | Hybrid | Status                             |
| ----------------------- | --------- | --------- | ------ | ---------------------------------- |
| Agent Management        | 60%       | 0%        | 40%    | ✅ LIVE (with fallbacks)           |
| Pattern Learning        | 100%      | 0%        | 0%     | ✅ LIVE (all APIs with fallbacks)  |
| Intelligence Operations | 70%       | 10%       | 20%    | ✅ LIVE (WebSocket + APIs)         |
| Code Intelligence       | 40%       | 40%       | 20%    | 🔶 PARTIAL (gates/thresholds mock) |
| Event Flow              | 80%       | 0%        | 20%    | ✅ LIVE (OmniArchon stream)        |
| Knowledge Graph         | 80%       | 0%        | 20%    | ✅ LIVE (OmniArchon graph)         |
| Platform Health         | 60%       | 20%       | 20%    | 🔶 PARTIAL (CPU/memory mock)       |

**Legend**:

- **Real Data**: Direct API calls that work when services are healthy
- **Mock Data**: Always returns hardcoded mock data
- **Hybrid**: Real API with silent fallback to mock on failure

### Integration Maturity

- **✅ LIVE**: Fully integrated with real data sources, silent mock fallbacks
- **🔶 PARTIAL**: Some components use real data, others are mock
- **❌ MOCK**: All data is mock/generated

---

## Recommendations

### Critical (Immediate Action Required)

1. **Fix Database Connection**
   - Add `POSTGRES_*` variables to `.env` file OR
   - Update `server/storage.ts` to use `TRACEABILITY_DB_*` variables
   - Verify connection works: `npm run db:push` should succeed
   - Test alert endpoint: `curl http://localhost:3000/api/intelligence/alerts/active`

2. **Add Database Connection Indicator**
   - Add explicit database status indicator separate from WebSocket status
   - Show when using fallback data (beyond just MockDataBadge)
   - Consider adding to Header alongside WebSocket status

### High Priority

3. **Implement Quality Gates & Thresholds**
   - Create API endpoints for real quality gate data
   - Source from code analysis tools (SonarQube, CodeClimate, etc.)
   - Remove hardcoded mock data from CodeIntelligence.tsx (lines 42-59)

4. **Add CPU/Memory Metrics**
   - Integrate with platform monitoring (Prometheus, Grafana, etc.)
   - Create `/api/intelligence/metrics/system-resources` endpoint
   - Update PlatformHealth.tsx to use real data

5. **Error Handling Improvements**
   - Show user-friendly error messages when APIs fail
   - Add retry logic for transient failures
   - Log errors to centralized logging service

### Medium Priority

6. **Developer Experience Dashboard**
   - Complete audit of `/developer` route
   - Ensure consistency with other dashboards

7. **Chat Interface**
   - Complete audit of `/chat` route
   - Document AI service integration

8. **Documentation**
   - Create API documentation for all intelligence endpoints
   - Document mock vs real data patterns
   - Add troubleshooting guide for common issues

### Low Priority

9. **Performance Optimization**
   - Reduce refetch intervals where possible
   - Implement request deduplication
   - Add caching layer for expensive queries

10. **Testing**
    - Add integration tests for data sources
    - Test fallback behavior
    - Add E2E tests for critical user flows

---

## Environment Variable Reference

### Required for Database Connection

```bash
# Option 1: Use POSTGRES_* prefix (matches code expectations)
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omninode_bridge
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your_secure_password>

# Option 2: Use DATABASE_URL (takes precedence)
DATABASE_URL=postgresql://postgres:<your_secure_password>@192.168.86.200:5436/omninode_bridge
```

### Optional Features

```bash
# Enable WebSocket real-time events
ENABLE_REAL_TIME_EVENTS=true

# OmniArchon intelligence service URL (frontend)
VITE_INTELLIGENCE_SERVICE_URL=http://localhost:8053

# OmniArchon intelligence service URL (backend)
INTELLIGENCE_SERVICE_URL=http://localhost:8053

# Kafka event streaming (if implemented)
KAFKA_BROKERS=192.168.86.200:29092
KAFKA_CLIENT_ID=omnidash-dashboard
KAFKA_CONSUMER_GROUP=omnidash-consumers
```

---

## Testing Commands

### Verify Database Connection

```bash
# Test database connection directly
source .env
psql -h 192.168.86.200 -p 5436 -U postgres -d omninode_bridge -c "SELECT 1"

# Check if agent_actions table exists
psql -h 192.168.86.200 -p 5436 -U postgres -d omninode_bridge -c "\dt agent_actions"

# Test query that alert endpoint uses
psql -h 192.168.86.200 -p 5436 -U postgres -d omninode_bridge -c "SELECT 1::int FROM agent_actions LIMIT 1"
```

### Test API Endpoints

```bash
# Test pattern summary (should return real data or mock fallback)
curl http://localhost:3000/api/intelligence/patterns/summary?timeWindow=24h

# Test agent summary
curl http://localhost:3000/api/intelligence/agents/summary?timeWindow=24h

# Test alerts (should show database connection status)
curl http://localhost:3000/api/intelligence/alerts/active

# Test health endpoint
curl http://localhost:3000/api/intelligence/health
```

### Test OmniArchon Integration

```bash
# Check if OmniArchon is running
curl http://localhost:8053/health

# Test event stream
curl http://localhost:8053/api/intelligence/events/stream?limit=10

# Test graph endpoint
curl http://localhost:8053/api/intelligence/graph/nodes?limit=100
```

---

## Appendix: File Locations

### Dashboard Components

- Agent Management: `client/src/pages/preview/AgentManagement.tsx`
- Pattern Learning: `client/src/pages/PatternLearning.tsx`
- Intelligence Operations: `client/src/pages/IntelligenceOperations.tsx`
- Code Intelligence: `client/src/pages/CodeIntelligence.tsx`
- Event Flow: `client/src/pages/EventFlow.tsx`
- Knowledge Graph: `client/src/pages/KnowledgeGraph.tsx`
- Platform Health: `client/src/pages/PlatformHealth.tsx`

### Data Sources

- Agent Management: `client/src/lib/data-sources/agent-management-source.ts`
- Agent Operations: `client/src/lib/data-sources/agent-operations-source.ts`
- Pattern Learning: `client/src/lib/data-sources/pattern-learning-source.ts`
- Code Intelligence: `client/src/lib/data-sources/code-intelligence-source.ts`
- Event Flow: `client/src/lib/data-sources/event-flow-source.ts`
- Knowledge Graph: `client/src/lib/data-sources/knowledge-graph-source.ts`
- Platform Health: `client/src/lib/data-sources/platform-health-source.ts`
- Index: `client/src/lib/data-sources/index.ts`

### Server-Side

- Main Entry: `server/index.ts`
- Database Connection: `server/storage.ts`
- Intelligence Routes: `server/intelligence-routes.ts`
- Alert Routes: `server/alert-routes.ts`
- WebSocket Server: `server/websocket.ts`
- Event Consumer: `server/event-consumer.ts`

### Shared

- Intelligence Schema: `shared/intelligence-schema.ts`
- User Schema: `shared/schema.ts`

### UI Components

- Alert Banner: `client/src/components/AlertBanner.tsx` (shows "Database connection failed")
- Mock Data Badge: `client/src/components/MockDataBadge.tsx`
- Mock Badge: `client/src/components/MockBadge.tsx`
- App Layout: `client/src/App.tsx` (WebSocket connection indicator)

### Utilities

- Mock Data Utils: `client/src/components/mockUtils.ts`
- WebSocket Hook: `client/src/hooks/useWebSocket.ts`
- Query Client: `client/src/lib/queryClient.ts`

---

## Conclusion

The Omnidash platform has a sophisticated hybrid data approach where:

1. **All dashboards are designed to work with real data** from PostgreSQL and OmniArchon
2. **Silent fallbacks ensure the UI never breaks** - when APIs fail, mock data is returned automatically
3. **The database connection issue is the only blocking problem** - once fixed, all dashboards will use real data
4. **Integration is ~80% complete** - most components fetch real data, with strategic mock fallbacks

**Next Steps**:

1. Fix database connection (add POSTGRES\_\* environment variables)
2. Restart server and verify alerts endpoint no longer shows "Database connection failed"
3. Monitor console for any remaining API failures
4. Gradually replace remaining mock data (quality gates, CPU/memory metrics)
