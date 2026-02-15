# Intelligence Infrastructure Integration Guide

**Last Updated**: 2025-10-27
**Correlation ID**: 0f9ffdbb-acb4-46aa-ae74-5d5527a22b79
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Sources](#data-sources)
4. [Connection Details](#connection-details)
5. [Database Schema](#database-schema)
6. [Kafka Topics](#kafka-topics)
7. [Integration Patterns](#integration-patterns)
8. [Dashboard Ideas](#dashboard-ideas)
9. [Example Queries](#example-queries)
10. [API Endpoint Patterns](#api-endpoint-patterns)
11. [Real-Time Data Patterns](#real-time-data-patterns)
12. [Code Examples](#code-examples)

---

## Overview

This guide documents how to integrate OmniClaude's comprehensive intelligence infrastructure with the Omnidash visualization platform. The infrastructure provides rich observability data about AI agent operations, pattern discovery, routing decisions, and execution performance.

### What's Available

- **Event Bus Architecture**: Kafka/Redpanda for real-time event streaming
- **PostgreSQL Database**: 30+ tables tracking agent execution, routing, patterns, and performance
- **Vector Database**: Qdrant with 120+ code/execution patterns
- **Complete Traceability**: Full correlation ID tracking from user request → routing → manifest → execution

### Current Omnidash State

- **Technology**: React + TypeScript + Express monorepo
- **ORM**: Drizzle with PostgreSQL
- **State Management**: TanStack Query v5
- **Visualization**: Recharts
- **Current Data**: Mock data with setTimeout-based updates
- **Target**: Replace mock data with real intelligence infrastructure

---

## Architecture

### Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    Intelligence Infrastructure               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Kafka      │    │  PostgreSQL  │    │   Qdrant     │ │
│  │ 192.168.86   │    │ 192.168.86   │    │ archon-      │ │
│  │  .200:29092  │───▶│   .200:5436  │    │ qdrant:6333  │ │
│  │              │    │              │    │              │ │
│  │ 4 Topics     │    │ 34 Tables    │    │ 120+ Patterns│ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                    │                    │         │
│         └────────────────────┼────────────────────┘         │
│                              │                              │
└──────────────────────────────┼──────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Omnidash           │
                    │   Visualization      │
                    │   Platform           │
                    └──────────────────────┘
```

### Data Flow Patterns

**Pattern 1: Real-Time Event Stream** (Kafka → Dashboard)

```
Agent Event → Kafka Topic → WebSocket/SSE → Dashboard Update
Latency: <100ms
```

**Pattern 2: Historical Analysis** (PostgreSQL → Dashboard)

```
User Query → API Endpoint → SQL Query → Aggregated Data → Chart
Latency: <500ms
```

**Pattern 3: Pattern Discovery** (Qdrant → Dashboard)

```
Search Query → Vector Search → Similar Patterns → Visualization
Latency: <200ms
```

---

## Data Sources

### 1. PostgreSQL Database

**Host**: `192.168.86.200`
**Port**: `5436`
**Database**: `omnidash_analytics`
**User**: `postgres`
**Password**: (see environment variables)

**Key Tables** (30+ total):

| Table                         | Records  | Purpose                             | Update Frequency       |
| ----------------------------- | -------- | ----------------------------------- | ---------------------- |
| `agent_routing_decisions`     | ~1K/day  | Agent selection, confidence scoring | Per user request       |
| `agent_manifest_injections`   | ~1K/day  | Complete manifest snapshots         | Per agent execution    |
| `agent_transformation_events` | ~1K/day  | Agent transformations               | Per polymorphic switch |
| `agent_actions`               | ~50K/day | Tool calls, decisions, errors       | Per agent action       |
| `router_performance_metrics`  | ~1K/day  | Routing performance                 | Per routing decision   |
| `workflow_steps`              | ~10K/day | Workflow execution steps            | Per workflow step      |
| `llm_calls`                   | ~5K/day  | LLM API calls with costs            | Per LLM call           |
| `error_events`                | ~500/day | Error tracking                      | Per error              |
| `success_events`              | ~800/day | Success tracking                    | Per success            |
| `lineage_edges`               | ~20K/day | Data lineage graph                  | Continuous             |

### 2. Kafka Event Bus

**Brokers**: `192.168.86.200:29092`
**Protocol**: Kafka 2.x compatible
**Consumer Group**: `omnidash-consumers` (suggested)

**Topics**:

| Topic                         | Events/Day | Schema                            | Retention |
| ----------------------------- | ---------- | --------------------------------- | --------- |
| `agent-routing-decisions`     | ~1K        | Routing decisions with confidence | 7 days    |
| `agent-transformation-events` | ~1K        | Agent transformations             | 7 days    |
| `router-performance-metrics`  | ~1K        | Routing performance               | 7 days    |
| `agent-actions`               | ~50K       | Tool calls, decisions, errors     | 3 days    |

### 3. Qdrant Vector Database

**Host**: `archon-qdrant` (Docker network) or `192.168.86.101:6333`
**Collections**:

- `execution_patterns` (~50 patterns)
- `code_patterns` (~100 patterns)
- `workflow_events` (streaming)

**Note**: Direct Qdrant integration is planned for future implementation.

---

## Connection Details

### Environment Variables

Create `.env` file in omnidash root (copy from `.env.example` and update values):

```bash
# PostgreSQL Connection
# IMPORTANT: Replace <your_password> with actual password - never commit real passwords to git!
DATABASE_URL="postgresql://postgres:<your_password>@192.168.86.200:5436/omnidash_analytics"
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omnidash_analytics
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your_password>

# Kafka Connection
KAFKA_BROKERS=192.168.86.200:29092
KAFKA_CLIENT_ID=omnidash-dashboard
KAFKA_CONSUMER_GROUP=omnidash-consumers

# Feature Flags
ENABLE_REAL_TIME_EVENTS=true
```

### Network Access

**Requirements**:

- Dashboard server must have network access to `192.168.86.0/24` subnet
- Ports required: 5436 (PostgreSQL), 29092 (Kafka), 6333 (Qdrant)
- No authentication required for local development (production: add auth)

---

## Database Schema

### Core Tables for Dashboards

#### 1. `agent_routing_decisions`

Tracks which agent was selected for each user request with confidence scoring.

```sql
CREATE TABLE agent_routing_decisions (
    id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    session_id UUID,

    -- User input
    user_request TEXT NOT NULL,
    user_request_hash VARCHAR(64),
    context_snapshot JSONB,

    -- Routing decision
    selected_agent VARCHAR(255) NOT NULL,
    confidence_score NUMERIC(5,4) NOT NULL, -- 0.0-1.0
    routing_strategy VARCHAR(100) NOT NULL,

    -- Confidence breakdown (4-component scoring)
    trigger_confidence NUMERIC(5,4),
    context_confidence NUMERIC(5,4),
    capability_confidence NUMERIC(5,4),
    historical_confidence NUMERIC(5,4),

    -- Alternative recommendations
    alternatives JSONB,
    reasoning TEXT,

    -- Performance
    routing_time_ms INTEGER NOT NULL,
    cache_hit BOOLEAN DEFAULT FALSE,

    -- Outcome (filled after execution)
    selection_validated BOOLEAN DEFAULT FALSE,
    actual_success BOOLEAN,
    actual_quality_score NUMERIC(5,4),

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Dashboard Use Cases**:

- Agent success rates over time
- Confidence score distributions
- Routing strategy effectiveness
- Cache hit rate monitoring

#### 2. `agent_manifest_injections`

Complete manifest snapshots for execution replay and debugging.

```sql
CREATE TABLE agent_manifest_injections (
    id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    routing_decision_id UUID REFERENCES agent_routing_decisions(id),

    agent_name VARCHAR(255) NOT NULL,
    manifest_version VARCHAR(50) NOT NULL,
    generation_source VARCHAR(100) NOT NULL,
    is_fallback BOOLEAN DEFAULT FALSE,

    -- Query results summary
    patterns_count INTEGER DEFAULT 0,
    infrastructure_services INTEGER DEFAULT 0,
    debug_intelligence_successes INTEGER DEFAULT 0,
    debug_intelligence_failures INTEGER DEFAULT 0,

    -- Performance metrics
    query_times JSONB NOT NULL,
    total_query_time_ms INTEGER NOT NULL,

    -- Complete manifest snapshot
    full_manifest_snapshot JSONB NOT NULL,

    -- Outcome tracking
    agent_execution_success BOOLEAN,
    agent_execution_time_ms INTEGER,
    agent_quality_score NUMERIC(5,4),

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Dashboard Use Cases**:

- Manifest generation performance
- Intelligence query time breakdown
- Pattern discovery trends
- Fallback rate monitoring

#### 3. `agent_actions`

Comprehensive debug logging of every agent action.

```sql
CREATE TABLE agent_actions (
    id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    agent_name TEXT NOT NULL,

    -- Action classification
    action_type TEXT NOT NULL, -- tool_call, decision, error, success
    action_name TEXT NOT NULL,
    action_details JSONB DEFAULT '{}',

    -- Performance
    debug_mode BOOLEAN DEFAULT TRUE,
    duration_ms INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Dashboard Use Cases**:

- Tool usage heatmaps
- Agent execution timelines
- Error rate tracking
- Action frequency analysis

#### 4. Views for Analysis

**v_agent_execution_trace**: Complete trace from routing → manifest → execution

```sql
CREATE VIEW v_agent_execution_trace AS
SELECT
    ard.correlation_id,
    ard.user_request,
    ard.selected_agent,
    ard.confidence_score,
    ard.reasoning,
    ami.patterns_count,
    ami.total_query_time_ms,
    ami.agent_execution_success,
    ami.agent_quality_score,
    ard.created_at AS routing_time,
    ami.created_at AS manifest_time
FROM agent_routing_decisions ard
LEFT JOIN agent_manifest_injections ami
    ON ard.correlation_id = ami.correlation_id;
```

---

## Kafka Topics

### Topic Schemas

#### 1. `agent-routing-decisions`

**Event Schema**:

```typescript
interface AgentRoutingDecisionEvent {
  correlation_id: string;
  user_request: string;
  selected_agent: string;
  confidence_score: number; // 0.0-1.0
  routing_strategy: string;
  routing_time_ms: number;
  alternatives?: Array<{
    agent: string;
    confidence: number;
    reason: string;
  }>;
  reasoning?: string;
  timestamp: string; // ISO 8601
}
```

**Example Event**:

```json
{
  "correlation_id": "0f9ffdbb-acb4-46aa-ae74-5d5527a22b79",
  "user_request": "optimize database queries",
  "selected_agent": "agent-performance",
  "confidence_score": 0.92,
  "routing_strategy": "enhanced_fuzzy_matching",
  "routing_time_ms": 45,
  "alternatives": [
    { "agent": "agent-database", "confidence": 0.89, "reason": "exact capability match" },
    { "agent": "agent-debug", "confidence": 0.76, "reason": "moderate trigger match" }
  ],
  "reasoning": "High confidence match on 'optimize' and 'performance' triggers",
  "timestamp": "2025-10-27T13:26:45.123Z"
}
```

#### 2. `agent-transformation-events`

**Event Schema**:

```typescript
interface AgentTransformationEvent {
  correlation_id: string;
  source_agent: string;
  target_agent: string;
  transformation_reason: string;
  confidence_score: number;
  transformation_duration_ms: number;
  success: boolean;
  timestamp: string;
}
```

#### 3. `router-performance-metrics`

**Event Schema**:

```typescript
interface RouterPerformanceMetricsEvent {
  correlation_id: string;
  query_text: string;
  routing_duration_ms: number;
  cache_hit: boolean;
  trigger_match_strategy: string;
  candidates_evaluated: number;
  confidence_components?: {
    trigger: number;
    context: number;
    capability: number;
    historical: number;
  };
  timestamp: string;
}
```

#### 4. `agent-actions`

**Event Schema**:

```typescript
interface AgentActionEvent {
  correlation_id: string;
  agent_name: string;
  action_type: 'tool_call' | 'decision' | 'error' | 'success';
  action_name: string;
  action_details: Record<string, any>;
  duration_ms?: number;
  timestamp: string;
}
```

---

## Integration Patterns

### Pattern 1: Database-Backed API Endpoints

**Recommended Approach**: Create Express API endpoints that query PostgreSQL and return aggregated data.

**Advantages**:

- Simple to implement with existing Drizzle ORM
- Works with existing TanStack Query patterns
- Can cache results for performance
- No WebSocket complexity

**Implementation Location**: `server/routes.ts`

```typescript
// Example endpoint structure
app.get('/api/agent-metrics', async (req, res) => {
  // Query PostgreSQL
  // Aggregate data
  // Return JSON
});
```

### Pattern 2: WebSocket for Real-Time Updates

**Recommended Approach**: Add WebSocket server that consumes Kafka and broadcasts to connected clients.

**Advantages**:

- Real-time updates (<100ms latency)
- Efficient for high-frequency updates
- Matches existing dashboard design (real-time monitoring)

**Implementation Location**: `server/websocket.ts` (new file)

```typescript
// Example WebSocket pattern
wss.on('connection', (ws) => {
  // Subscribe to Kafka topics
  // Broadcast events to client
});
```

### Pattern 3: Server-Sent Events (SSE)

**Recommended Approach**: Simpler alternative to WebSocket for one-way real-time updates.

**Advantages**:

- Simpler than WebSocket
- Built-in browser reconnection
- Works with existing HTTP infrastructure

**Implementation Location**: `server/routes.ts`

```typescript
// Example SSE endpoint
app.get('/api/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  // Stream Kafka events
});
```

### Recommended Integration Strategy

**Phase 1: Database API (Week 1)**

1. Add PostgreSQL queries to `server/routes.ts`
2. Create aggregation endpoints for each dashboard
3. Replace mock data with API calls using TanStack Query
4. Test with historical data

**Phase 2: Real-Time Events (Week 2)**

1. Add Kafka consumer to Express server
2. Implement WebSocket or SSE server
3. Subscribe to relevant topics per dashboard
4. Add real-time update logic to dashboard components

**Phase 3: Advanced Features (Week 3+)**

1. Add Qdrant integration for pattern search
2. Implement caching layer (Redis)
3. Add data aggregation jobs for performance
4. Optimize queries with materialized views

---

## Dashboard Ideas

### 1. Agent Operations Dashboard (Currently: `AgentOperations.tsx`)

**Data Sources**:

- `agent_routing_decisions` - Agent selection frequency
- `agent_actions` - Tool usage tracking
- `agent_transformation_events` - Agent switches
- Topic: `agent-actions` - Real-time action stream

**Metrics to Add**:

- **Active Agents** (real): Count of agents used in last hour
- **Success Rate by Agent**: `actual_success` from routing decisions
- **Average Response Time**: `duration_ms` from agent_actions
- **Tool Usage Heatmap**: action_name frequency from agent_actions
- **Agent Status Grid**: Replace mock data with real agent execution status

**Example Query**:

```sql
-- Agent success rates over last 24 hours
SELECT
    selected_agent,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE actual_success = TRUE) as successes,
    ROUND(AVG(routing_time_ms), 2) as avg_routing_ms,
    ROUND(AVG(confidence_score), 3) as avg_confidence
FROM agent_routing_decisions
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND selection_validated = TRUE
GROUP BY selected_agent
ORDER BY total_requests DESC;
```

### 2. Pattern Learning Dashboard (Currently: `PatternLearning.tsx`)

**Data Sources**:

- `agent_manifest_injections` - Pattern discovery metrics
- Qdrant via MCP - Pattern similarity search
- `pattern_feedback_log` - Pattern feedback

**Metrics to Add**:

- **Patterns Discovered**: trends over time
- **Pattern Quality Scores**: distribution
- **Pattern Reuse Rate**: how often patterns are referenced
- **Pattern Network Graph**: relationships between patterns
- **Discovery Source Breakdown**: Qdrant vs PostgreSQL

**Example Query**:

```sql
-- Pattern discovery trends
SELECT
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as manifests_generated,
    AVG(patterns_count) as avg_patterns_per_manifest,
    AVG(total_query_time_ms) as avg_query_time_ms
FROM agent_manifest_injections
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;
```

### 3. Intelligence Operations Dashboard (Currently: `IntelligenceOperations.tsx`)

**Data Sources**:

- `agent_manifest_injections` - Intelligence query performance
- `llm_calls` - LLM usage and costs
- `workflow_steps` - Workflow execution

**Metrics to Add**:

- **Intelligence Query Performance**: query_times breakdown
- **Fallback Rate**: is_fallback percentage
- **Debug Intelligence Hits**: successful pattern matches
- **LLM Cost Tracking**: computed_cost_usd aggregation
- **Manifest Generation Timeline**: total_query_time_ms over time

**Example Query**:

```sql
-- Intelligence query performance breakdown
SELECT
    generation_source,
    COUNT(*) as total_manifests,
    ROUND(AVG(total_query_time_ms), 2) as avg_total_ms,
    ROUND(AVG(patterns_count), 1) as avg_patterns,
    ROUND(AVG((query_times->>'patterns')::numeric), 2) as avg_pattern_query_ms,
    ROUND(AVG((query_times->>'infrastructure')::numeric), 2) as avg_infra_query_ms,
    COUNT(*) FILTER (WHERE is_fallback = TRUE) as fallback_count
FROM agent_manifest_injections
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY generation_source;
```

### 4. Event Flow Dashboard (Currently: `EventFlow.tsx`)

**Data Sources**:

- Kafka consumer lag metrics
- `event_processing_metrics` - Event processing performance
- Direct Kafka topic metrics

**Metrics to Add**:

- **Real Kafka Topics**: Replace mock topics with actual topics
- **Consumer Lag**: Track lag per topic
- **Event Throughput**: Events per second per topic
- **Processing Latency**: Time from publish to consume
- **Dead Letter Queue**: Failed event tracking

**Kafka Consumer Pattern**:

```typescript
// Example Kafka metrics collection
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  brokers: ['192.168.86.200:29092'],
});

const admin = kafka.admin();
await admin.fetchTopicMetadata({ topics: ['agent-actions'] });
// Get lag, partition info, etc.
```

### 5. Code Intelligence Dashboard (Currently: `CodeIntelligence.tsx`)

**Data Sources**:

- Qdrant via MCP - Semantic code search
- `workflow_steps` - Code generation steps
- `generation_performance_metrics` - Code gen performance

**Metrics to Add**:

- **Semantic Search Performance**: Query times and result quality
- **Code Pattern Matches**: Similar code patterns found
- **Quality Gate Results**: Quality score distribution
- **Vector Search Stats**: Collection sizes, query performance

### 6. Platform Health Dashboard (Currently: `PlatformHealth.tsx`)

**Data Sources**:

- `error_events` - System errors
- `generation_performance_metrics` - Performance metrics
- Database connection pool stats
- Kafka broker health

**Metrics to Add**:

- **Service Status**: PostgreSQL, Kafka, Qdrant health
- **Error Rates**: Errors per minute by type
- **Performance P95/P99**: Latency percentiles
- **Database Connection Pool**: Active/idle connections
- **Kafka Broker Status**: Broker availability

**Example Query**:

```sql
-- Error rate trends
SELECT
    DATE_TRUNC('minute', created_at) as minute,
    error_type,
    COUNT(*) as error_count
FROM error_events
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY minute, error_type
ORDER BY minute DESC;
```

### 7. Developer Experience Dashboard (Currently: `DeveloperExperience.tsx`)

**Data Sources**:

- `agent_routing_decisions` - Routing decision accuracy
- `agent_actions` - Developer tool usage
- `workflow_steps` - Workflow duration
- `llm_calls` - LLM response times

**Metrics to Add**:

- **Routing Accuracy**: Actual vs predicted success
- **Time to First Response**: Initial agent response time
- **Workflow Completion Time**: End-to-end duration
- **Tool Usage by Developer**: Action frequency per user
- **Confidence Calibration**: How well confidence predicts success

---

## Example Queries

### Agent Performance Queries

#### 1. Agent Success Rates Over Time

```sql
SELECT
    DATE_TRUNC('hour', ard.created_at) as hour,
    ard.selected_agent,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE ami.agent_execution_success = TRUE) as successful,
    ROUND(AVG(ami.agent_execution_time_ms), 2) as avg_execution_time_ms,
    ROUND(AVG(ami.agent_quality_score), 3) as avg_quality_score
FROM agent_routing_decisions ard
LEFT JOIN agent_manifest_injections ami
    ON ard.correlation_id = ami.correlation_id
WHERE ard.created_at > NOW() - INTERVAL '7 days'
    AND ami.agent_execution_success IS NOT NULL
GROUP BY hour, ard.selected_agent
ORDER BY hour DESC, total_executions DESC;
```

#### 2. Routing Confidence Calibration

```sql
-- How well does confidence predict success?
SELECT
    FLOOR(confidence_score * 10) / 10 as confidence_bucket,
    COUNT(*) as total_decisions,
    COUNT(*) FILTER (WHERE actual_success = TRUE) as successes,
    ROUND(
        COUNT(*) FILTER (WHERE actual_success = TRUE)::numeric /
        COUNT(*)::numeric,
        3
    ) as actual_success_rate
FROM agent_routing_decisions
WHERE selection_validated = TRUE
    AND created_at > NOW() - INTERVAL '30 days'
GROUP BY confidence_bucket
ORDER BY confidence_bucket DESC;
```

#### 3. Tool Usage Heatmap

```sql
SELECT
    agent_name,
    action_name,
    COUNT(*) as usage_count,
    ROUND(AVG(duration_ms), 2) as avg_duration_ms,
    COUNT(*) FILTER (WHERE action_type = 'error') as error_count
FROM agent_actions
WHERE created_at > NOW() - INTERVAL '24 hours'
    AND action_type = 'tool_call'
GROUP BY agent_name, action_name
ORDER BY usage_count DESC
LIMIT 50;
```

### Pattern Discovery Queries

#### 4. Pattern Discovery Trends

```sql
SELECT
    DATE_TRUNC('day', created_at) as day,
    COUNT(*) as manifests_generated,
    AVG(patterns_count) as avg_patterns,
    AVG(debug_intelligence_successes) as avg_successful_patterns,
    AVG(debug_intelligence_failures) as avg_failed_patterns,
    AVG(total_query_time_ms) as avg_query_time_ms,
    COUNT(*) FILTER (WHERE is_fallback = TRUE) as fallback_count
FROM agent_manifest_injections
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

#### 5. Intelligence Query Performance Breakdown

```sql
SELECT
    agent_name,
    AVG(total_query_time_ms) as avg_total_query_ms,
    AVG((query_times->>'patterns')::numeric) as avg_pattern_query_ms,
    AVG((query_times->>'infrastructure')::numeric) as avg_infra_query_ms,
    AVG((query_times->>'models')::numeric) as avg_model_query_ms,
    AVG((query_times->>'schemas')::numeric) as avg_schema_query_ms,
    AVG((query_times->>'debug_intelligence')::numeric) as avg_debug_intel_ms,
    COUNT(*) as total_manifests
FROM agent_manifest_injections
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY agent_name
ORDER BY avg_total_query_ms DESC;
```

### Performance Monitoring Queries

#### 6. Routing Performance Percentiles

```sql
SELECT
    routing_strategy,
    COUNT(*) as total_routings,
    ROUND(AVG(routing_time_ms), 2) as avg_ms,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY routing_time_ms), 2) as p50_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY routing_time_ms), 2) as p95_ms,
    ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY routing_time_ms), 2) as p99_ms,
    COUNT(*) FILTER (WHERE cache_hit = TRUE) as cache_hits
FROM agent_routing_decisions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY routing_strategy
ORDER BY total_routings DESC;
```

#### 7. Error Rate Analysis

```sql
SELECT
    DATE_TRUNC('hour', created_at) as hour,
    error_type,
    COUNT(*) as error_count,
    COUNT(DISTINCT correlation_id) as affected_executions
FROM error_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour, error_type
ORDER BY hour DESC, error_count DESC;
```

### Execution Traceability Queries

#### 8. Complete Execution Trace (using view)

```sql
SELECT
    correlation_id,
    user_request,
    selected_agent,
    confidence_score,
    routing_strategy,
    patterns_count,
    total_query_time_ms,
    agent_execution_success,
    agent_quality_score,
    routing_time,
    manifest_time
FROM v_agent_execution_trace
WHERE routing_time > NOW() - INTERVAL '1 hour'
ORDER BY routing_time DESC
LIMIT 100;
```

#### 9. Agent Action Timeline

```sql
SELECT
    correlation_id,
    agent_name,
    action_type,
    action_name,
    duration_ms,
    created_at,
    action_details
FROM agent_actions
WHERE correlation_id = '0f9ffdbb-acb4-46aa-ae74-5d5527a22b79'
ORDER BY created_at ASC;
```

---

## API Endpoint Patterns

### REST API Design

Add these endpoints to `server/routes.ts`:

```typescript
import { Router } from 'express';
import { db } from './storage'; // Your Drizzle instance

export const intelligenceRouter = Router();

// ============================================================================
// Agent Metrics Endpoints
// ============================================================================

/**
 * GET /api/intelligence/agents/metrics
 * Get agent performance metrics with time window
 */
intelligenceRouter.get('/agents/metrics', async (req, res) => {
  const { timeWindow = '24h', agent = null } = req.query;

  // Convert timeWindow to PostgreSQL interval
  const interval =
    timeWindow === '24h'
      ? '24 hours'
      : timeWindow === '7d'
        ? '7 days'
        : timeWindow === '30d'
          ? '30 days'
          : '24 hours';

  const query = `
    SELECT
      selected_agent,
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE actual_success = TRUE) as successes,
      ROUND(AVG(routing_time_ms), 2) as avg_routing_ms,
      ROUND(AVG(confidence_score), 3) as avg_confidence,
      COUNT(*) FILTER (WHERE cache_hit = TRUE) as cache_hits
    FROM agent_routing_decisions
    WHERE created_at > NOW() - INTERVAL '${interval}'
      AND selection_validated = TRUE
      ${agent ? `AND selected_agent = '${agent}'` : ''}
    GROUP BY selected_agent
    ORDER BY total_requests DESC
  `;

  const results = await db.raw(query);
  res.json(results);
});

/**
 * GET /api/intelligence/agents/:agent/actions
 * Get action timeline for specific agent
 */
intelligenceRouter.get('/agents/:agent/actions', async (req, res) => {
  const { agent } = req.params;
  const { timeWindow = '1h', limit = 100 } = req.query;

  const query = `
    SELECT
      correlation_id,
      action_type,
      action_name,
      duration_ms,
      created_at,
      action_details
    FROM agent_actions
    WHERE agent_name = $1
      AND created_at > NOW() - INTERVAL '${timeWindow === '1h' ? '1 hour' : '24 hours'}'
    ORDER BY created_at DESC
    LIMIT $2
  `;

  const results = await db.raw(query, [agent, limit]);
  res.json(results);
});

// ============================================================================
// Pattern Discovery Endpoints
// ============================================================================

/**
 * GET /api/intelligence/patterns/trends
 * Get pattern discovery trends over time
 */
intelligenceRouter.get('/patterns/trends', async (req, res) => {
  const { timeWindow = '7d' } = req.query;

  const query = `
    SELECT
      DATE_TRUNC('day', created_at) as day,
      COUNT(*) as manifests_generated,
      AVG(patterns_count) as avg_patterns,
      AVG(debug_intelligence_successes) as avg_successful_patterns,
      AVG(total_query_time_ms) as avg_query_time_ms
    FROM agent_manifest_injections
    WHERE created_at > NOW() - INTERVAL '${timeWindow === '7d' ? '7 days' : '30 days'}'
    GROUP BY day
    ORDER BY day DESC
  `;

  const results = await db.raw(query);
  res.json(results);
});

/**
 * GET /api/intelligence/patterns/performance
 * Get intelligence query performance breakdown
 */
intelligenceRouter.get('/patterns/performance', async (req, res) => {
  const query = `
    SELECT
      generation_source,
      COUNT(*) as total_manifests,
      ROUND(AVG(total_query_time_ms), 2) as avg_total_ms,
      ROUND(AVG(patterns_count), 1) as avg_patterns,
      ROUND(AVG((query_times->>'patterns')::numeric), 2) as avg_pattern_query_ms,
      COUNT(*) FILTER (WHERE is_fallback = TRUE) as fallback_count
    FROM agent_manifest_injections
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY generation_source
  `;

  const results = await db.raw(query);
  res.json(results);
});

// ============================================================================
// Performance Monitoring Endpoints
// ============================================================================

/**
 * GET /api/intelligence/performance/routing
 * Get routing performance percentiles
 */
intelligenceRouter.get('/performance/routing', async (req, res) => {
  const query = `
    SELECT
      routing_strategy,
      COUNT(*) as total_routings,
      ROUND(AVG(routing_time_ms), 2) as avg_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY routing_time_ms), 2) as p95_ms,
      ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY routing_time_ms), 2) as p99_ms
    FROM agent_routing_decisions
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY routing_strategy
  `;

  const results = await db.raw(query);
  res.json(results);
});

/**
 * GET /api/intelligence/errors/recent
 * Get recent errors for monitoring
 */
intelligenceRouter.get('/errors/recent', async (req, res) => {
  const { limit = 50 } = req.query;

  const query = `
    SELECT
      error_type,
      message,
      COUNT(*) as count,
      MAX(created_at) as last_seen,
      COUNT(DISTINCT correlation_id) as affected_executions
    FROM error_events
    WHERE created_at > NOW() - INTERVAL '1 hour'
    GROUP BY error_type, message
    ORDER BY count DESC
    LIMIT $1
  `;

  const results = await db.raw(query, [limit]);
  res.json(results);
});

// ============================================================================
// Traceability Endpoints
// ============================================================================

/**
 * GET /api/intelligence/trace/:correlationId
 * Get complete execution trace by correlation ID
 */
intelligenceRouter.get('/trace/:correlationId', async (req, res) => {
  const { correlationId } = req.params;

  const query = `
    SELECT * FROM v_agent_execution_trace
    WHERE correlation_id = $1
  `;

  const results = await db.raw(query, [correlationId]);
  res.json(results[0] || null);
});

// Mount router in server/index.ts
// app.use('/api/intelligence', intelligenceRouter);
```

### TanStack Query Integration

Update dashboard components to use real APIs:

```typescript
// In client/src/pages/AgentOperations.tsx

import { useQuery } from '@tanstack/react-query';

export default function AgentOperations() {
  // Replace mock data with real API call
  const { data: agentMetrics, isLoading } = useQuery({
    queryKey: ['agent-metrics', '24h'],
    queryFn: async () => {
      const response = await fetch('/api/intelligence/agents/metrics?timeWindow=24h');
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: recentActions } = useQuery({
    queryKey: ['agent-actions', 'all', '1h'],
    queryFn: async () => {
      const response = await fetch('/api/intelligence/agents/actions?timeWindow=1h&limit=100');
      return response.json();
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  if (isLoading) return <LoadingSpinner />;

  // Use agentMetrics data instead of mock data
  return (
    <div className="space-y-6">
      <MetricCard
        label="Active Agents"
        value={agentMetrics.filter(a => a.total_requests > 0).length}
        icon={Activity}
        status="healthy"
      />
      {/* ... rest of dashboard */}
    </div>
  );
}
```

---

## Real-Time Data Patterns

### Option 1: WebSocket Implementation

**Server Setup** (`server/websocket.ts`):

```typescript
import { Server } from 'ws';
import { Kafka } from 'kafkajs';
import { createServer } from 'http';

const kafka = new Kafka({
  brokers: ['192.168.86.200:29092'],
  clientId: 'omnidash-websocket',
});

const consumer = kafka.consumer({ groupId: 'omnidash-websocket-group' });

export function setupWebSocket(httpServer: createServer) {
  const wss = new Server({ server: httpServer, path: '/ws' });

  // Connect to Kafka
  consumer.connect();
  consumer.subscribe({
    topics: ['agent-routing-decisions', 'agent-transformation-events', 'agent-actions'],
    fromBeginning: false,
  });

  // Broadcast Kafka events to all connected clients
  consumer.run({
    eachMessage: async ({ topic, message }) => {
      const event = JSON.parse(message.value.toString());

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              topic,
              event,
              timestamp: new Date().toISOString(),
            })
          );
        }
      });
    },
  });

  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');

    ws.on('message', (message) => {
      // Handle client subscriptions
      const { action, topics } = JSON.parse(message.toString());

      if (action === 'subscribe') {
        // Track client subscriptions
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });

  return wss;
}
```

**Client Setup** (`client/src/lib/websocket.ts`):

```typescript
import { useEffect, useState } from 'react';

interface WebSocketMessage {
  topic: string;
  event: any;
  timestamp: string;
}

export function useWebSocket(url: string = 'ws://localhost:3000/ws') {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);

      // Subscribe to topics
      ws.send(
        JSON.stringify({
          action: 'subscribe',
          topics: ['agent-routing-decisions', 'agent-actions'],
        })
      );
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages((prev) => [...prev.slice(-100), message]); // Keep last 100 messages
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [url]);

  return { messages, connected };
}
```

**Dashboard Integration**:

```typescript
// In client/src/pages/AgentOperations.tsx

import { useWebSocket } from '@/lib/websocket';

export default function AgentOperations() {
  const { messages, connected } = useWebSocket();
  const [liveMetrics, setLiveMetrics] = useState({});

  useEffect(() => {
    // Process WebSocket messages
    messages.forEach(msg => {
      if (msg.topic === 'agent-actions') {
        // Update live metrics
        setLiveMetrics(prev => ({
          ...prev,
          lastAction: msg.event,
          actionCount: (prev.actionCount || 0) + 1
        }));
      }
    });
  }, [messages]);

  return (
    <div>
      <StatusBadge status={connected ? 'connected' : 'disconnected'} />
      {/* Use liveMetrics for real-time updates */}
    </div>
  );
}
```

### Option 2: Server-Sent Events (SSE)

**Server Setup** (`server/routes.ts`):

```typescript
import { Kafka } from 'kafkajs';

intelligenceRouter.get('/events/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const kafka = new Kafka({
    brokers: ['192.168.86.200:29092'],
    clientId: `omnidash-sse-${Date.now()}`,
  });

  const consumer = kafka.consumer({
    groupId: `omnidash-sse-group-${Date.now()}`,
  });

  await consumer.connect();
  await consumer.subscribe({
    topics: ['agent-actions'],
    fromBeginning: false,
  });

  consumer.run({
    eachMessage: async ({ topic, message }) => {
      const event = JSON.parse(message.value.toString());
      res.write(`data: ${JSON.stringify({ topic, event })}\n\n`);
    },
  });

  req.on('close', async () => {
    await consumer.disconnect();
  });
});
```

**Client Setup**:

```typescript
// In client/src/lib/sse.ts

import { useEffect, useState } from 'react';

export function useSSE(url: string = '/api/intelligence/events/stream') {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEvents((prev) => [...prev.slice(-100), data]);
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [url]);

  return events;
}
```

---

## Code Examples

### Complete Example: Agent Operations Dashboard Integration

#### Step 1: Add Database Schema to Drizzle

Create `shared/intelligence-schema.ts`:

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

export const agentRoutingDecisions = pgTable('agent_routing_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  correlationId: uuid('correlation_id').notNull(),
  userRequest: text('user_request').notNull(),
  selectedAgent: text('selected_agent').notNull(),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),
  routingStrategy: text('routing_strategy').notNull(),
  routingTimeMs: integer('routing_time_ms').notNull(),
  alternatives: jsonb('alternatives'),
  reasoning: text('reasoning'),
  actualSuccess: boolean('actual_success'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentActions = pgTable('agent_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  correlationId: uuid('correlation_id').notNull(),
  agentName: text('agent_name').notNull(),
  actionType: text('action_type').notNull(),
  actionName: text('action_name').notNull(),
  actionDetails: jsonb('action_details'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

#### Step 2: Create API Endpoints

Update `server/routes.ts`:

```typescript
import { db } from './storage';
import { agentRoutingDecisions, agentActions } from '../shared/intelligence-schema';
import { desc, gte, sql } from 'drizzle-orm';

