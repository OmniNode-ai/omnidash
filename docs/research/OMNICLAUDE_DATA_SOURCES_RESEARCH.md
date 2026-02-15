# OmniClaude Data Sources Research Report

**Date**: 2025-11-03
**Purpose**: Identify available data sources in omniclaude for omnidash integration
**Repository**: `/Volumes/PRO-G40/Code/omniclaude`

---

## Executive Summary

**Key Findings**:

- ✅ **34+ database tables** in PostgreSQL tracking comprehensive agent execution data
- ✅ **8 Kafka topics** publishing real-time agent events
- ✅ **1 FastAPI dashboard** with SSE updates (port not documented, needs verification)
- ✅ **Event-driven architecture** with correlation ID tracking across all systems
- ✅ **Production-ready infrastructure** with 1,408+ routing decisions logged

**Integration Readiness**: **95% Ready** - All core data sources are available and documented. Minor gaps in API documentation.

---

## 1. Architecture Overview

### Purpose of OmniClaude

OmniClaude is a **comprehensive toolkit for enhancing Claude Code** with:

- **Multi-provider AI support** (7 providers: Anthropic, Z.ai, Together AI, OpenRouter, Gemini variants)
- **Polymorphic agent framework** (52 specialized agents)
- **Intelligence infrastructure** (pattern discovery, manifest injection, debug intelligence)
- **Event-driven architecture** (Kafka-based real-time intelligence)
- **Complete observability** (correlation ID tracking, manifest traceability)

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  OMNICLAUDE ECOSYSTEM                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Agent Execution Layer                             │    │
│  │  - 52 specialized agents                           │    │
│  │  - Polymorphic agent framework                     │    │
│  │  - Dynamic manifest injection                      │    │
│  └────────────────────────────────────────────────────┘    │
│                        │                                     │
│                        ↓ (publishes events)                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Event Bus (Kafka/Redpanda)                        │    │
│  │  - 8 agent tracking topics                         │    │
│  │  - Real-time event streaming                       │    │
│  │  - 7-day retention                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                        │                                     │
│                        ↓ (consumed by)                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Consumers                                         │    │
│  │  - agent_actions_consumer (writes to DB)          │    │
│  │  - agent_router_event_service (routing)           │    │
│  └────────────────────────────────────────────────────┘    │
│                        │                                     │
│                        ↓ (writes to)                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │  PostgreSQL Database                               │    │
│  │  - Host: 192.168.86.200:5436                      │    │
│  │  - Database: omninode_bridge                       │    │
│  │  - 34+ tables with complete traceability          │    │
│  └────────────────────────────────────────────────────┘    │
│                        │                                     │
│                        ↓ (queried by)                       │
│  ┌────────────────────────────────────────────────────┐    │
│  │  FastAPI Dashboard (OPTIONAL)                      │    │
│  │  - SSE real-time updates                           │    │
│  │  - Health metrics                                  │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                         │
                         ↓ (can be integrated with)
┌─────────────────────────────────────────────────────────────┐
│                      OMNIDASH                                │
│  - Can query PostgreSQL directly                            │
│  - Can consume Kafka events in real-time                    │
│  - Complete observability dashboards                        │
└─────────────────────────────────────────────────────────────┘
```

### Key Infrastructure Components

| Component             | Location              | Purpose                           | Status        |
| --------------------- | --------------------- | --------------------------------- | ------------- |
| **PostgreSQL**        | `192.168.86.200:5436` | Primary data storage (34+ tables) | ✅ Production |
| **Kafka/Redpanda**    | `192.168.86.200:29092` | Event streaming (8 topics)        | ✅ Production |
| **Qdrant**            | `localhost:6333`      | Vector database (120+ patterns)   | ✅ Production |
| **Memgraph**          | `localhost:7687`      | Graph database (relationships)    | ✅ Production |
| **FastAPI Dashboard** | Port unknown          | Web dashboard with SSE            | ⚠️ Optional   |

---

## 2. Data Availability Matrix

### ✅ Agent Routing Decisions

**Location**: PostgreSQL table `agent_routing_decisions`
**Volume**: 1,408+ records logged (production-ready)
**Update Frequency**: Real-time (on every agent selection)

**Schema**:

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
    confidence_score NUMERIC(5,4) NOT NULL,  -- 0.0-1.0
    routing_strategy VARCHAR(100) NOT NULL,

    -- 4-component confidence breakdown
    trigger_confidence NUMERIC(5,4),
    context_confidence NUMERIC(5,4),
    capability_confidence NUMERIC(5,4),
    historical_confidence NUMERIC(5,4),

    -- Alternatives
    alternatives JSONB,  -- [{agent, confidence, reason}]
    alternatives_count INTEGER DEFAULT 0,

    -- Reasoning
    reasoning TEXT,
    matched_triggers TEXT[],
    matched_capabilities TEXT[],

    -- Performance
    routing_time_ms INTEGER NOT NULL,  -- Target: <100ms
    cache_hit BOOLEAN DEFAULT FALSE,

    -- Validation (filled after execution)
    selection_validated BOOLEAN DEFAULT FALSE,
    actual_success BOOLEAN,
    actual_quality_score NUMERIC(5,4),
    prediction_error NUMERIC(5,4),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validated_at TIMESTAMP WITH TIME ZONE
);
```

**Kafka Topic**: `agent-routing-decisions`
**Event Type**: Published on every routing decision

---

### ✅ Agent Actions (Tool Calls)

**Location**: PostgreSQL table `agent_actions`
**Volume**: ~50K/day (high frequency)
**Update Frequency**: Real-time (on every tool call)

