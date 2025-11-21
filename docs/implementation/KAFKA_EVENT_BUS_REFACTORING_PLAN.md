# Kafka Event Bus Refactoring Plan

**Date**: 2025-10-27
**Correlation ID**: d03ec475-d114-4d28-b4b1-25fe395f9019
**Status**: Ready for Implementation

## Executive Summary

Refactor the Omnidash intelligence dashboard from direct PostgreSQL queries to a Kafka event-driven architecture. This eliminates tight database coupling and provides real-time event processing with 10-20x faster API responses.

## Current Architecture Problems

### Direct Database Coupling Issues

1. **Tight Coupling**: Dashboard directly queries PostgreSQL at 192.168.86.200:5436
2. **Ignores Event Bus**: Existing Kafka infrastructure (192.168.86.200:9092) not utilized
3. **Slow Queries**: Database queries add 50-200ms latency per request
4. **Schema Dependencies**: Requires exact column matching (e.g., actual_success column issues)
5. **No Real-Time**: Polling every 10-30s instead of event-driven updates

## Target Architecture

### Event-Driven Flow

```
Kafka Topics → Event Consumer → In-Memory Cache → Fast API (<10ms)
     ↓
WebSocket Broadcasts → Dashboard (real-time updates)
```

### Key Components

1. **Event Consumer** (server/event-consumer.ts)
2. **In-Memory Aggregation** (Maps, sliding windows)
3. **Refactored APIs** (server/intelligence-routes.ts)
4. **Real-Time WebSocket** (server/websocket.ts - already exists)

## Available Infrastructure

**Kafka Brokers**: 192.168.86.200:9092

**Topics**:

- `agent-routing-decisions` - Agent selection events (~1K/day)
- `agent-transformation-events` - Agent transformations (~1K/day)
- `router-performance-metrics` - Performance metrics (~1K/day)
- `agent-actions` - Tool calls, decisions, errors (~50K/day)

**Event Schemas**: See INTELLIGENCE_INTEGRATION.md lines 340-432

## Implementation Plan

### Phase 1: Event Consumer (Days 1-2)

**Create server/event-consumer.ts**:

```typescript
import { Kafka } from 'kafkajs';

interface AgentMetrics {
  agent: string;
  totalRequests: number;
  avgRoutingTime: number;
  avgConfidence: number;
  lastSeen: Date;
}

interface AgentAction {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: string;
  actionName: string;
  durationMs: number;
  createdAt: Date;
}

class EventConsumer {
  private kafka: Kafka;
  private consumer: any;

  // In-memory aggregations
  private agentMetrics = new Map<
    string,
    {
      count: number;
      totalRoutingTime: number;
      totalConfidence: number;
      lastSeen: Date;
    }
  >();

  private recentActions: AgentAction[] = [];
  private maxActions = 100;

  constructor() {
    this.kafka = new Kafka({
      brokers: (process.env.KAFKA_BROKERS || '192.168.86.200:9092').split(','),
      clientId: 'omnidash-event-consumer',
    });

    this.consumer = this.kafka.consumer({
      groupId: 'omnidash-consumers',
    });
  }

  async start() {
    await this.consumer.connect();
    console.log('Kafka consumer connected');

    await this.consumer.subscribe({
      topics: [
        'agent-routing-decisions',
        'agent-transformation-events',
        'router-performance-metrics',
        'agent-actions',
      ],
      fromBeginning: false, // Only new events
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const event = JSON.parse(message.value?.toString() || '{}');

          switch (topic) {
            case 'agent-routing-decisions':
              this.handleRoutingDecision(event);
              break;
            case 'agent-actions':
              this.handleAgentAction(event);
              break;
            // Add other handlers as needed
          }
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      },
    });
  }

  private handleRoutingDecision(event: any) {
    const agent = event.selected_agent;
    const existing = this.agentMetrics.get(agent) || {
      count: 0,
      totalRoutingTime: 0,
      totalConfidence: 0,
      lastSeen: new Date(),
    };

    existing.count++;
    existing.totalRoutingTime += event.routing_time_ms || 0;
    existing.totalConfidence += event.confidence_score || 0;
    existing.lastSeen = new Date();

    this.agentMetrics.set(agent, existing);

    // Cleanup old entries (older than 24h)
    this.cleanupOldMetrics();
  }

  private handleAgentAction(event: any) {
    this.recentActions.unshift({
      id: event.id || crypto.randomUUID(),
      correlationId: event.correlation_id,
      agentName: event.agent_name,
      actionType: event.action_type,
      actionName: event.action_name,
      durationMs: event.duration_ms,
      createdAt: new Date(event.timestamp),
    });

    // Keep only last 100 actions
    if (this.recentActions.length > this.maxActions) {
      this.recentActions = this.recentActions.slice(0, this.maxActions);
    }
  }

  private cleanupOldMetrics() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const [agent, metrics] of this.agentMetrics.entries()) {
      if (metrics.lastSeen < cutoff) {
        this.agentMetrics.delete(agent);
      }
    }
  }

  // Public getters for API endpoints
  getAgentMetrics(): AgentMetrics[] {
    return Array.from(this.agentMetrics.entries()).map(([agent, data]) => ({
      agent,
      totalRequests: data.count,
      avgRoutingTime: data.totalRoutingTime / data.count,
      avgConfidence: data.totalConfidence / data.count,
      lastSeen: data.lastSeen,
    }));
  }

  getRecentActions(): AgentAction[] {
    return this.recentActions;
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      eventsProcessed: this.agentMetrics.size,
      recentActionsCount: this.recentActions.length,
      timestamp: new Date().toISOString(),
    };
  }

  async stop() {
    await this.consumer.disconnect();
    console.log('Kafka consumer disconnected');
  }
}

export const eventConsumer = new EventConsumer();
```

