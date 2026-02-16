# Event Bus & Database Adapter Guide

This guide documents how Omnidash uses the event bus (Kafka/Redpanda) and PostgreSQL CRUD adapter, following patterns from OmniClaude and OmniIntelligence.

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Omnidash      │         │   Kafka/Redpanda │         │   PostgreSQL    │
│   Dashboard     │◄───────►│   Event Bus      │◄───────►│   Database      │
└─────────────────┘         └──────────────────┘         └─────────────────┘
      │                              │
      │                              │
      ▼                              ▼
┌─────────────────┐         ┌──────────────────┐
│ Event Consumer  │         │  DB Adapter       │
│ (Read Events)   │         │  (CRUD Ops)       │
└─────────────────┘         └──────────────────┘
```

## Components

### 1. Event Consumer (`server/event-consumer.ts`)

**Purpose**: Consumes Kafka events for real-time dashboard updates

**Topics Subscribed**:

- `agent-routing-decisions` - Agent selection events
- `agent-transformation-events` - Agent transformations
- `router-performance-metrics` - Performance metrics
- `agent-actions` - Tool calls, decisions, errors

**Features**:

- In-memory aggregations (agent metrics, recent actions)
- EventEmitter API for WebSocket broadcasts
- Automatic cleanup of old metrics (24h TTL)

**Usage**:

```typescript
import { eventConsumer } from './event-consumer';

// Consumer is already started in server/index.ts
// Access aggregated data:
const metrics = eventConsumer.getAgentMetrics();
const actions = eventConsumer.getRecentActions(100);
const decisions = eventConsumer.getRoutingDecisions();
```

### 2. Database Adapter (`server/db-adapter.ts`)

**Purpose**: Full CRUD operations for PostgreSQL tables using Drizzle ORM

**Features**:

- ✅ Query (with filters, ordering, pagination)
- ✅ Insert (with auto-timestamps)
- ✅ Update (with where conditions)
- ✅ Delete (with safety checks)
- ✅ Upsert (insert or update on conflict)
- ✅ Count (with optional filters)
- ✅ Raw SQL execution

**Usage**:

```typescript
import { dbAdapter } from './db-adapter';

// Query records
const actions = await dbAdapter.query('agent_actions', {
  where: { agent_name: 'test-agent' },
  limit: 100,
  orderBy: { column: 'created_at', direction: 'desc' },
});

// Insert new record
const newAction = await dbAdapter.insert('agent_actions', {
  correlation_id: 'abc123',
  agent_name: 'test-agent',
  action_type: 'success',
  action_name: 'generate_code',
});

// Update records
const updated = await dbAdapter.update(
  'agent_actions',
  { id: 'action-id' },
  { action_type: 'completed' }
);

// Delete records
await dbAdapter.delete('agent_actions', { id: 'action-id' });

// Upsert (insert or update)
const upserted = await dbAdapter.upsert(
  'agent_actions',
  {
    id: 'action-id',
    agent_name: 'test-agent',
    action_type: 'success',
  },
  ['id']
);

// Count records
const count = await dbAdapter.count('agent_actions', {
  agent_name: 'test-agent',
});

// Raw SQL
const results = await dbAdapter.executeRaw(
  "SELECT * FROM agent_actions WHERE created_at > NOW() - INTERVAL '24 hours'",
  []
);
```

**Supported Tables** (from `shared/intelligence-schema.ts`):

- `agent_routing_decisions`
- `agent_actions`
- `agent_manifest_injections`
- `agent_transformation_events`
- `error_events`
- `pattern_lineage_nodes`
- `pattern_lineage_edges`

### 3. Event Bus Publisher (Future)

**Planned**: Event bus publisher for write operations (similar to OmniClaude's `DatabaseEventClient`)

**Pattern** (from OmniClaude):

```
1. Publish DATABASE_QUERY_REQUESTED event to Kafka
2. Database adapter handler processes request
3. Publish DATABASE_QUERY_COMPLETED/FAILED response
4. Client waits for response with correlation ID
```

**Benefits**:

- Decoupled writes (async processing)
- Better scalability
- Graceful degradation (fallback to direct DB)

## Migration Strategy: Direct DB → Event Bus

### Current State (Phase 1)

- ✅ Event Consumer: Reading events for real-time updates
- ✅ Database Adapter: Direct CRUD for API endpoints
- ❌ Event Bus Publisher: Not yet implemented

### Target State (Phase 2)

- ✅ Event Consumer: Real-time reads
- ✅ Database Adapter: Direct CRUD (fallback)
- ✅ Event Bus Publisher: Async writes via Kafka
- ✅ Hybrid: Reads from events, writes via bus (with DB fallback)

### Implementation Plan

1. **Create Event Bus Publisher** (`server/event-publisher.ts`)
   - Publish `DATABASE_QUERY_REQUESTED` events
   - Wait for `DATABASE_QUERY_COMPLETED` responses
   - Timeout handling with DB fallback

2. **Update Routes** (`server/intelligence-routes.ts`)
   - Replace direct DB writes with event bus publisher
   - Keep direct reads for fast queries
   - Add feature flag: `USE_EVENT_BUS_FOR_WRITES=true`

3. **Add Handler Service** (if needed)
   - Bridge service already handles database events
   - Verify compatibility with Omnidash publisher

## Best Practices

### When to Use Event Bus

- ✅ High-volume writes (agent actions, transformations)
- ✅ Async operations (non-blocking)
- ✅ Decoupled services (write now, process later)

### When to Use Direct DB

- ✅ Read queries (fast, synchronous)
- ✅ Aggregations (complex SQL)
- ✅ Critical writes (must confirm immediately)
- ✅ Fallback (event bus unavailable)

### Error Handling

```typescript
try {
  // Try event bus first
  await eventPublisher.insert('agent_actions', data);
} catch (error) {
  // Fallback to direct DB
  console.warn('Event bus failed, using direct DB', error);
  await dbAdapter.insert('agent_actions', data);
}
```

## Configuration

**Environment Variables**:

```bash
# Kafka/Redpanda
KAFKA_BROKERS=192.168.86.200:29092
KAFKA_BOOTSTRAP_SERVERS=192.168.86.200:29092

# PostgreSQL
DATABASE_URL=postgresql://postgres:<your_password>@192.168.86.200:5436/omnidash_analytics
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omnidash_analytics
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<your_password>  # Get from .env file - never commit passwords!

# Feature Flags
USE_EVENT_BUS_FOR_WRITES=false  # Enable when publisher is ready
ENABLE_REAL_TIME_EVENTS=true
```

## References

- OmniClaude: `agents/lib/database_event_client.py` - Event-based DB client pattern
- OmniClaude: `agents/lib/intelligence_event_client.py` - Intelligence event pattern
- OmniIntelligence: `services/bridge/producers/kafka_producer_manager.py` - Producer pattern
- Omnidash: `server/event-consumer.ts` - Event consumption
- Omnidash: `server/db-adapter.ts` - CRUD adapter
- `DATA_SOURCES_AND_RETRIEVAL.md` - Data sources overview