**Schema**:

```sql
CREATE TABLE agent_actions (
    id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    agent_name TEXT NOT NULL,

    -- Action classification
    action_type TEXT NOT NULL,  -- 'tool_call', 'decision', 'error', 'success'
    action_name TEXT NOT NULL,   -- 'Read', 'Write', 'Bash', etc.

    -- Details
    action_details JSONB DEFAULT '{}',

    -- Performance
    debug_mode BOOLEAN NOT NULL DEFAULT true,
    duration_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Kafka Topic**: `agent-actions`
**Event Type**: Published on every agent action (Read, Write, Bash, etc.)

---

### ✅ Manifest Injections (Intelligence Context)

**Location**: PostgreSQL table `agent_manifest_injections`
**Volume**: ~1K/day
**Update Frequency**: On every agent execution

**Schema**:

```sql
CREATE TABLE agent_manifest_injections (
    id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    session_id UUID,
    routing_decision_id UUID REFERENCES agent_routing_decisions(id),

    -- Agent context
    agent_name VARCHAR(255) NOT NULL,
    agent_version VARCHAR(50) DEFAULT '1.0.0',

    -- Manifest metadata
    manifest_version VARCHAR(50) NOT NULL,
    generation_source VARCHAR(100) NOT NULL,  -- 'archon-intelligence-adapter' or 'fallback'
    is_fallback BOOLEAN DEFAULT FALSE,

    -- Sections included
    sections_included TEXT[],  -- ['patterns', 'infrastructure', 'models', 'schemas', 'debug_intelligence']
    sections_requested TEXT[],

    -- Content summary
    patterns_count INTEGER DEFAULT 0,
    infrastructure_services INTEGER DEFAULT 0,
    models_count INTEGER DEFAULT 0,
    database_schemas_count INTEGER DEFAULT 0,
    debug_intelligence_successes INTEGER DEFAULT 0,
    debug_intelligence_failures INTEGER DEFAULT 0,

    -- Collections queried
    collections_queried JSONB,  -- {"execution_patterns": 50, "code_patterns": 100}

    -- Performance
    query_times JSONB NOT NULL,  -- {"patterns": 450, "infrastructure": 200, ...} in ms
    total_query_time_ms INTEGER NOT NULL,  -- Target: <2000ms
    cache_hit BOOLEAN DEFAULT FALSE,

    -- Complete manifest snapshot
    full_manifest_snapshot JSONB NOT NULL,
    formatted_manifest_text TEXT,
    manifest_size_bytes INTEGER,

    -- Quality
    intelligence_available BOOLEAN DEFAULT TRUE,
    query_failures JSONB,
    warnings TEXT[],

    -- Outcome (filled after execution)
    agent_execution_success BOOLEAN,
    agent_execution_time_ms INTEGER,
    agent_quality_score NUMERIC(5,4),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

---

### ✅ Agent Prompts (User Requests)

**Location**: PostgreSQL table `agent_prompts`
**Volume**: ~1K/day
**Update Frequency**: On every user request

**Schema**:

```sql
CREATE TABLE agent_prompts (
    id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    session_id UUID,
    execution_id UUID,

    -- Agent context
    agent_name VARCHAR(255) NOT NULL,
    agent_version VARCHAR(50) DEFAULT '1.0.0',

    -- Prompt capture
    user_prompt TEXT NOT NULL,
    user_prompt_hash VARCHAR(64) NOT NULL,  -- SHA-256
    user_prompt_length INTEGER NOT NULL,

    -- Agent instructions (from manifest)
    agent_instructions TEXT,
    agent_instructions_hash VARCHAR(64),
    agent_instructions_length INTEGER,

    -- Manifest linkage
    manifest_injection_id UUID REFERENCES agent_manifest_injections(id),
    manifest_sections_included TEXT[],

    -- Context
    system_context JSONB,  -- cwd, git status, environment
    conversation_history JSONB,
    attached_files TEXT[],

    -- Claude Code context
    claude_session_id VARCHAR(255),
    terminal_id VARCHAR(255),
    project_path TEXT,
    project_name VARCHAR(255),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### ✅ File Operations

**Location**: PostgreSQL table `agent_file_operations`
**Volume**: High (every file read/write)
**Update Frequency**: Real-time

**Schema**:

```sql
CREATE TABLE agent_file_operations (
    id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    execution_id UUID,
    prompt_id UUID REFERENCES agent_prompts(id),

    agent_name VARCHAR(255) NOT NULL,

    -- Operation details
    operation_type VARCHAR(50) NOT NULL,  -- 'read', 'write', 'edit', 'delete', 'create', 'glob', 'grep'
    file_path TEXT NOT NULL,
    file_path_hash VARCHAR(64) NOT NULL,

    -- File identification
    file_name VARCHAR(255),
    file_extension VARCHAR(50),
    file_size_bytes BIGINT,

    -- Content hashing (integrity)
    content_hash_before VARCHAR(64),
    content_hash_after VARCHAR(64),
    content_changed BOOLEAN DEFAULT FALSE,

    -- Intelligence DB linkage
    intelligence_file_id UUID,
    intelligence_pattern_match BOOLEAN DEFAULT FALSE,
    matched_pattern_ids UUID[],

    -- Operation context
    tool_name VARCHAR(100),  -- 'Read', 'Write', 'Edit', 'Bash', etc.
    line_range JSONB,  -- {"start": 1, "end": 100}
    operation_params JSONB,

    -- Results
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    bytes_read BIGINT,
    bytes_written BIGINT,

    -- Performance
    duration_ms INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### ✅ Intelligence Usage (Pattern Application)

**Location**: PostgreSQL table `agent_intelligence_usage`
**Volume**: Medium (tracked when patterns are applied)
**Update Frequency**: On pattern application

**Schema**:

```sql
CREATE TABLE agent_intelligence_usage (
    id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    execution_id UUID,
    manifest_injection_id UUID REFERENCES agent_manifest_injections(id),
    prompt_id UUID REFERENCES agent_prompts(id),

    agent_name VARCHAR(255) NOT NULL,

    -- Intelligence source
    intelligence_type VARCHAR(100) NOT NULL,  -- 'pattern', 'schema', 'debug_intelligence', 'model', 'infrastructure'
    intelligence_source VARCHAR(100) NOT NULL,  -- 'qdrant', 'memgraph', 'postgres', 'archon-intelligence'

    -- Identification
    intelligence_id UUID,
    intelligence_name TEXT,
    collection_name VARCHAR(255),  -- 'execution_patterns', 'code_patterns', etc.

    -- Usage details
    usage_context VARCHAR(100),  -- 'reference', 'implementation', 'inspiration', 'validation'
    usage_count INTEGER DEFAULT 1,
    confidence_score NUMERIC(5,4),

    -- Snapshot
    intelligence_snapshot JSONB,
    intelligence_summary TEXT,

    -- Query details
    query_used TEXT,
    query_time_ms INTEGER,
    query_results_rank INTEGER,

    -- Application tracking
    was_applied BOOLEAN DEFAULT FALSE,
    application_details JSONB,
    file_operations_using_this UUID[],

    -- Effectiveness
    contributed_to_success BOOLEAN,
    quality_impact NUMERIC(5,4),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_at TIMESTAMP WITH TIME ZONE
);
```

---

### ✅ Execution Traces (Complete Workflows)

**Location**: PostgreSQL view `v_agent_execution_trace`
**Type**: Aggregated view joining routing + manifest + execution
**Purpose**: Complete trace from user request to result

**View Definition**:

```sql
CREATE OR REPLACE VIEW v_agent_execution_trace AS
SELECT
    ard.correlation_id,
    ard.user_request,
    ard.selected_agent,
    ard.confidence_score,
    ard.routing_strategy,
    ard.reasoning AS routing_reasoning,
    ard.routing_time_ms,
    ami.manifest_version,
    ami.generation_source,
    ami.is_fallback,
    ami.patterns_count,
    ami.debug_intelligence_successes,
    ami.debug_intelligence_failures,
    ami.total_query_time_ms,
    ami.agent_execution_success,
    ami.agent_quality_score,
    ate.transformation_duration_ms,
    ate.total_execution_duration_ms,
    ard.created_at AS routing_time,
    ami.created_at AS manifest_time,
    ate.started_at AS execution_start_time,
    ate.completed_at AS execution_end_time
FROM agent_routing_decisions ard
LEFT JOIN agent_manifest_injections ami
    ON ard.correlation_id = ami.correlation_id
LEFT JOIN agent_transformation_events ate
    ON ard.correlation_id = ate.correlation_id
    AND ard.selected_agent = ate.target_agent
ORDER BY ard.created_at DESC;
```

---

### ✅ Performance Metrics

**Location**: PostgreSQL table `router_performance_metrics`
**Kafka Topic**: `router-performance-metrics`
**Update Frequency**: Real-time

**Metrics Tracked**:

- Routing time (target: <100ms, achieved: 7-13ms)
- Confidence scores
- Success rates
- Cache hit rates
- Query performance

---

### ⚠️ Event Flow Data

**Location**: Kafka topics only (not persisted to database)
**Availability**: Available via Kafka consumer
**Retention**: 7 days

**Note**: Event flow visualization would require consuming Kafka topics directly or setting up a separate consumer to persist this data.

---

## 3. Kafka Topics Reference

### Available Topics

| Topic                         | Purpose                       | Event Frequency | Retention |
| ----------------------------- | ----------------------------- | --------------- | --------- |
| `agent-actions`               | Tool calls, decisions, errors | ~50K/day        | 7 days    |
| `agent-routing-decisions`     | Agent selection events        | ~1K/day         | 7 days    |
| `agent-transformation-events` | Agent transformations         | Low             | 7 days    |
| `router-performance-metrics`  | Routing performance           | ~1K/day         | 7 days    |
| `agent.routing.requested.v1`  | Routing requests              | ~1K/day         | 7 days    |
| `agent.routing.completed.v1`  | Routing successes             | ~1K/day         | 7 days    |
| `agent.routing.failed.v1`     | Routing failures              | Low             | 7 days    |
| `agent-detection-failures`    | Detection failures            | Low             | 7 days    |

### Event Schemas

**Agent Action Event** (`agent-actions`):

```json
{
  "correlation_id": "uuid",
  "agent_name": "agent-test",
  "action_type": "tool_call",
  "action_name": "Read",
  "action_details": {
    "file_path": "/path/to/file.py",
    "line_count": 100
  },
  "duration_ms": 45,
  "timestamp": "2025-11-03T10:30:00Z"
}
```

**Routing Decision Event** (`agent-routing-decisions`):

```json
{
  "correlation_id": "uuid",
  "user_request": "Help me debug this code",
  "selected_agent": "agent-debug-intelligence",
  "confidence_score": 0.92,
  "routing_strategy": "enhanced_fuzzy_matching",
  "routing_time_ms": 8,
  "alternatives": [{ "agent": "agent-code-quality", "confidence": 0.78 }],
  "matched_triggers": ["debug", "code"],
  "timestamp": "2025-11-03T10:30:00Z"
}
```

**Agent Routing Request Event** (`agent.routing.requested.v1`):

```json
{
  "correlation_id": "uuid",
  "event_type": "AGENT_ROUTING_REQUESTED",
  "timestamp": "2025-11-03T10:30:00Z",
  "payload": {
    "user_request": "Help me debug this code",
    "max_recommendations": 3,
    "include_reasoning": true
  }
}
```

---

## 4. Integration Guide for Omnidash

### Approach 1: Direct PostgreSQL Queries (Recommended for Phase 1)

**Advantages**:

- Simple, no additional infrastructure
- Cacheable with TanStack Query
- Familiar SQL patterns
- Low latency for historical data

**Implementation**:

1. **Add PostgreSQL connection in omnidash**

Update `.env`:

```bash
# Intelligence Database (same as omnidash already has)
DATABASE_URL="postgresql://postgres:<password>@192.168.86.200:5436/omninode_bridge"
```

2. **Create Drizzle schema for intelligence tables**

`shared/intelligence-schema.ts`:

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export const agentRoutingDecisions = pgTable('agent_routing_decisions', {
  id: uuid('id').primaryKey(),
  correlationId: uuid('correlation_id').notNull(),
  userRequest: text('user_request').notNull(),
  selectedAgent: text('selected_agent').notNull(),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),
  routingStrategy: text('routing_strategy').notNull(),
  routingTimeMs: integer('routing_time_ms').notNull(),
  actualSuccess: boolean('actual_success'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentActions = pgTable('agent_actions', {
  id: uuid('id').primaryKey(),
  correlationId: uuid('correlation_id').notNull(),
  agentName: text('agent_name').notNull(),
  actionType: text('action_type').notNull(),
  actionName: text('action_name').notNull(),
  actionDetails: jsonb('action_details'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Add other tables as needed...
```

3. **Create API endpoints in omnidash server**

`server/intelligence-routes.ts`:

```typescript
import { db } from './db';
import { agentRoutingDecisions, agentActions } from '../shared/intelligence-schema';
import { desc, gte, sql } from 'drizzle-orm';

// Agent Operations Dashboard - Agent summary
app.get('/api/intelligence/agents/summary', async (req, res) => {
  const summary = await db
    .select({
      agentName: agentActions.agentName,
      totalActions: sql<number>`count(*)`,
      avgDuration: sql<number>`avg(${agentActions.durationMs})`,
      successRate: sql<number>`
        count(*) filter (where ${agentActions.actionType} = 'success')::float /
        nullif(count(*), 0) * 100
      `,
    })
    .from(agentActions)
    .where(gte(agentActions.createdAt, sql`now() - interval '24 hours'`))
    .groupBy(agentActions.agentName)
    .orderBy(desc(sql`count(*)`));

  res.json(summary);
});

// Agent Operations Dashboard - Recent routing decisions
app.get('/api/intelligence/routing/recent', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;

  const decisions = await db
    .select()
    .from(agentRoutingDecisions)
    .orderBy(desc(agentRoutingDecisions.createdAt))
    .limit(limit);

  res.json(decisions);
});

// Agent Operations Dashboard - Routing metrics
app.get('/api/intelligence/routing/metrics', async (req, res) => {
  const metrics = await db
    .select({
      totalDecisions: sql<number>`count(*)`,
      avgConfidence: sql<number>`avg(${agentRoutingDecisions.confidenceScore})`,
      avgRoutingTime: sql<number>`avg(${agentRoutingDecisions.routingTimeMs})`,
      successRate: sql<number>`
        count(*) filter (where ${agentRoutingDecisions.actualSuccess} = true)::float /
        nullif(count(*) filter (where ${agentRoutingDecisions.actualSuccess} is not null), 0) * 100
      `,
    })
    .from(agentRoutingDecisions)
    .where(gte(agentRoutingDecisions.createdAt, sql`now() - interval '24 hours'`));

  res.json(metrics[0]);
});
```

4. **Replace mock data in dashboard components**

`client/src/pages/AgentOperations.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query';

function AgentOperations() {
  // Replace mock data with real API calls
  const { data: agentSummary } = useQuery({
    queryKey: ['intelligence', 'agents', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/intelligence/agents/summary');
      return res.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: routingMetrics } = useQuery({
    queryKey: ['intelligence', 'routing', 'metrics'],
    queryFn: async () => {
      const res = await fetch('/api/intelligence/routing/metrics');
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Use real data instead of mock data
  return (
    <div>
      <MetricCard
        title="Total Decisions (24h)"
        value={routingMetrics?.totalDecisions || 0}
        trend={/* calculate from data */}
      />
      {/* ... */}
    </div>
  );
}
```

---

### Approach 2: Real-Time Kafka Events (Phase 2)

**Advantages**:

- Real-time updates (<100ms latency)
- Event sourcing patterns
- Horizontal scalability

**Implementation**:

1. **Install dependencies**

```bash
npm install kafkajs ws
```

2. **Create Kafka consumer service**

`server/kafka-consumer.ts`:

```typescript
import { Kafka } from 'kafkajs';
import { WebSocketServer } from 'ws';

const kafka = new Kafka({
  clientId: 'omnidash',
  brokers: ['192.168.86.200:29092'],
});

const consumer = kafka.consumer({ groupId: 'omnidash-consumers' });

// WebSocket server for broadcasting to clients
const wss = new WebSocketServer({ port: 3001 });

async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topics: ['agent-actions', 'agent-routing-decisions', 'router-performance-metrics'],
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const event = JSON.parse(message.value.toString());

      // Broadcast to all connected WebSocket clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ topic, event }));
        }
      });
    },
  });
}

startConsumer().catch(console.error);
```

3. **Create WebSocket hook in frontend**

`client/src/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useState } from 'react';

export function useWebSocket<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setData(message);
    };

    return () => ws.close();
  }, [url]);

  return { data, isConnected };
}
```

4. **Use in dashboard components**

```typescript
function AgentOperations() {
  const { data: realtimeEvent } = useWebSocket('ws://localhost:3001');

  useEffect(() => {
    if (realtimeEvent) {
      // Update dashboard with real-time event
      console.log('Real-time event:', realtimeEvent);
    }
  }, [realtimeEvent]);

  // ...
}
```

---

## 5. SQL Query Examples

### Agent Operations Dashboard

**Agent Activity Summary (Last 24h)**:

```sql
SELECT
    aa.agent_name,
    COUNT(*) as total_actions,
    COUNT(DISTINCT aa.correlation_id) as unique_executions,
    AVG(aa.duration_ms) as avg_action_duration,
    COUNT(*) FILTER (WHERE aa.action_type = 'success') as successes,
    COUNT(*) FILTER (WHERE aa.action_type = 'error') as errors,
    (COUNT(*) FILTER (WHERE aa.action_type = 'success')::float /
     NULLIF(COUNT(*), 0) * 100) as success_rate
