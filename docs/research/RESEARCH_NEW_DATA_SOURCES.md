# Research Report: New Data Sources and Capabilities from Archon and OmniClaude

**Date**: 2025-10-29
**Objective**: Discover newly available data sources, APIs, and capabilities from Archon and OmniClaude systems for Omnidash dashboard integration
**Research Scope**: Database tables, API endpoints, Kafka topics, and service capabilities

---

## Executive Summary

This research investigation discovered **39 PostgreSQL tables** (up from ~10 previously documented), **4 active Kafka topics**, and **1 healthy intelligence service** ready for integration. The database contains **209 routing decisions, 205 agent actions, and 1,033 code patterns** from the last 24 hours, representing significant real-time intelligence data.

**Key Finding**: The intelligence infrastructure is producing production-ready data, but many advanced features (document freshness, quality metrics, PR intelligence) exist in the schema but contain no data yet.

**Note**: Intelligence integration is work-in-progress. Some advanced capabilities (vector search, graph queries) are planned for future implementation phases.

### Service Health Status

| Service                     | Status     | Endpoint              | Notes                                    |
| --------------------------- | ---------- | --------------------- | ---------------------------------------- |
| **Omniarchon Intelligence** | ✅ Healthy | http://localhost:8053 | Memgraph, Ollama, freshness DB connected |
| **PostgreSQL Database**     | ✅ Healthy | 192.168.86.200:5436   | 39 tables, 209 routing decisions/24h     |
| **Kafka/Redpanda**          | ✅ Active  | 192.168.86.200:29092   | 4 topics producing events                |
| **Omnidash API**            | ✅ Working | http://localhost:3000 | Serving real data from Kafka + DB        |

---

## Newly Discovered Data Sources

### 1. Document Management System (NEW!)

**Tables**: `document_metadata`, `document_versions`, `document_access_log`, `document_dependencies`

**Current Data**:

- **33 documents** in "archon" repository
- Full document lifecycle tracking (create, update, delete, archive)
- **Vector search integration** (vector_id field for Qdrant)
- **Graph integration** (graph_id field for Memgraph)
- Access tracking with timestamps

**Schema Highlights** (`document_metadata`):

```sql
- id (uuid)
- repository (varchar)
- file_path (text)
- status (active/deprecated/deleted/archived/draft)
- content_hash (sha256)
- vector_id (for Qdrant semantic search)
- graph_id (for Memgraph relationships)
- metadata (jsonb) - extensible metadata
- access_count - popularity tracking
- last_accessed_at - usage analytics
```

**Dashboard Integration Opportunity**:

- **Code Intelligence Dashboard**: Show most accessed documents, recent changes
- **Knowledge Graph Dashboard**: Visualize document relationships via graph_id
- **Developer Experience**: Track which docs developers use most

**Integration Effort**: Medium (4-6h)

- Create `/api/intelligence/documents/summary` endpoint
- Query document_metadata with access analytics
- Join with document_access_log for usage trends

---

### 2. Document Freshness Tracking (NEW!)

**Tables**: `document_freshness`, `freshness_scores_history`, `freshness_metrics`, `document_dependencies`

**Current Data**: **0 records** (schema ready, not populated)

**Schema Highlights** (`document_freshness`):

```sql
- freshness_score (0.0-1.0) - how up-to-date is this doc
- freshness_level (fresh/stale/very_stale/unknown)
- importance_score (0.0-1.0) - how critical is this doc
- depends_on (jsonb) - dependency tracking
- dependent_by (jsonb) - reverse dependencies
- classification_confidence - ML confidence score
- last_modified vs last_analyzed - staleness detection
```

**Dashboard Integration Opportunity**:

- **Platform Health Dashboard**: Show stale documentation alerts
- **Code Intelligence**: Flag outdated patterns or deprecated APIs
- **Developer Experience**: Warn when using stale documentation

**Status**: ⚠️ **Schema ready, awaiting data population**

**Integration Effort**: Easy (1-2h) once data exists

- Omniarchon has `/api/freshness/summary` endpoint (404 currently)
- Wait for freshness service to populate data
- Add "Documentation Freshness" widget to Platform Health

---

### 3. ONEX Compliance Stamping (NEW!)

**Table**: `metadata_stamps`

**Current Data**: **1 stamp** (proof of concept)

**Schema Highlights**:

```sql
- file_hash (sha256) - unique file identifier
- file_path - location of stamped file
- stamp_data (jsonb) - ONEX compliance metadata
- protocol_version - stamping protocol version
- intelligence_data (jsonb) - Archon AI insights
- namespace - omninode.services.metadata
```

**Dashboard Integration Opportunity**:

- **Code Intelligence Dashboard**: Show ONEX compliance by file
- **Pattern Learning Dashboard**: Track compliance trends over time
- **Platform Health**: Alert on files missing stamps

**Status**: ✅ **Working, low volume**

**Integration Effort**: Easy (2h)

- Create `/api/intelligence/stamps/summary` endpoint
- Query metadata_stamps for compliance metrics
- Add "ONEX Compliance" metric card to Code Intelligence

---

### 4. Pattern PR Intelligence (NEW!)

**Table**: `pattern_pr_intelligence`

**Current Data**: **0 records** (schema ready, not populated)

**Schema Highlights**:

```sql
- pattern_id (references pattern_lineage_nodes)
- pr_number, pr_repository, pr_url
- mention_type (description/review_comment/inline_comment/commit_message)
- sentiment (positive/negative/neutral)
- pr_outcome (approved/changes_requested/merged/closed)
- time_to_merge_hours - velocity metric
- confidence_score - extraction confidence
```

**Dashboard Integration Opportunity**:

- **Pattern Learning Dashboard**: Show which patterns are mentioned in PRs
- **Developer Experience**: Track pattern adoption velocity
- **Intelligence Operations**: Measure pattern quality via PR outcomes

**Status**: ⚠️ **Schema ready, awaiting PR extraction**

**Integration Effort**: Medium (4h) once data exists

- Requires GitHub PR mining service to populate data
- High value for pattern adoption tracking
- Can correlate pattern quality with PR merge rate

---

### 5. Agent Execution Logs (Enhanced)

**Table**: `agent_execution_logs`

**Current Data**: **0 records from last 24h** (older data may exist)

**Schema Highlights**:

```sql
- correlation_id, session_id - distributed tracing
- user_prompt - original user request
- agent_name, agent_config - execution context
- status (in_progress/success/error/cancelled)
- quality_score (0.0-1.0) - execution quality
- duration_ms - performance tracking
- project_path, project_name - workspace context
- claude_session_id, terminal_id - Claude Code integration
```

**Dashboard Integration Opportunity**:

- **Agent Operations Dashboard**: Full execution history with quality scores
- **Developer Experience**: Track which agents deliver best results
- **Platform Health**: Detect agent failures and slow executions

**Status**: ✅ **Table exists, awaiting fresh data**

**Integration Effort**: Easy (2h)

- Add `/api/intelligence/executions/summary` endpoint
- Query by agent_name, status, quality_score
- Join with correlation_id for full traces

---

### 6. Task Completion Metrics (NEW!)

**Table**: `task_completion_metrics`

**Current Data**: **1 record** (proof of concept)

**Schema Highlights**:

```sql
- task_type, task_description - what was done
- completion_time_ms - how long it took
- success (boolean) - outcome
- agent_name - which agent completed it
- correlation_id - link to routing decision
- metadata (jsonb) - extensible task context
```

**Dashboard Integration Opportunity**:

- **Developer Experience Dashboard**: Task completion velocity
- **Agent Operations**: Agent efficiency by task type
- **Intelligence Operations**: Identify slow task types

**Status**: ✅ **Working, low volume**

**Integration Effort**: Easy (1-2h)

- Create `/api/intelligence/tasks/metrics` endpoint
- Aggregate by task_type, agent_name, success
- Show completion time trends over time

---

### 7. Workflow State Management (NEW!)

**Tables**: `workflow_state`, `workflow_projection`

**Current Data**: Unknown (need to query)

**Schema Highlights** (`workflow_state`):

```sql
- workflow_key (unique identifier)
- version (optimistic locking)
- state (jsonb) - current workflow state
- provenance (jsonb) - state change history
- schema_version - state schema evolution
```

**Dashboard Integration Opportunity**:

- **Agent Operations**: Show active workflow states
- **Developer Experience**: Track workflow completion rates
- **Platform Health**: Detect stuck workflows

**Status**: ⚠️ **Schema ready, data volume unknown**

**Integration Effort**: Medium (4h)

