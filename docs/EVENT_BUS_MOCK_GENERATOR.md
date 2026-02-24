# Event Bus Mock Generator

**Purpose**: Simulate Kafka events by generating realistic event chains for development and testing

**Status**: ✅ Implemented

---

## Overview

The EventBusMockGenerator creates realistic event chains that follow the event catalog patterns. It is intended **only for local unit tests and isolated component testing** — not as a substitute for a running Kafka/Redpanda broker. In all real deployments and integration environments, Kafka must be running and `KAFKA_BROKERS` must be set.

## Features

- ✅ **Event Chains**: Generates realistic event sequences (requested → started → completed/failed)
- ✅ **All Domains**: Covers intelligence, agent, code, metadata, database, consul, vault events
- ✅ **Automatic**: Starts automatically in isolated test environments when `ENABLE_MOCK_EVENTS=true` is set (never as a replacement for Kafka in real development)
- ✅ **Realistic Timing**: Simulates realistic delays between events in a chain
- ✅ **Direct Injection**: Injects events directly into EventBusDataSource (bypasses Kafka)

## Event Chains Generated

### 1. Intelligence Query Chain (30% probability)

```
omninode.intelligence.query.requested.v1
  ↓ (100-300ms delay)
omninode.intelligence.query.completed.v1
```

### 2. Agent Execution Chain (20% probability)

```
omninode.agent.routing.requested.v1
  ↓ (50-150ms delay)
omninode.agent.routing.completed.v1
  ↓ (100ms delay)
omninode.agent.execution.started.v1
  ↓ (500-1500ms delay)
omninode.agent.execution.completed.v1 (90% success)
  OR
omninode.agent.execution.failed.v1 (10% failure)
```

### 3. Code Generation Chain (15% probability)

```
omninode.code.generation.requested.v1
  ↓ (200-500ms delay)
omninode.code.generation.completed.v1
```

### 4. Metadata Stamping Chain (10% probability)

```
omninode.metadata.stamping.requested.v1
  ↓ (50-150ms delay)
omninode.metadata.stamping.stamped.v1
```

### 5. Database Query Chain (10% probability)

```
omninode.database.query.requested.v1
  ↓ (10-60ms delay)
omninode.database.query.completed.v1
```

### 6. Consul Service Chain (7% probability)

```
omninode.consul.service.register.requested.v1
  ↓ (50ms delay)
omninode.consul.service.registered.v1
```

### 7. Vault Secret Chain (8% probability)

```
omninode.vault.secret.read.requested.v1
  ↓ (20-50ms delay)
omninode.vault.secret.read.completed.v1
```

## Usage

### Automatic (Isolated Test Environments Only)

The mock generator starts automatically when:

- Running in development mode (`NODE_ENV=development`)
- `ENABLE_MOCK_EVENTS` is set to `'true'` explicitly

> **Warning**: The mock generator is **not a substitute for Kafka**. Kafka/Redpanda is required infrastructure. If the mock generator is starting in your environment because Kafka is unreachable, that is an error state — fix the `KAFKA_BROKERS` configuration, do not rely on mock events.

**Configuration**:

- Generates 20 initial event chains on startup
- Continues generating events every 5 seconds
- Must be explicitly enabled with `ENABLE_MOCK_EVENTS=true`

### Manual Control

```typescript
import { eventBusMockGenerator } from './server/event-bus-mock-generator';

// Start generating events
await eventBusMockGenerator.start({
  continuous: true,
  interval_ms: 5000, // Generate events every 5 seconds
  initialChains: 20, // Generate 20 chains on startup
});

// Stop generating events
eventBusMockGenerator.stop();
```

## Event Correlation

Events in a chain share:

- **correlation_id**: Links request → response events
- **causation_id**: Links parent → child events
- **tenant_id**: Defaults to `'default-tenant'`
- **namespace**: Defaults to `'development'`

This allows you to:

- Track complete workflows
- Query events by correlation_id
- See realistic event relationships

## Example Event Flow

```
1. Intelligence Query Requested
   - correlation_id: "abc-123"
   - event_type: "omninode.intelligence.query.requested.v1"
   - payload: { query: "optimize database", operation_type: "code_analysis" }

2. Intelligence Query Completed (100-300ms later)
   - correlation_id: "abc-123" (same)
   - causation_id: "abc-123" (references request)
   - event_type: "omninode.intelligence.query.completed.v1"
   - payload: { result: {...}, duration_ms: 250 }
```

## Integration with EventBusDataSource

The mock generator uses `eventBusDataSource.injectEvent()` to:

1. Emit events for real-time processing
2. Store events in PostgreSQL
3. Trigger WebSocket broadcasts (if enabled)

This means:

- ✅ Events appear in database queries
- ✅ Events are available via `/api/event-bus/events`
- ✅ Events can trigger real-time updates
- ✅ Events follow the same format as real Kafka events

## Testing

To test the mock generator in isolation:

1. **Start server with mock events enabled** (do not use this in place of Kafka):

   ```bash
   # Only for isolated component tests — Kafka must still run in real environments
   ENABLE_MOCK_EVENTS=true npm run dev
   ```

2. **Verify mock generator started**:

   ```
   🔧 Starting mock event generator (development mode)
   ✅ Mock event generator started - simulating event chains
   ```

3. **Query events**:

   ```bash
   curl http://localhost:3000/api/event-bus/events?limit=10
   ```

4. **Check statistics**:
   ```bash
   curl http://localhost:3000/api/event-bus/statistics
   ```

## Customization

You can customize the mock generator by modifying:

- **Event probabilities**: Change percentages in `generateRandomEventChain()`
- **Event delays**: Adjust `sleep()` calls in chain generators
- **Event payloads**: Modify payload structures in chain generators
- **Agent list**: Update `agents` array
- **Query list**: Update `queries` array

## Environment Variables

- `ENABLE_MOCK_EVENTS`: Set to `'true'` to enable mock generator for isolated tests (default: disabled)
- `NODE_ENV`: Must be `'development'` for automatic startup
- `KAFKA_BROKERS` (required): Must be set for all real environments. Missing `KAFKA_BROKERS` is an error, not a trigger for mock mode.

## Benefits

1. **Isolated Unit Testing**: Test component logic and data source behavior without a live Kafka stream (Kafka is still required for integration and end-to-end environments)
2. **Realistic Data**: Event chains follow real-world patterns
3. **Complete Coverage**: Generates events for all major domains
4. **Easy Testing**: Test data sources and dashboards with realistic data
5. **CI Unit Tests**: Enables unit-test-level assertions without Kafka infrastructure (integration tests must use real Kafka)

## Next Steps

- [ ] Add more event chain types (pattern discovery, compliance validation, etc.)
- [ ] Add configurable event rates
- [ ] Add event replay from stored events
- [ ] Add event chain templates for specific scenarios
- [ ] Add WebSocket integration for real-time event broadcasting

---

**See Also**:

- `EVENT_BUS_DATA_SOURCE_IMPLEMENTATION.md` - EventBusDataSource documentation
- `EVENT_TO_COMPONENT_MAPPING.md` - Event to component mapping
- `MVP_EVENT_CATALOG.md` - Complete event catalog