FROM agent_actions aa
WHERE aa.created_at > NOW() - INTERVAL '24 hours'
GROUP BY aa.agent_name
ORDER BY total_actions DESC
LIMIT 20;
```

**Recent Routing Decisions with Confidence**:

```sql
SELECT
    ard.user_request,
    ard.selected_agent,
    ard.confidence_score,
    ard.routing_time_ms,
    ard.routing_strategy,
    ard.alternatives,
    ard.created_at
FROM agent_routing_decisions ard
ORDER BY ard.created_at DESC
LIMIT 50;
```

**Routing Performance Metrics**:

```sql
SELECT
    COUNT(*) as total_decisions,
    AVG(confidence_score) as avg_confidence,
    AVG(routing_time_ms) as avg_routing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY routing_time_ms) as p95_routing_time,
    COUNT(*) FILTER (WHERE actual_success = true) as successes,
    COUNT(*) FILTER (WHERE actual_success = false) as failures,
    (COUNT(*) FILTER (WHERE actual_success = true)::float /
     NULLIF(COUNT(*) FILTER (WHERE actual_success IS NOT NULL), 0) * 100) as accuracy_percent
FROM agent_routing_decisions
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Pattern Learning Dashboard

**Top Applied Patterns**:

```sql
SELECT
    aiu.intelligence_name,
    aiu.collection_name,
    COUNT(*) as times_retrieved,
    SUM(CASE WHEN aiu.was_applied THEN 1 ELSE 0 END) as times_applied,
    AVG(aiu.confidence_score) as avg_confidence,
    AVG(aiu.quality_impact) FILTER (WHERE aiu.was_applied) as avg_quality_impact,
    (SUM(CASE WHEN aiu.was_applied THEN 1 ELSE 0 END)::float /
     NULLIF(COUNT(*), 0) * 100) as application_rate
FROM agent_intelligence_usage aiu
WHERE aiu.created_at > NOW() - INTERVAL '7 days'
GROUP BY aiu.intelligence_name, aiu.collection_name
HAVING COUNT(*) > 1
ORDER BY times_applied DESC, avg_quality_impact DESC NULLS LAST
LIMIT 25;
```