export async function registerRoutes(app: Express): Promise<Server> {
  // Agent metrics endpoint
  app.get('/api/intelligence/agents/summary', async (req, res) => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const metrics = await db
      .select({
        agent: agentRoutingDecisions.selectedAgent,
        totalRequests: sql<number>`COUNT(*)`,
        successRate: sql<number>`
          COUNT(*) FILTER (WHERE ${agentRoutingDecisions.actualSuccess} = TRUE)::numeric /
          COUNT(*)::numeric
        `,
        avgRoutingTime: sql<number>`AVG(${agentRoutingDecisions.routingTimeMs})`,
      })
      .from(agentRoutingDecisions)
      .where(gte(agentRoutingDecisions.createdAt, last24h))
      .groupBy(agentRoutingDecisions.selectedAgent)
      .orderBy(desc(sql`COUNT(*)`));

    res.json(metrics);
  });

  // Recent actions endpoint
  app.get('/api/intelligence/actions/recent', async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;

    const actions = await db
      .select()
      .from(agentActions)
      .orderBy(desc(agentActions.createdAt))
      .limit(limit);

    res.json(actions);
  });

  const httpServer = createServer(app);
  return httpServer;
}
```

#### Step 3: Update Dashboard Component

Update `client/src/pages/AgentOperations.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { MetricCard } from "@/components/MetricCard";
import { Activity, CheckCircle, Clock } from "lucide-react";