- Requires understanding workflow state schema
- Could power real-time workflow visualization
- Useful for multi-agent orchestration tracking

---

### 8. Event Metrics (Performance Tracking)

**Table**: `event_metrics`

**Current Data**: **0 records from last 24h**

**Schema Highlights**:

```sql
- event_id (uuid) - references specific event
- processing_time_ms - event processing latency
- kafka_publish_success - publishing reliability
- error_message - failure diagnostics
```

**Dashboard Integration Opportunity**:

- **Platform Health Dashboard**: Kafka publishing success rate
- **Event Flow Dashboard**: Event processing latency
- **Intelligence Operations**: Identify slow event handlers

**Status**: ✅ **Working, awaiting fresh data**

**Integration Effort**: Easy (1-2h)

- Query for Kafka publish success rate
- Calculate P50/P95/P99 processing times
- Alert on publish failures

---

### 9. Node Registrations (Service Discovery)

**Table**: `node_registrations`

**Current Data**: Unknown (need to query count)

**Schema Highlights**:

```sql
- node_id, node_type, node_version
- capabilities (jsonb) - what this node can do
- endpoints (jsonb) - how to reach this node
- health_status (HEALTHY/UNHEALTHY/UNKNOWN)
- last_heartbeat - liveness check
- health_endpoint - automated health checks
```

**Dashboard Integration Opportunity**:

- **Platform Health Dashboard**: Show all registered services
- **Infrastructure Overview**: Service topology map
- **Agent Operations**: Which agents are registered and healthy

**Status**: ⚠️ **Schema ready, data volume unknown**

**Integration Effort**: Easy (2h)

- Create `/api/intelligence/nodes/registry` endpoint
- Query for all nodes with health_status
- Show service topology visualization

---

## Existing Data Sources (Already Integrated)

### Working Dashboards with Real Data

1. **Agent Operations Dashboard** ✅
   - Data: `agent_routing_decisions` (209 records/24h), `agent_actions` (205 records/24h)
   - Kafka: `agent-routing-decisions`, `agent-actions` topics
   - Top agents: polymorphic-agent (46), repository-crawler (17), debug-intelligence (15)

2. **Pattern Learning Dashboard** ✅
   - Data: `pattern_lineage_nodes` (1,033 total patterns)
   - Breakdown: 686 Python functions, 287 Python classes, 60 code patterns
   - Kafka: Pattern discovery events from agent manifest injections

3. **Intelligence Operations Dashboard** ⚠️ Partial
   - Data: `agent_manifest_injections` (manifest snapshot tracking)
   - Missing: Real-time quality impact data (Omniarchon returns "insufficient_data")

4. **Event Flow Dashboard** ✅
   - Data: Kafka consumer metrics from event-consumer.ts
   - Topics: 4 active topics being consumed
   - Status: Real-time event streaming working

---

## Routing Strategy Breakdown (Last 24h)

**Total Decisions**: 209

| Strategy                    | Count | Percentage | Description                 |
| --------------------------- | ----- | ---------- | --------------------------- |
| `trigger`                   | 114   | 54.5%      | Fuzzy trigger matching      |
| `ai`                        | 90    | 43.1%      | AI-based routing            |
| `explicit_agent_request`    | 3     | 1.4%       | User explicitly named agent |
| `explicit_agent_invocation` | 1     | 0.5%       | Direct agent invocation     |

**Insight**: Trigger-based routing is most common (54.5%), followed by AI routing (43.1%). Very few explicit agent requests suggest good automatic routing.

---

## Top Agents by Activity (Last 24h)

| Agent                       | Routing Count | Avg Confidence | Notes                  |
| --------------------------- | ------------- | -------------- | ---------------------- |
| `agent-polymorphic-agent`   | 46            | 0.812          | Meta-agent for routing |
| `repository-crawler`        | 17            | 0.912          | High confidence        |
| `agent-debug-intelligence`  | 15            | 0.853          | Debugging tasks        |
| `agent-testing`             | 14            | 0.821          | Test generation        |
| `pr-review`                 | 11            | 0.932          | PR review automation   |
| `agent-ticket-manager`      | 11            | 0.800          | Ticket management      |
| `agent-commit`              | 10            | 0.800          | Commit generation      |
| `omniagent-smart-responder` | 8             | 0.913          | Smart responses        |
| `pr-workflow`               | 7             | 0.950          | Highest confidence     |
| `agent-observability`       | 6             | 0.942          | Observability tasks    |