**Pattern Discovery Trends**:

```sql
SELECT
    DATE_TRUNC('hour', ami.created_at) as hour,
    AVG(ami.patterns_count) as avg_patterns,
    AVG(ami.debug_intelligence_successes) as avg_success_patterns,
    AVG(ami.total_query_time_ms) as avg_query_time,
    COUNT(*) as manifest_count
FROM agent_manifest_injections ami
WHERE ami.created_at > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;
```

### Intelligence Operations Dashboard

**Manifest Injection Performance**:

```sql
SELECT
    ami.agent_name,
    ami.generation_source,
    COUNT(*) as total_injections,
    AVG(ami.total_query_time_ms) as avg_query_time,
    AVG(ami.patterns_count) as avg_patterns,
    COUNT(CASE WHEN ami.is_fallback THEN 1 END) as fallback_count,
    (COUNT(CASE WHEN ami.is_fallback THEN 1 END)::float /
     NULLIF(COUNT(*), 0) * 100) as fallback_percent,
    AVG(ami.agent_quality_score) as avg_quality
FROM agent_manifest_injections ami
WHERE ami.created_at > NOW() - INTERVAL '24 hours'
GROUP BY ami.agent_name, ami.generation_source
ORDER BY total_injections DESC;
```

### Code Intelligence Dashboard

