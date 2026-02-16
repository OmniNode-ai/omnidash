# OmniClaude → Omnidash Integration Quick Start

**Date**: 2025-11-03
**Estimated Time**: 2-3 hours for basic integration

---

## TL;DR

OmniClaude has **34+ PostgreSQL tables** and **8 Kafka topics** tracking comprehensive agent execution data. All data is production-ready and available for integration.

**Database**: `postgresql://postgres:<password>@192.168.86.200:5436/omnidash_analytics`
**Kafka**: `192.168.86.200:29092`

---

## Data Availability Checklist

| Dashboard                   | Data Source  | Status            | Tables/Topics                                           |
| --------------------------- | ------------ | ----------------- | ------------------------------------------------------- |
| **Agent Operations**        | ✅ Available | Production        | `agent_routing_decisions`, `agent_actions`              |
| **Pattern Learning**        | ✅ Available | Production        | `agent_intelligence_usage`, `agent_manifest_injections` |
| **Intelligence Operations** | ✅ Available | Production        | `agent_manifest_injections`, `agent_prompts`            |
| **Code Intelligence**       | ✅ Available | Production        | `agent_file_operations`, `agent_intelligence_usage`     |
| **Event Flow**              | ⚠️ Partial   | Kafka only        | Topics: `agent-actions`, `agent-routing-decisions`      |
| **Knowledge Graph**         | ⚠️ External  | Memgraph          | Need Memgraph connector (port 7687)                     |
| **Platform Health**         | ✅ Derivable | From routing data | `agent_routing_decisions`, `router_performance_metrics` |

---

## Quick Integration Steps

### Step 1: Database Connection (5 min)

**Verify credentials in omnidash/.env**:

```bash
# These should already be set from shared infrastructure
DATABASE_URL="postgresql://postgres:<password>@192.168.86.200:5436/omnidash_analytics"
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omnidash_analytics
```

**Test connection**:

```bash
source .env
psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DATABASE -c "SELECT COUNT(*) FROM agent_routing_decisions;"
```

Expected output: A number (likely 1,408+ records).

---

### Step 2: Add Intelligence Schema (15 min)

**Create `shared/intelligence-schema.ts`**:

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

