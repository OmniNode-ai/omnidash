# Event Bus Mock Generator

**Purpose**: Simulate Kafka events by generating realistic event chains for development and testing

**Status**: ✅ Implemented

---

## Overview

The EventBusMockGenerator creates realistic event chains that follow the event catalog patterns, allowing you to test and develop the dashboard without requiring a real Kafka instance.

## Features

- ✅ **Event Chains**: Generates realistic event sequences (requested → started → completed/failed)
- ✅ **All Domains**: Covers intelligence, agent, code, metadata, database, consul, vault events
- ✅ **Automatic**: Starts automatically in development mode when Kafka is unavailable
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

### Automatic (Development Mode)

The mock generator starts automatically when:

- Running in development mode (`NODE_ENV=development`)
- Kafka is not available or validation fails
- `ENABLE_MOCK_EVENTS` is not set to `'false'`

**Configuration**:

- Generates 20 initial event chains on startup
- Continues generating events every 5 seconds
- Can be disabled with `ENABLE_MOCK_EVENTS=false`

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

To test the mock generator:

1. **Start server without Kafka**:

   ```bash
   # Don't set KAFKA_BROKERS, or set to invalid address
   npm run dev
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

- `ENABLE_MOCK_EVENTS`: Set to `'false'` to disable mock generator (default: enabled in dev)
- `NODE_ENV`: Must be `'development'` for automatic startup

## Benefits

1. **No Kafka Required**: Develop and test without Kafka infrastructure
2. **Realistic Data**: Event chains follow real-world patterns
3. **Complete Coverage**: Generates events for all major domains
4. **Easy Testing**: Test data sources and dashboards with realistic data
5. **CI/CD Friendly**: Works in CI environments without Kafka setup

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