**File Operation Statistics**:

```sql
SELECT
    afo.file_extension,
    COUNT(*) as total_operations,
    COUNT(DISTINCT afo.file_path_hash) as unique_files,
    SUM(CASE WHEN afo.operation_type = 'read' THEN 1 ELSE 0 END) as reads,
    SUM(CASE WHEN afo.operation_type IN ('write', 'edit') THEN 1 ELSE 0 END) as writes,
    SUM(CASE WHEN afo.content_changed THEN 1 ELSE 0 END) as changes,
    AVG(afo.duration_ms) as avg_duration
FROM agent_file_operations afo
WHERE afo.created_at > NOW() - INTERVAL '24 hours'
GROUP BY afo.file_extension
ORDER BY total_operations DESC
LIMIT 20;
```

**Most Modified Files**:

```sql
SELECT
    afo.file_path,
    COUNT(*) as operation_count,
    COUNT(DISTINCT afo.agent_name) as agents_touched,
    MIN(afo.created_at) as first_operation,
    MAX(afo.created_at) as last_operation,
    SUM(CASE WHEN afo.content_changed THEN 1 ELSE 0 END) as change_count
FROM agent_file_operations afo
WHERE afo.created_at > NOW() - INTERVAL '7 days'
GROUP BY afo.file_path
ORDER BY change_count DESC
LIMIT 20;
```