**Insight**: PR-workflow has highest confidence (0.950), suggesting excellent agent-task fit. Polymorphic-agent handles most routing decisions.

---

## Omniarchon Intelligence Service APIs

### Available Endpoints

**Base URL**: http://localhost:8053

#### Working Endpoints

1. **Health Check** ✅

   ```bash
   GET /health
   ```

   Response:

   ```json
   {
     "status": "healthy",
     "memgraph_connected": true,
     "ollama_connected": true,
     "freshness_database_connected": true,
     "service_version": "1.0.0"
   }
   ```

2. **Quality Trends** ⚠️ No Data
   ```bash
   GET /api/quality-trends/project/{project_id}/trend?hours=24
   ```
   Response:
   ```json
   {
     "success": true,
     "project_id": "default",
     "trend": "insufficient_data",
     "snapshots_count": 0,
     "time_window_days": 30
   }
   ```
   **Status**: Endpoint works, but no quality snapshots exist yet

#### Missing/404 Endpoints

- `/api/projects` - 404 (different API structure)
- `/api/freshness/summary` - 404 (freshness service not exposed)
- `/api/intelligence/patterns/list` - 404 (may be under different path)

**Recommendation**: Need to review Omniarchon OpenAPI docs to discover full API surface

---

## Database Table Sizes

Top 15 tables by disk usage:

| Table                       | Size    | Records (24h) | Purpose                 |
| --------------------------- | ------- | ------------- | ----------------------- |
| `pattern_lineage_nodes`     | Largest | 1,033 total   | Code pattern discovery  |
| `agent_routing_decisions`   | Medium  | 209           | Agent selection history |
| `agent_actions`             | Medium  | 205           | Agent action tracking   |
| `agent_manifest_injections` | Medium  | Unknown       | Manifest snapshots      |
| `document_metadata`         | Small   | 33 total      | Document management     |
| `metadata_stamps`           | Small   | 1 total       | ONEX compliance         |
| `agent_execution_logs`      | Empty   | 0             | Execution history       |
| `pattern_quality_metrics`   | Empty   | 0             | Quality tracking        |
| `document_freshness`        | Empty   | 0             | Freshness tracking      |

**Observation**: Many advanced features have schema ready but no data yet (quality metrics, freshness, PR intelligence)

---

## Quick Win Integration Opportunities

### Ready to Integrate (< 4h each)

1. **Task Completion Metrics Widget** (2h)
   - Endpoint: `/api/intelligence/tasks/completion-rate`
   - Dashboard: Developer Experience
   - Data: `task_completion_metrics` table (1 record, proof of concept)

2. **ONEX Compliance Stamp Tracking** (2h)
   - Endpoint: `/api/intelligence/stamps/coverage`
   - Dashboard: Code Intelligence
   - Data: `metadata_stamps` table (1 stamp)

3. **Document Access Analytics** (3h)
   - Endpoint: `/api/intelligence/documents/popular`
   - Dashboard: Code Intelligence or new "Documentation" tab
   - Data: `document_metadata` (33 documents) + `document_access_log`

4. **Node Service Registry** (2h)
   - Endpoint: `/api/intelligence/nodes/health`
   - Dashboard: Platform Health
   - Data: `node_registrations` table

5. **Routing Strategy Analytics** (1h)
   - Endpoint: `/api/intelligence/routing/strategies`
   - Dashboard: Agent Operations
   - Data: Already have from `agent_routing_decisions`
   - Just need to add breakdown widget

### Medium Effort (4-6h each)

6. **Agent Execution Quality Tracking** (4h)
   - Endpoint: `/api/intelligence/executions/quality`
   - Dashboard: Agent Operations
   - Data: `agent_execution_logs` (needs fresh data)
   - Requires correlation with routing decisions

7. **Workflow State Visualization** (6h)
   - Endpoint: `/api/intelligence/workflows/active`
   - Dashboard: Agent Operations or new "Workflows" tab
   - Data: `workflow_state` + `workflow_projection`
   - Requires understanding workflow state schema

8. **Document Dependency Graph** (5h)
   - Endpoint: `/api/intelligence/documents/dependencies`
   - Dashboard: Knowledge Graph
   - Data: `document_dependencies` + `document_metadata`
   - Could power force-directed graph visualization