### Phase 2: Refactor API Endpoints (Day 3)

**Update server/intelligence-routes.ts**:

```typescript
import { Router } from 'express';
import { eventConsumer } from './event-consumer';

export const intelligenceRouter = Router();

/**
 * GET /api/intelligence/agents/summary
 * Returns agent metrics from in-memory cache (no DB query)
 */
intelligenceRouter.get('/agents/summary', async (req, res) => {
  try {
    const metrics = eventConsumer.getAgentMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching agent summary:', error);
    res.status(500).json({
      error: 'Failed to fetch agent summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/intelligence/actions/recent
 * Returns recent actions from in-memory cache
 */
intelligenceRouter.get('/actions/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const actions = eventConsumer.getRecentActions().slice(0, limit);
    res.json(actions);
  } catch (error) {
    console.error('Error fetching recent actions:', error);
    res.status(500).json({
      error: 'Failed to fetch recent actions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/intelligence/health
 * Health check using event consumer status
 */
intelligenceRouter.get('/health', async (req, res) => {
  try {
    const health = eventConsumer.getHealthStatus();
    res.json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});
```

### Phase 3: Server Integration (Day 4)

**Update server/index.ts**:

```typescript
import { eventConsumer } from './event-consumer';

(async () => {
  const server = await registerRoutes(app);

  // Start Kafka event consumer
  await eventConsumer.start();
  console.log('Event consumer started');

  // Setup WebSocket for real-time events
  if (process.env.ENABLE_REAL_TIME_EVENTS === 'true') {
    setupWebSocket(server);
  }

  // ... rest of server setup

  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, '0.0.0.0', () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await eventConsumer.stop();
    server.close();
  });
})();
```

### Phase 4: Remove PostgreSQL Dependencies (Day 5)

**Files to Clean Up**:

1. Remove `server/storage.ts` PostgreSQL connection (keep user auth if needed)
2. Remove `shared/intelligence-schema.ts` (or keep for documentation)
3. Remove `pg` and `drizzle-orm` dependencies
4. Update package.json

**Keep**:

- kafkajs (already installed)
- ws (already installed)
- Express and other core dependencies

## Data Structure Design

### Agent Metrics Aggregation

```typescript
Map<
  agentName,
  {
    count: number; // Total requests
    totalRoutingTime: number; // Sum for averaging
    totalConfidence: number; // Sum for averaging
    lastSeen: Date; // For 24h cleanup
  }
>;
```

### Recent Actions Storage

```typescript
AgentAction[] {
  id: string,
  correlationId: string,
  agentName: string,
  actionType: string,
  actionName: string,
  durationMs: number,
  createdAt: Date
}
// Keep as sliding window array (FIFO, max 100)
```

## Performance Benefits

### Current (PostgreSQL)

- API Response Time: 50-200ms
- Database Queries: 3-5 per page load
- Real-Time Updates: Polling every 10-30s
- Memory Usage: Minimal (stateless)

### Target (Event Bus)

- API Response Time: <10ms (in-memory)
- Database Queries: 0 (event-driven)
- Real-Time Updates: <100ms (WebSocket)
- Memory Usage: ~50MB (24h of events)

### Improvement

- **10-20x faster** API responses
- **Zero database coupling**
- **True real-time** updates

## Migration Path

### Step 1: Parallel Run (Week 1)

- Keep PostgreSQL queries running
- Add event consumer in parallel
- Compare results for validation
- Monitor memory usage

### Step 2: Gradual Cutover (Week 2)

- Switch health endpoint to events
- Switch actions endpoint to events
- Switch metrics endpoint to events
- Monitor for issues

### Step 3: Full Migration (Week 3)

- Remove PostgreSQL dependencies
- Delete old query code
- Update documentation
- Celebrate! 🎉

## Testing Strategy

### Unit Tests

```typescript
describe('EventConsumer', () => {
  it('should aggregate routing decisions correctly', () => {
    // Test metric aggregation
  });

  it('should maintain sliding window of actions', () => {
    // Test FIFO action storage
  });

  it('should cleanup old metrics after 24h', () => {
    // Test cleanup logic
  });
});
```

### Integration Tests

- Connect to test Kafka broker
- Publish test events
- Verify aggregations
- Check API responses

### E2E Tests

- Start full server
- Publish real events
- Query API endpoints
- Verify WebSocket updates

## Rollback Plan

If issues occur:

1. Stop event consumer
2. Re-enable PostgreSQL queries
3. Restart server
4. Investigate issues
5. Fix and retry

Keep PostgreSQL code commented (not deleted) for 1 month.

## Success Criteria

✅ All API endpoints respond in <10ms
✅ Zero PostgreSQL queries for intelligence data
✅ WebSocket broadcasts on every new event
✅ Memory usage stays under 100MB
✅ No data loss during migration
✅ Dashboard shows real-time updates

## Timeline

- **Day 1**: Implement event consumer
- **Day 2**: Test aggregations and memory
- **Day 3**: Refactor API endpoints
- **Day 4**: Integration and E2E testing
- **Day 5**: Deploy and monitor

**Total**: 1 week for complete migration

## Next Steps

1. Review this plan
2. Get approval
3. Create feature branch: `feature/kafka-event-consumer`
4. Start Phase 1 implementation
5. Monitor and iterate

---

**Author**: Claude Code (Polymorphic Agent)
**Date**: 2025-10-27
**Status**: Ready for Implementation