### Event Flow Dashboard

**Execution Traces (Complete Workflows)**:

```sql
SELECT
    vet.correlation_id,
    vet.user_request,
    vet.selected_agent,
    vet.confidence_score,
    vet.routing_time_ms,
    vet.patterns_count,
    vet.total_query_time_ms,
    vet.agent_execution_success,
    vet.routing_time,
    vet.execution_end_time,
    EXTRACT(EPOCH FROM (vet.execution_end_time - vet.routing_time)) * 1000 as total_duration_ms
FROM v_agent_execution_trace vet
ORDER BY vet.routing_time DESC
LIMIT 50;
```

**Correlation Trace (Single Workflow)**:

```sql
-- Get complete trace for a specific correlation_id
SELECT * FROM get_complete_trace('your-correlation-id-here');

-- Alternative: Manual join
SELECT
    'prompt' as trace_type,
    ap.user_prompt,
    ap.user_prompt_length,
    ap.created_at
FROM agent_prompts ap
WHERE ap.correlation_id = 'your-correlation-id-here'

UNION ALL

SELECT
    'routing' as trace_type,
    ard.selected_agent || ' (confidence: ' || ard.confidence_score || ')',
    ard.routing_time_ms,
    ard.created_at
FROM agent_routing_decisions ard
WHERE ard.correlation_id = 'your-correlation-id-here'

UNION ALL

SELECT
    'manifest' as trace_type,
    'Patterns: ' || ami.patterns_count || ', Query time: ' || ami.total_query_time_ms || 'ms',
    NULL,
    ami.created_at
FROM agent_manifest_injections ami
WHERE ami.correlation_id = 'your-correlation-id-here'

UNION ALL

SELECT
    'action' as trace_type,
    aa.action_type || ': ' || aa.action_name,
    aa.duration_ms,
    aa.created_at
FROM agent_actions aa
WHERE aa.correlation_id = 'your-correlation-id-here'

ORDER BY created_at;
```

### Platform Health Dashboard

**System Health Score**:

```sql
SELECT
    -- Routing performance (40% weight)
    (CASE
        WHEN AVG(ard.routing_time_ms) < 100 THEN 40
        WHEN AVG(ard.routing_time_ms) < 500 THEN 30
        ELSE 20
    END) +

    -- Confidence score (30% weight)
    (AVG(ard.confidence_score) * 30) +

    -- Success rate (30% weight)
    (COALESCE(
        COUNT(*) FILTER (WHERE ard.actual_success = true)::float /
        NULLIF(COUNT(*) FILTER (WHERE ard.actual_success IS NOT NULL), 0),
        0
    ) * 30) as health_score
FROM agent_routing_decisions ard
WHERE ard.created_at > NOW() - INTERVAL '1 hour';
```

---

## 6. Code Examples

### TypeScript Types for Intelligence Data

```typescript
// Agent routing decision
export interface AgentRoutingDecision {
  id: string;
  correlationId: string;
  userRequest: string;
  selectedAgent: string;
  confidenceScore: number;
  routingStrategy: 'enhanced_fuzzy_matching' | 'explicit' | 'fallback';
  triggerConfidence?: number;
  contextConfidence?: number;
  capabilityConfidence?: number;
  historicalConfidence?: number;
  alternatives?: Array<{
    agent: string;
    confidence: number;
    reason: string;
  }>;
  reasoning: string;
  matchedTriggers: string[];
  routingTimeMs: number;
  actualSuccess?: boolean;
  createdAt: Date;
}

// Agent action
export interface AgentAction {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: 'tool_call' | 'decision' | 'error' | 'success';
  actionName: string;
  actionDetails: Record<string, any>;
  durationMs?: number;
  createdAt: Date;
}

// Manifest injection
export interface ManifestInjection {
  id: string;
  correlationId: string;
  agentName: string;
  manifestVersion: string;
  generationSource: string;
  isFallback: boolean;
  sectionsIncluded: string[];
  patternsCount: number;
  infrastructureServices: number;
  debugIntelligenceSuccesses: number;
  debugIntelligenceFailures: number;
  queryTimes: Record<string, number>;
  totalQueryTimeMs: number;
  fullManifestSnapshot: Record<string, any>;
  agentExecutionSuccess?: boolean;
  agentQualityScore?: number;
  createdAt: Date;
}

// Execution trace (aggregated view)
export interface ExecutionTrace {
  correlationId: string;
  userRequest: string;
  selectedAgent: string;
  confidenceScore: number;
  routingStrategy: string;
  routingReasoningstring;
  routingTimeMs: number;
  manifestVersion: string;
  patternsCount: number;
  totalQueryTimeMs: number;
  agentExecutionSuccess?: boolean;
  agentQualityScore?: number;
  routingTime: Date;
  executionEndTime?: Date;
}
```

### API Client Example