### Future (Awaiting Data)

9. **Document Freshness Alerts** (2h once data exists)
   - Dashboard: Platform Health
   - Data: `document_freshness` (0 records currently)

10. **Pattern PR Intelligence** (4h once data exists)
    - Dashboard: Pattern Learning
    - Data: `pattern_pr_intelligence` (0 records currently)

11. **Quality Metrics Trends** (3h once data exists)
    - Dashboard: Intelligence Operations
    - Data: `pattern_quality_metrics` (0 records currently)

---

## Previously Broken Endpoints - Re-test Results

### Developer Experience

**Endpoint**: `/api/intelligence/developer/metrics?timeWindow=24h`

**Status**: ❌ **Endpoint doesn't exist**

- Current dashboard uses:
  - `/api/intelligence/developer/workflows` ✅ Working
  - `/api/intelligence/developer/velocity` ✅ Working
  - `/api/intelligence/developer/productivity` ✅ Working

**Recommendation**: Developer Experience dashboard is working with 3 separate endpoints instead of 1 unified metrics endpoint

### Code Intelligence Quality Gates

**Endpoint**: `/api/intelligence/code/analysis`

**Status**: ❌ **Not implemented**

- No route exists in `intelligence-routes.ts`
- Could be implemented using `pattern_quality_metrics` table (once populated)

**Recommendation**: Need to implement quality gate endpoint

### Platform Health System Resources

**Endpoint**: `/api/intelligence/platform/resources`

**Status**: ❌ **Not implemented**

- Could use `node_registrations` for service health
- Could use `event_metrics` for Kafka performance
- Could use `connection_metrics` table

**Recommendation**: Implement system resources endpoint using existing tables

---

## Data Freshness Analysis

### Recent Activity (Last 24 Hours)

| Data Source               | Last Event        | Event Count | Freshness                    |
| ------------------------- | ----------------- | ----------- | ---------------------------- |
| `agent_routing_decisions` | Unknown (>6h ago) | 209         | ⚠️ Stale (no activity in 6h) |
| `agent_actions`           | Unknown (>6h ago) | 205         | ⚠️ Stale                     |
| `pattern_lineage_nodes`   | 974 created today | 1,033 total | ✅ Active                    |
| `agent_execution_logs`    | N/A               | 0           | ❌ No data                   |
| `task_completion_metrics` | N/A               | 1 total     | ⚠️ Proof of concept only     |

**Observation**: Most routing/action events are older (no activity in last 6 hours). Pattern discovery is most active with 974 new patterns today.

### Data Quality Assessment

**High Quality** (production-ready):

- ✅ `agent_routing_decisions` - complete, well-structured
- ✅ `agent_actions` - complete event history
- ✅ `pattern_lineage_nodes` - 1,033 patterns with language/type classification
- ✅ `document_metadata` - 33 documents with vector/graph IDs

**Medium Quality** (working, low volume):

- ⚠️ `metadata_stamps` - 1 stamp (proof of concept)
- ⚠️ `task_completion_metrics` - 1 record (proof of concept)
- ⚠️ `workflow_state` - unknown volume

**Awaiting Data** (schema ready):

- ❌ `pattern_quality_metrics` - 0 records
- ❌ `document_freshness` - 0 records
- ❌ `pattern_pr_intelligence` - 0 records
- ❌ `agent_execution_logs` - 0 recent records
- ❌ `event_metrics` - 0 recent records

---

## Kafka Topics Summary

**Broker**: 192.168.86.200:29092

**Active Topics** (being consumed by omnidash-event-consumer):

1. `agent-routing-decisions` - Agent selection events
2. `agent-transformation-events` - Polymorphic agent transformations
3. `router-performance-metrics` - Routing performance data
4. `agent-actions` - Agent tool calls and decisions

**Consumer Group**: `omnidash-consumers-v2`

**Status**: ✅ **All topics actively consumed and aggregated in memory**

**Event Retention**: 3-7 days (Kafka default)

---

## Integration Priorities (Recommended Order)

### Phase 1: Quick Wins (Week 1, ~12h total)

1. **Routing Strategy Breakdown Widget** (1h)
   - Add pie chart to Agent Operations showing trigger/AI/explicit split
   - Data already available in `agent_routing_decisions`