// Core tables for omnidash integration
export const agentRoutingDecisions = pgTable('agent_routing_decisions', {
  id: uuid('id').primaryKey(),
  correlationId: uuid('correlation_id').notNull(),
  userRequest: text('user_request').notNull(),
  selectedAgent: text('selected_agent').notNull(),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),
  routingStrategy: text('routing_strategy').notNull(),
  routingTimeMs: integer('routing_time_ms').notNull(),
  actualSuccess: boolean('actual_success'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const agentActions = pgTable('agent_actions', {
  id: uuid('id').primaryKey(),
  correlationId: uuid('correlation_id').notNull(),
  agentName: text('agent_name').notNull(),
  actionType: text('action_type').notNull(),
  actionName: text('action_name').notNull(),
  actionDetails: jsonb('action_details'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const agentManifestInjections = pgTable('agent_manifest_injections', {
  id: uuid('id').primaryKey(),
  correlationId: uuid('correlation_id').notNull(),
  agentName: text('agent_name').notNull(),
  patternsCount: integer('patterns_count').default(0),
  totalQueryTimeMs: integer('total_query_time_ms').notNull(),
  agentExecutionSuccess: boolean('agent_execution_success'),
  agentQualityScore: numeric('agent_quality_score', { precision: 5, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

---

### Step 3: Create API Endpoints (30 min)

**Create `server/intelligence-routes.ts`**:

```typescript
import { Router } from 'express';
import { db } from './db';
import {
  agentRoutingDecisions,
  agentActions,
  agentManifestInjections,
} from '../shared/intelligence-schema';
import { desc, gte, sql, count, avg } from 'drizzle-orm';

const router = Router();

// Agent Operations Dashboard
router.get('/api/intelligence/agents/summary', async (req, res) => {
  try {
    const timeRange = req.query.range || '24h';
    const interval = timeRange === '1h' ? '1 hour' : timeRange === '7d' ? '7 days' : '24 hours';

    const summary = await db
      .select({
        agentName: agentActions.agentName,
        totalActions: count(),
        avgDuration: avg(agentActions.durationMs),
        successCount: sql<number>`count(*) filter (where ${agentActions.actionType} = 'success')`,
        errorCount: sql<number>`count(*) filter (where ${agentActions.actionType} = 'error')`,
      })
      .from(agentActions)
      .where(gte(agentActions.createdAt, sql`now() - interval '${sql.raw(interval)}'`))
      .groupBy(agentActions.agentName)
      .orderBy(desc(count()));

    res.json(summary);
  } catch (error) {
    console.error('Error fetching agent summary:', error);
    res.status(500).json({ error: 'Failed to fetch agent summary' });
  }
});

router.get('/api/intelligence/routing/metrics', async (req, res) => {
  try {
    const timeRange = req.query.range || '24h';
    const interval = timeRange === '1h' ? '1 hour' : timeRange === '7d' ? '7 days' : '24 hours';

    const metrics = await db
      .select({
        totalDecisions: count(),
        avgConfidence: avg(agentRoutingDecisions.confidenceScore),
        avgRoutingTime: avg(agentRoutingDecisions.routingTimeMs),
        successCount: sql<number>`count(*) filter (where ${agentRoutingDecisions.actualSuccess} = true)`,
        totalValidated: sql<number>`count(*) filter (where ${agentRoutingDecisions.actualSuccess} is not null)`,
      })
      .from(agentRoutingDecisions)
      .where(gte(agentRoutingDecisions.createdAt, sql`now() - interval '${sql.raw(interval)}'`));

    const result = metrics[0];
    const successRate =
      result.totalValidated > 0 ? (result.successCount / result.totalValidated) * 100 : 0;

    res.json({
      ...result,
      successRate,
    });
  } catch (error) {
    console.error('Error fetching routing metrics:', error);
    res.status(500).json({ error: 'Failed to fetch routing metrics' });
  }
});

router.get('/api/intelligence/routing/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const decisions = await db
      .select()
      .from(agentRoutingDecisions)
      .orderBy(desc(agentRoutingDecisions.createdAt))
      .limit(limit);

    res.json(decisions);
  } catch (error) {
    console.error('Error fetching recent decisions:', error);
    res.status(500).json({ error: 'Failed to fetch recent decisions' });
  }
});

export default router;
```

**Import in `server/index.ts`**:

```typescript
import intelligenceRoutes from './intelligence-routes';

// After other middleware
app.use(intelligenceRoutes);
```

---

### Step 4: Replace Mock Data (15 min per dashboard)

**Example: AgentOperations Dashboard**

**Before (mock data)**:

```typescript
const agentSummary = useMemo(() => {
  return Array.from({ length: 52 }, (_, i) => ({
    name: `agent-${i}`,
    actions: Math.floor(Math.random() * 1000),
  }));
}, []);
```

**After (real data)**:

```typescript
const { data: agentSummary, isLoading } = useQuery({
  queryKey: ['intelligence', 'agents', 'summary', '24h'],
  queryFn: async () => {
    const res = await fetch('/api/intelligence/agents/summary?range=24h');
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
  },
  refetchInterval: 5000, // Refresh every 5 seconds
});

if (isLoading) {
  return <LoadingSpinner />;
}
```

**Similar pattern for routing metrics**:

```typescript
const { data: routingMetrics } = useQuery({
  queryKey: ['intelligence', 'routing', 'metrics', '24h'],
  queryFn: async () => {
    const res = await fetch('/api/intelligence/routing/metrics?range=24h');
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
  },
  refetchInterval: 5000,
});

// Use in JSX
<MetricCard
  title="Total Decisions"
  value={routingMetrics?.totalDecisions ?? 0}
/>
<MetricCard
  title="Avg Confidence"
  value={`${((routingMetrics?.avgConfidence ?? 0) * 100).toFixed(1)}%`}
/>
```

---

## Essential SQL Queries

### Agent Activity Summary

```sql
SELECT
    agent_name,
    COUNT(*) as total_actions,
    AVG(duration_ms) as avg_duration,
    COUNT(*) FILTER (WHERE action_type = 'success') as successes,
    COUNT(*) FILTER (WHERE action_type = 'error') as errors
FROM agent_actions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_name
ORDER BY total_actions DESC
LIMIT 20;
```

### Routing Performance

```sql
SELECT
    COUNT(*) as total_decisions,
    AVG(confidence_score) as avg_confidence,
    AVG(routing_time_ms) as avg_routing_time,
    COUNT(*) FILTER (WHERE actual_success = true) as successes
FROM agent_routing_decisions
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Pattern Usage

```sql
SELECT
    intelligence_name,
    COUNT(*) as times_used,
    AVG(confidence_score) as avg_confidence
FROM agent_intelligence_usage
WHERE created_at > NOW() - INTERVAL '7 days'
  AND was_applied = true
GROUP BY intelligence_name
ORDER BY times_used DESC
LIMIT 25;
```

---

## Dashboard-Specific Endpoints

### Agent Operations

- `GET /api/intelligence/agents/summary` - Agent activity summary
- `GET /api/intelligence/routing/metrics` - Routing performance
- `GET /api/intelligence/routing/recent` - Recent routing decisions

### Pattern Learning

- `GET /api/intelligence/patterns/usage` - Pattern application stats
- `GET /api/intelligence/patterns/trending` - Trending patterns

### Intelligence Operations

- `GET /api/intelligence/manifests/performance` - Manifest query performance
- `GET /api/intelligence/manifests/recent` - Recent manifest injections

### Code Intelligence

- `GET /api/intelligence/files/operations` - File operation statistics
- `GET /api/intelligence/files/most-modified` - Most modified files

### Event Flow

- `GET /api/intelligence/traces/:correlationId` - Complete execution trace
- `GET /api/intelligence/traces/recent` - Recent execution traces

---

## Testing Your Integration

### 1. Test Database Connection

```bash
curl http://localhost:3000/api/intelligence/routing/metrics
```

Expected response:

```json
{
  "totalDecisions": 1408,
  "avgConfidence": "0.8732",
  "avgRoutingTime": "8.45",
  "successCount": 1203,
  "totalValidated": 1350,
  "successRate": 89.11
}
```

### 2. Test Agent Summary

```bash
curl http://localhost:3000/api/intelligence/agents/summary
```

Expected response:

```json
[
  {
    "agentName": "agent-test",
    "totalActions": 523,
    "avgDuration": "245.6",
    "successCount": 498,
    "errorCount": 25
  },
  ...
]
```

### 3. Check Data Freshness

```sql
-- In psql
SELECT MAX(created_at) as latest_data
FROM agent_routing_decisions;
```

Should show recent timestamp (within last few minutes if system is active).

---

## Troubleshooting

### Database Connection Issues

**Error: "password authentication failed"**

```bash
# Solution: Check .env has correct password from omniclaude
grep POSTGRES_PASSWORD /Volumes/PRO-G40/Code/omniclaude/.env
# Copy that password to omnidash/.env
```

**Error: "relation does not exist"**

```bash
# Solution: Verify database name is correct
psql -h 192.168.86.200 -p 5436 -U postgres -d omnidash_analytics -c "\dt"
# Should list agent_routing_decisions, agent_actions, etc.
```

### API Errors

**Error: "Failed to fetch agent summary"**

```typescript
// Solution: Check server logs
console.error('Error fetching agent summary:', error);
// Look for SQL syntax errors or missing columns
```

**Error: "Data is empty/null"**

```sql
-- Solution: Verify data exists
SELECT COUNT(*) FROM agent_routing_decisions WHERE created_at > NOW() - INTERVAL '24 hours';
-- If 0, check if omniclaude is running and generating events
```

### Data Quality Issues

**Metrics seem stale**:

```bash
# Check when omniclaude last wrote data
psql -h 192.168.86.200 -p 5436 -U postgres -d omnidash_analytics -c "
SELECT
    'routing_decisions' as table_name,
    MAX(created_at) as latest,
    EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) as seconds_ago
FROM agent_routing_decisions;
"
```

If data is old:

1. Check if omniclaude agent_actions_consumer is running
2. Verify Kafka topics have recent messages
3. Check consumer logs for errors

---

## Performance Tips

1. **Use time-range filters**: Always filter by `created_at` for fast queries
2. **Limit result sets**: Use `LIMIT` clause to prevent large transfers
3. **Cache with TanStack Query**: Set appropriate `refetchInterval` (5-30 seconds)
4. **Use views for complex queries**: OmniClaude provides pre-optimized views like `v_agent_execution_trace`

---

## Next Steps

After basic integration works:

1. **Add remaining endpoints** for other dashboards
2. **Implement real-time updates** via Kafka or Server-Sent Events
3. **Add error boundaries** for graceful fallback to mock data
4. **Create TypeScript types** for all API responses
5. **Add loading states** and skeleton components
6. **Implement caching strategy** (Redis or in-memory)

---

## Resources

- **Full Research Report**: `OMNICLAUDE_DATA_SOURCES_RESEARCH.md`
- **OmniClaude Docs**: `/Volumes/PRO-G40/Code/omniclaude/CLAUDE.md`
- **Database Schemas**: `/Volumes/PRO-G40/Code/omniclaude/agents/parallel_execution/migrations/`
- **Shared Infrastructure**: `~/.claude/CLAUDE.md`

---

## Support

If you encounter issues:

1. Check database connection: `psql -h 192.168.86.200 -p 5436 -U postgres -d omnidash_analytics`
2. Verify data exists: `SELECT COUNT(*) FROM agent_routing_decisions;`
3. Check API endpoints: `curl http://localhost:3000/api/intelligence/routing/metrics`
4. Review server logs for errors

**Estimated completion time**: 2-3 hours for basic PostgreSQL integration across all dashboards.