interface AgentMetrics {
  agent: string;
  totalRequests: number;
  successRate: number;
  avgRoutingTime: number;
}

interface AgentAction {
  id: string;
  agentName: string;
  actionType: string;
  actionName: string;
  durationMs: number;
  createdAt: string;
}

export default function AgentOperations() {
  // Fetch agent metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery<AgentMetrics[]>({
    queryKey: ['agent-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/intelligence/agents/summary');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch recent actions
  const { data: actions, isLoading: actionsLoading } = useQuery<AgentAction[]>({
    queryKey: ['agent-actions'],
    queryFn: async () => {
      const res = await fetch('/api/intelligence/actions/recent?limit=100');
      return res.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (metricsLoading || actionsLoading) {
    return <div>Loading...</div>;
  }

  // Calculate aggregated metrics
  const totalRequests = metrics?.reduce((sum, m) => sum + m.totalRequests, 0) || 0;
  const activeAgents = metrics?.length || 0;
  const avgSuccessRate = metrics?.reduce((sum, m) => sum + m.successRate, 0) / (metrics?.length || 1);
  const avgResponseTime = metrics?.reduce((sum, m) => sum + m.avgRoutingTime, 0) / (metrics?.length || 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">AI Agent Operations</h1>
        <p className="text-muted-foreground">
          Real-time monitoring of {activeAgents} AI agents
        </p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <MetricCard
          label="Active Agents"
          value={activeAgents}
          icon={Activity}
          status="healthy"
        />
        <MetricCard
          label="Total Requests (24h)"
          value={totalRequests}
          icon={Activity}
          status="healthy"
        />
        <MetricCard
          label="Avg Response Time"
          value={`${Math.round(avgResponseTime)}ms`}
          icon={Clock}
          status={avgResponseTime < 100 ? "healthy" : "warning"}
        />
        <MetricCard
          label="Success Rate"
          value={`${Math.round(avgSuccessRate * 100)}%`}
          icon={CheckCircle}
          status="healthy"
        />
      </div>

      {/* Agent grid with real data */}
      <div className="grid grid-cols-6 gap-4">
        {metrics?.map((metric) => (
          <div
            key={metric.agent}
            className="p-4 rounded-lg border border-card-border"
          >
            <div className="font-mono text-xs mb-1">{metric.agent}</div>
            <div className="text-2xl font-bold">{metric.totalRequests}</div>
            <div className="text-xs text-muted-foreground">
              {Math.round(metric.successRate * 100)}% success
            </div>
          </div>
        ))}
      </div>

      {/* Recent actions feed */}
      <div className="border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Actions</h3>
        <div className="space-y-2">
          {actions?.slice(0, 20).map((action) => (
            <div key={action.id} className="flex items-center gap-4 text-sm">
              <span className="font-mono text-xs">{action.agentName}</span>
              <span className="text-muted-foreground">{action.actionName}</span>
              <span className="ml-auto">{action.durationMs}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

#### Step 4: Add WebSocket for Real-Time Updates

Create `server/websocket.ts`:

```typescript
import { Server as WebSocketServer } from 'ws';
import { Kafka } from 'kafkajs';
import { Server as HTTPServer } from 'http';

export function setupWebSocket(httpServer: HTTPServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const kafka = new Kafka({
    brokers: ['192.168.86.200:29092'],
    clientId: 'omnidash-websocket',
  });

  const consumer = kafka.consumer({ groupId: 'omnidash-websocket-group' });

  consumer.connect().then(() => {
    consumer.subscribe({ topics: ['agent-actions'], fromBeginning: false });

    consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value?.toString() || '{}');

        // Broadcast to all connected clients
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            // OPEN
            client.send(JSON.stringify({ topic, event }));
          }
        });
      },
    });
  });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  return wss;
}
```

Update `server/index.ts`:

```typescript
import { setupWebSocket } from './websocket';

(async () => {
  const server = await registerRoutes(app);

  // Setup WebSocket
  setupWebSocket(server);

  if (app.get('env') === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen({ port, host: '0.0.0.0' }, () => {
    log(`serving on port ${port}`);
  });
})();
```

Add WebSocket hook to dashboard:

```typescript
// client/src/lib/useWebSocket.ts
import { useEffect, useState } from 'react';

export function useWebSocket(url: string = 'ws://localhost:3000/ws') {
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      setLastMessage(JSON.parse(event.data));
    };

    return () => ws.close();
  }, [url]);

  return lastMessage;
}

// Use in dashboard
const liveUpdate = useWebSocket();
useEffect(() => {
  if (liveUpdate?.topic === 'agent-actions') {
    // Trigger refetch or update local state
    queryClient.invalidateQueries(['agent-actions']);
  }
}, [liveUpdate]);
```

---

## Next Steps

### Phase 1: Database Integration (Week 1)

1. **Add Intelligence Schema**
   - Create `shared/intelligence-schema.ts` with Drizzle table definitions
   - Update `drizzle.config.ts` to point to intelligence database
   - Run schema introspection: `npx drizzle-kit introspect:pg`

2. **Create API Endpoints**
   - Add routes to `server/routes.ts` for each dashboard
   - Implement aggregation queries
   - Add caching layer (optional: Redis)

3. **Update Dashboard Components**
   - Replace mock data with `useQuery` hooks
   - Update TypeScript interfaces to match API responses
   - Add loading and error states

4. **Test with Historical Data**
   - Query last 24 hours of data
   - Verify chart rendering
   - Optimize slow queries

### Phase 2: Real-Time Events (Week 2)

1. **Setup Kafka Consumer**
   - Install kafkajs: `npm install kafkajs`
   - Create WebSocket server in `server/websocket.ts`
   - Subscribe to relevant topics

2. **Add WebSocket Client**
   - Create `useWebSocket` hook
   - Connect to WebSocket on dashboard mount
   - Handle reconnection logic

3. **Implement Live Updates**
   - Update dashboard state on WebSocket messages
   - Add smooth animations for metric changes
   - Show "live" indicator when connected

4. **Performance Optimization**
   - Throttle updates to max 1/second
   - Batch WebSocket messages
   - Add message filtering

### Phase 3: Advanced Features (Week 3+)

1. **Vector Search Integration**
   - Connect to Qdrant via MCP service
   - Add pattern similarity search
   - Visualize pattern relationships

2. **Caching Layer**
   - Add Redis for API response caching
   - Cache expensive aggregations
   - Implement cache invalidation

3. **Data Aggregation Jobs**
   - Create materialized views for common queries
   - Add background jobs for data rollup
   - Optimize for dashboard performance

4. **Advanced Visualizations**
   - Add D3.js for complex visualizations
   - Create interactive timeline views
   - Build correlation heatmaps

---

## Troubleshooting

### Common Issues

**Issue**: Can't connect to PostgreSQL
**Solution**: Check network access to 192.168.86.200:5436, verify credentials, ensure firewall allows connection

**Issue**: Kafka consumer lag
**Solution**: Increase consumer parallelism, add more partitions to topics, optimize message processing

**Issue**: Slow dashboard loading
**Solution**: Add indexes to frequently queried columns, implement caching, use materialized views

**Issue**: WebSocket disconnections
**Solution**: Add heartbeat/ping-pong, implement reconnection logic, increase server timeout

### Performance Optimization

**Database**:

- Add indexes on `created_at`, `correlation_id`, `agent_name` columns
- Use EXPLAIN ANALYZE to identify slow queries
- Create materialized views for dashboard aggregations
- Implement connection pooling

**Kafka**:

- Increase batch size for better throughput
- Use compression (gzip/snappy)
- Adjust consumer fetch settings
- Monitor consumer lag metrics

**API**:

- Implement Redis caching for expensive queries
- Use HTTP caching headers
- Add API rate limiting
- Enable gzip compression

---

## Support & Resources

**Documentation**:

- PostgreSQL: https://www.postgresql.org/docs/
- Kafka: https://kafka.apache.org/documentation/
- Drizzle ORM: https://orm.drizzle.team/
- TanStack Query: https://tanstack.com/query/latest

**Monitoring**:

- Database: pgAdmin, DataGrip
- Kafka: Kafka UI, Conduktor
- Application: Grafana, Datadog

**Contact**:

- Intelligence Infrastructure: See correlation ID 0f9ffdbb-acb4-46aa-ae74-5d5527a22b79
- Dashboard Issues: Create issue in omnidash repo

---

_This integration guide was generated by agent-polymorphic-agent on 2025-10-27. For updates or questions, reference correlation ID: 0f9ffdbb-acb4-46aa-ae74-5d5527a22b79_