```typescript
// client/src/lib/intelligence-client.ts
export class IntelligenceClient {
  private baseUrl = '/api/intelligence';

  async getAgentSummary(timeRange: '1h' | '24h' | '7d' = '24h') {
    const res = await fetch(`${this.baseUrl}/agents/summary?range=${timeRange}`);
    return res.json() as Promise<AgentSummary[]>;
  }

  async getRoutingMetrics(timeRange: '1h' | '24h' | '7d' = '24h') {
    const res = await fetch(`${this.baseUrl}/routing/metrics?range=${timeRange}`);
    return res.json() as Promise<RoutingMetrics>;
  }

  async getRecentDecisions(limit = 50) {
    const res = await fetch(`${this.baseUrl}/routing/recent?limit=${limit}`);
    return res.json() as Promise<AgentRoutingDecision[]>;
  }

  async getExecutionTrace(correlationId: string) {
    const res = await fetch(`${this.baseUrl}/trace/${correlationId}`);
    return res.json() as Promise<ExecutionTrace>;
  }

  async getPatternUsage(limit = 25) {
    const res = await fetch(`${this.baseUrl}/patterns/usage?limit=${limit}`);
    return res.json() as Promise<PatternUsage[]>;
  }
}

export const intelligenceClient = new IntelligenceClient();
```

### Dashboard Integration Example

```typescript
// client/src/pages/AgentOperations.tsx
import { useQuery } from '@tanstack/react-query';
import { intelligenceClient } from '@/lib/intelligence-client';

export function AgentOperations() {
  const { data: agentSummary, isLoading } = useQuery({
    queryKey: ['intelligence', 'agents', 'summary', '24h'],
    queryFn: () => intelligenceClient.getAgentSummary('24h'),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: routingMetrics } = useQuery({
    queryKey: ['intelligence', 'routing', 'metrics', '24h'],
    queryFn: () => intelligenceClient.getRoutingMetrics('24h'),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricCard
        title="Total Decisions"
        value={routingMetrics?.totalDecisions ?? 0}
        icon={<ActivityIcon />}
      />
      <MetricCard
        title="Avg Confidence"
        value={`${((routingMetrics?.avgConfidence ?? 0) * 100).toFixed(1)}%`}
        icon={<TargetIcon />}
      />
      <MetricCard
        title="Avg Routing Time"
        value={`${routingMetrics?.avgRoutingTime ?? 0}ms`}
        icon={<ZapIcon />}
      />
      <MetricCard
        title="Success Rate"
        value={`${(routingMetrics?.successRate ?? 0).toFixed(1)}%`}
        icon={<CheckCircleIcon />}
      />

      {/* Agent list */}
      <div className="col-span-4">
        <AgentGrid agents={agentSummary ?? []} />
      </div>
    </div>
  );
}
```

---

## 7. Data Gaps & Recommendations

### ✅ Available (No Gaps)

- ✅ Agent routing decisions - **Complete**
- ✅ Agent actions (tool calls) - **Complete**
- ✅ Manifest injections - **Complete**
- ✅ User prompts - **Complete**
- ✅ File operations - **Complete**
- ✅ Intelligence usage - **Complete**
- ✅ Performance metrics - **Complete**
- ✅ Execution traces - **Complete via views**

### ⚠️ Partial Availability

**Event Flow Visualization**:

- **Status**: Events published to Kafka but not persisted
- **Gap**: No database table for event flow graph
- **Recommendation**:
  - Option 1: Consume Kafka topics directly for real-time visualization
  - Option 2: Create new consumer to persist event flow data
  - Option 3: Use `agent_actions` table as proxy (has correlation_id chain)

**Knowledge Graph Visualization**:

- **Status**: Data in Memgraph (graph database) at `localhost:7687`
- **Gap**: Not exposed via PostgreSQL
- **Recommendation**:
  - Create API endpoint that queries Memgraph directly
  - Or use `agent_intelligence_usage` table for pattern relationships

### ❌ Not Available

**Real-Time Chat Interface**:

- **Status**: No chat history in database
- **Gap**: OmniClaude doesn't track chat conversations
- **Recommendation**:
  - Chat feature in omnidash could be standalone (new feature)
  - Or integrate with `agent_prompts` table (user prompts only)

**Developer Experience Metrics**:

- **Status**: Partial (can derive from routing + execution data)
- **Gap**: No explicit "developer satisfaction" or "workflow efficiency" metrics
- **Recommendation**:
  - Derive from existing data:
    - Routing confidence → Predicted quality
    - Execution success → Actual quality
    - Routing time + execution time → Total latency

**Platform Monitoring (Infrastructure)**:

- **Status**: No infrastructure metrics in database
- **Gap**: Docker, Kafka, PostgreSQL health not tracked
- **Recommendation**:
  - Add health check endpoints in omniclaude
  - Or use external monitoring (Prometheus, Grafana)

---

## 8. Quick Start Integration

### Step 1: Database Connection (10 minutes)

1. **Verify .env has correct credentials**

```bash
# In omnidash/.env
DATABASE_URL="postgresql://postgres:<password>@192.168.86.200:5436/omninode_bridge"
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omninode_bridge
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<from omniclaude/.env>
```

2. **Test connection**

```bash
psql -h 192.168.86.200 -p 5436 -U postgres -d omninode_bridge -c "SELECT COUNT(*) FROM agent_routing_decisions;"
```

### Step 2: Add Intelligence Schema (20 minutes)

1. **Create `shared/intelligence-schema.ts`** (see Integration Guide above)

2. **Test Drizzle connection**

```typescript
// Test script
import { db } from './server/db';
import { agentRoutingDecisions } from './shared/intelligence-schema';

const decisions = await db.select().from(agentRoutingDecisions).limit(10);
console.log(decisions);
```

### Step 3: Create API Endpoints (30 minutes)

