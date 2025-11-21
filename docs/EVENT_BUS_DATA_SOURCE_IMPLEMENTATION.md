# Event Bus Data Source Implementation

**Status**: ✅ Implemented  
**Date**: November 2025

## Overview

The EventBusDataSource has been implemented to provide a foundation for event bus integration. It subscribes to all events from Kafka/Redpanda, stores them in PostgreSQL, and provides query APIs for data sources.

## What Was Implemented

### 1. Core EventBusDataSource Class (`server/event-bus-data-source.ts`)

**Features**:

- ✅ Subscribes to all event topics matching event catalog patterns
- ✅ Normalizes event envelope structure (event_type, event_id, timestamp, tenant_id, etc.)
- ✅ Stores events in PostgreSQL with proper indexing
- ✅ Provides query APIs for data sources
- ✅ Emits events for real-time processing
- ✅ Graceful error handling and connection validation

**Key Methods**:

- `validateConnection()` - Validates Kafka broker reachability
- `initializeSchema()` - Creates database table and indexes
- `start()` - Starts consuming events from Kafka
- `queryEvents(options)` - Query events with filters
- `getStatistics(timeRange)` - Get event statistics
- `stop()` - Graceful shutdown

### 2. API Routes (`server/event-bus-routes.ts`)

**Endpoints**:

- `GET /api/event-bus/events` - Query events with filters
- `GET /api/event-bus/statistics` - Get event statistics
- `GET /api/event-bus/status` - Get data source status

### 3. Server Integration (`server/index.ts`)

- ✅ EventBusDataSource starts automatically on server startup
- ✅ Validates Kafka connection before starting
- ✅ Graceful shutdown on SIGTERM/SIGINT
- ✅ Error handling with fallback behavior

### 4. Route Registration (`server/routes.ts`)

- ✅ Event bus routes mounted at `/api/event-bus`

## Database Schema

The implementation creates an `event_bus_events` table with:

```sql
CREATE TABLE event_bus_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  timestamp TIMESTAMPTZ NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  namespace VARCHAR(255),
  source VARCHAR(255) NOT NULL,
  correlation_id VARCHAR(255),
  causation_id VARCHAR(255),
  schema_ref VARCHAR(500),
  payload JSONB NOT NULL,
  topic VARCHAR(255) NOT NULL,
  partition INTEGER NOT NULL,
  offset VARCHAR(255) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**Indexes**:

- `event_type` - For filtering by event type
- `tenant_id` - For tenant isolation
- `correlation_id` - For request/response tracking
- `timestamp` - For time-based queries
- `namespace` - For namespace filtering
- Composite: `(event_type, tenant_id, timestamp)` - For common query patterns

## Event Pattern Matching

The data source subscribes to topics matching these patterns:

- `{tenant}.omninode.intelligence.*.v{version}`
- `{tenant}.omninode.agent.*.v{version}`
- `{tenant}.omninode.metadata.*.v{version}`
- `{tenant}.omninode.code.*.v{version}`
- `{tenant}.omninode.database.*.v{version}`
- `{tenant}.omninode.consul.*.v{version}`
- `{tenant}.omninode.vault.*.v{version}`
- `{tenant}.omninode.bridge.*.v{version}`
- `{tenant}.omninode.service.*.v{version}`
- `{tenant}.omninode.logging.*.v{version}`
- `{tenant}.omninode.token.*.v{version}` (planned)
- `{tenant}.omninode.pattern.*.v{version}` (planned)
- `{tenant}.omninode.p2p.*.v{version}` (planned)
- `{tenant}.omninode.metacontext.*.v{version}` (planned)
- `{tenant}.onex.*.v{version}` (registry)

## Usage Examples

### Query Events

```typescript
import { eventBusDataSource } from './server/event-bus-data-source';

// Query events by type
const events = await eventBusDataSource.queryEvents({
  event_types: ['omninode.agent.execution.completed.v1'],
  tenant_id: 'tenant-123',
  start_time: new Date('2025-11-01'),
  end_time: new Date('2025-11-13'),
  limit: 100,
  order_by: 'timestamp',
  order_direction: 'desc',
});
```

### Get Statistics

```typescript
const stats = await eventBusDataSource.getStatistics({
  start: new Date('2025-11-01'),
  end: new Date('2025-11-13'),
});

console.log(`Total events: ${stats.total_events}`);
console.log(`Events per minute: ${stats.events_per_minute}`);
console.log(`Events by type:`, stats.events_by_type);
```

### API Usage

```bash
# Query events
curl "http://localhost:3000/api/event-bus/events?event_types=omninode.agent.execution.completed.v1&limit=10"

# Get statistics
curl "http://localhost:3000/api/event-bus/statistics?start=2025-11-01&end=2025-11-13"

# Check status
curl "http://localhost:3000/api/event-bus/status"
```

## Next Steps

### Phase 1: Integration with Existing Data Sources

- [ ] Update `intelligence-analytics-source.ts` to use EventBusDataSource
- [ ] Update `agent-management-source.ts` to use EventBusDataSource
- [ ] Update `code-intelligence-source.ts` to use EventBusDataSource
- [ ] Update `platform-health-source.ts` to use EventBusDataSource

### Phase 2: Create Missing Data Sources

- [ ] `database-operations-source.ts` - Database event tracking
- [ ] `vault-operations-source.ts` - Vault audit tracking
- [ ] `consul-operations-source.ts` - Service discovery tracking
- [ ] `code-generation-source.ts` - Code generation tracking
- [ ] `metadata-operations-source.ts` - Metadata tracking
- [ ] `bridge-operations-source.ts` - Workflow tracking
- [ ] `logging-source.ts` - Log aggregation

### Phase 3: WebSocket Integration

- [ ] Integrate EventBusDataSource events with WebSocket server
- [ ] Broadcast events to connected clients in real-time
- [ ] Add event filtering/subscription per client

### Phase 4: Data Transformation

- [ ] Create transformers for each event type → data source format
- [ ] Implement event aggregation for metrics
- [ ] Add caching for frequently accessed events

## Configuration

**Environment Variables**:

- `KAFKA_BROKERS` or `KAFKA_BOOTSTRAP_SERVERS` - Kafka broker addresses (comma-separated)
- `DATABASE_URL` - PostgreSQL connection string
- `ENABLE_REAL_TIME_EVENTS` - Enable WebSocket real-time events (default: false)

## Testing

To test the implementation:

1. **Start Kafka/Redpanda**:

   ```bash
   # Ensure Kafka is running and accessible
   ```

2. **Start the server**:

   ```bash
   npm run dev
   ```

3. **Verify connection**:

   ```bash
   curl http://localhost:3000/api/event-bus/status
   ```

4. **Query events**:
   ```bash
   curl http://localhost:3000/api/event-bus/events?limit=10
   ```

## Architecture Notes

- **Event Storage**: All events are stored in PostgreSQL for historical queries
- **Real-time Processing**: Events are emitted for WebSocket broadcasting
- **Idempotency**: Events are deduplicated by `event_id` (ON CONFLICT DO NOTHING)
- **Error Handling**: Storage failures don't stop event processing
- **Connection Validation**: Validates Kafka connection before starting
- **Graceful Shutdown**: Properly disconnects on server shutdown

## Related Documentation

- `EVENT_TO_COMPONENT_MAPPING.md` - Event to component mapping
- `EVENT_MAPPING_QUICK_REFERENCE.md` - Quick reference guide
- `MVP_EVENT_CATALOG.md` - Complete event catalog
- `EVENT_BUS_INTEGRATION_GUIDE.md` - Integration guide