2. **Task Completion Metrics** (2h)
   - New metric cards in Developer Experience
   - Track task velocity and success rate

3. **ONEX Stamp Coverage** (2h)
   - Add widget to Code Intelligence
   - Show stamping compliance percentage

4. **Document Access Analytics** (3h)
   - New "Documentation" section in Code Intelligence
   - Most accessed docs, recent changes

5. **Node Service Registry** (2h)
   - Add "Service Health" section to Platform Health
   - Show registered nodes and health status

6. **Event Publishing Metrics** (2h)
   - Add Kafka publish success rate to Platform Health
   - Use `event_metrics` table

### Phase 2: Medium Complexity (Week 2, ~18h total)

7. **Agent Execution Quality Dashboard** (4h)
   - New visualizations in Agent Operations
   - Quality score trends per agent

8. **Document Dependency Visualization** (5h)
   - Knowledge Graph enhancement
   - Force-directed graph of document dependencies

9. **Workflow State Tracking** (6h)
   - New "Active Workflows" widget
   - Show in-progress multi-agent workflows

10. **Enhanced Pattern Analytics** (3h)
    - Add language/type filters to Pattern Learning
    - Pattern discovery velocity charts

### Phase 3: Awaiting Data (Future)

11. **Document Freshness Alerts** (2h)
    - Requires freshness service to populate data
    - High value for documentation quality

12. **Pattern PR Intelligence** (4h)
    - Requires PR mining service
    - High value for pattern adoption tracking

13. **Quality Metrics Trends** (3h)
    - Requires quality assessment service
    - High value for code quality tracking

---

## Missing Capabilities (Not Available)

1. **Real-Time Quality Snapshots** - Omniarchon has no data
   - `/api/quality-trends` endpoint works but returns "insufficient_data"
   - Need quality assessment service to populate snapshots

2. **Freshness Service APIs** - Not exposed
   - `/api/freshness/summary` returns 404
   - Freshness database is connected but no API access

3. **Pattern Quality Assessment** - Not running
   - `pattern_quality_metrics` table empty
   - Need quality assessment service to analyze patterns

4. **PR Mining Service** - Not running
   - `pattern_pr_intelligence` table empty
   - Need GitHub PR mining to track pattern mentions

---

## Recommendations

### Immediate Actions

1. **Populate Missing Data**
   - Run quality assessment service for `pattern_quality_metrics`
   - Run freshness service for `document_freshness`
   - Run PR mining for `pattern_pr_intelligence`

2. **Document Omniarchon API**
   - Generate OpenAPI spec or endpoint listing
   - Currently testing endpoints blindly
   - Would enable faster integration

### Dashboard Enhancements

1. **Agent Operations** - Add routing strategy breakdown, execution quality tracking
2. **Pattern Learning** - Add language/type filters, PR mention tracking
3. **Code Intelligence** - Add document analytics, ONEX compliance, quality gates
4. **Platform Health** - Add service registry, Kafka metrics, freshness alerts
5. **Developer Experience** - Add task completion metrics, workflow tracking

### Infrastructure Improvements

1. **Real-Time Data Flow**
   - Current data is 6+ hours old
   - Need to verify Kafka producers are running
   - Check agent execution to generate fresh events

2. **Service Monitoring**
   - Add health checks for all services to Platform Health
   - Use `node_registrations` for service discovery
   - Track service uptime and latency

3. **Data Quality Monitoring**
   - Track table growth rates
   - Alert on stale data (no events in 1+ hours)
   - Monitor Kafka consumer lag

---

## Conclusion

The intelligence infrastructure has **significantly matured** since the last audit, with 39 database tables providing comprehensive observability. However, many advanced features (freshness tracking, quality metrics, PR intelligence) exist in schema but lack data.

**Key Takeaway**: Focus on integrating the 10+ tables with real data first (routing decisions, actions, patterns, documents, tasks) before waiting for advanced features to be populated.

**Estimated Total Integration Effort**: 30-40 hours for all quick wins + medium complexity features

**Next Steps**:

1. Implement Phase 1 quick wins (12h) to maximize immediate dashboard value
2. Start services to populate missing data (freshness, quality, PR intelligence)
3. Document Omniarchon API for easier future integration
4. Add real-time monitoring to detect when new data sources become available