1. **Create `server/intelligence-routes.ts`** (see Integration Guide above)

2. **Import in `server/index.ts`**

```typescript
import './intelligence-routes';
```

3. **Test endpoints**

```bash
curl http://localhost:3000/api/intelligence/agents/summary
curl http://localhost:3000/api/intelligence/routing/metrics
```

### Step 4: Replace Mock Data (15 minutes per dashboard)

1. **Update AgentOperations dashboard**
2. **Update PatternLearning dashboard**
3. **Update IntelligenceOperations dashboard**

**Estimated Total Time**: 2-3 hours for basic integration

---

## 9. Performance Considerations

### Database Query Optimization

**Indexes Available**:

- ✅ `correlation_id` - Every table (fast correlation tracing)
- ✅ `created_at DESC` - Every table (fast time-range queries)
- ✅ `agent_name + created_at` - Fast per-agent queries
- ✅ GIN indexes on JSONB columns - Fast JSON queries

**Query Performance Targets**:

- Simple aggregations (COUNT, AVG): <50ms
- Complex joins (v_agent_execution_trace): <200ms
- Time-range queries (24h): <100ms with proper indexes

**Optimization Tips**:

1. Always filter by `created_at` with time range (uses index)
2. Use `LIMIT` for large result sets
3. Use views for complex joins (pre-optimized)
4. Consider materialized views for expensive aggregations

### Kafka Consumer Performance

**Current Throughput**:

- ~1K events/day for routing decisions
- ~50K events/day for agent actions
- ~7-day retention

**Consumer Group Strategy**:

- Use `omnidash-consumers` group
- Single partition per topic (low volume)
- Auto-commit enabled

---

## 10. Monitoring & Debugging

### Health Check Queries

**Check data freshness**:

```sql
SELECT
    'routing_decisions' as table_name,
    COUNT(*) as total_rows,
    MAX(created_at) as latest_timestamp,
    EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) as seconds_since_latest
FROM agent_routing_decisions

UNION ALL

SELECT
    'agent_actions',
    COUNT(*),
    MAX(created_at),
    EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))
FROM agent_actions

UNION ALL

SELECT
    'manifest_injections',
    COUNT(*),
    MAX(created_at),
    EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))
FROM agent_manifest_injections;
```

**Check data quality**:

```sql
-- Find routing decisions without validation
SELECT COUNT(*)
FROM agent_routing_decisions
WHERE actual_success IS NULL
  AND created_at > NOW() - INTERVAL '24 hours';

-- Find actions with unusually high duration
SELECT agent_name, action_name, duration_ms, created_at
FROM agent_actions
WHERE duration_ms > 5000  -- >5 seconds
ORDER BY duration_ms DESC
LIMIT 20;
```

### Kafka Topic Monitoring

```bash
# Check consumer lag
docker exec omninode-bridge-redpanda rpk group describe omnidash-consumers

# List topics
docker exec omninode-bridge-redpanda rpk topic list

# View recent messages
docker exec omninode-bridge-redpanda rpk topic consume agent-actions --num 10
```

---

## 11. Next Steps & Recommendations

### Immediate Actions (Week 1)

1. ✅ **Verify database connection** from omnidash
2. ✅ **Create intelligence schema** in Drizzle
3. ✅ **Add 3-5 key API endpoints** for AgentOperations dashboard
4. ✅ **Replace mock data** in one dashboard to prove concept

### Phase 2 (Week 2-3)

1. **Real-time Kafka integration** for live updates
2. **Add remaining API endpoints** for all dashboards
3. **Performance optimization** (caching, materialized views)
4. **Error handling** and fallback patterns

### Phase 3 (Week 4+)

1. **Advanced visualizations** (D3.js for graph relationships)
2. **Qdrant integration** for pattern similarity search
3. **Memgraph integration** for knowledge graph
4. **Custom metrics** and derived analytics

---

## 12. Contact & Support

### OmniClaude Documentation

- **Main README**: `/Volumes/PRO-G40/Code/omniclaude/README.md`
- **Architecture**: `/Volumes/PRO-G40/Code/omniclaude/CLAUDE.md`
- **Database Migrations**: `/Volumes/PRO-G40/Code/omniclaude/agents/parallel_execution/migrations/`

### Key Files to Reference

- Database schemas: `008_agent_manifest_traceability.sql`, `012_agent_complete_traceability.sql`
- Kafka topics: `services/routing_adapter/schemas/topics.py`
- Event consumers: `consumers/agent_actions_consumer.py`
- API dashboard: `claude_hooks/tools/dashboard_web.py`

### Environment Configuration

- PostgreSQL: `192.168.86.200:5436` (database: `omninode_bridge`)
- Kafka: `192.168.86.200:29092`
- Credentials in `.env` file (never commit!)

---

## Summary

**OmniClaude provides:**

- ✅ **34+ database tables** with complete agent execution traceability
- ✅ **8 Kafka topics** for real-time event streaming
- ✅ **Production-ready infrastructure** with 1,408+ routing decisions
- ✅ **Comprehensive schemas** with correlation ID tracking
- ✅ **Analytical views** for complex queries
- ✅ **Event-driven architecture** for scalability

**Integration with Omnidash:**

- **Phase 1**: Direct PostgreSQL queries (simple, fast, cacheable)
- **Phase 2**: Real-time Kafka events (sub-100ms latency)
- **Phase 3**: Advanced features (Qdrant, Memgraph, custom metrics)

**Estimated Integration Time**: 2-3 hours for basic PostgreSQL integration, 1-2 days for full real-time Kafka integration.

**Data Quality**: Production-ready with comprehensive observability and traceability.
