# Dashboard Integration Quick Reference

**Last Updated**: 2025-10-29

## Data Source Status at a Glance

| Data Source | Records | Status | Dashboard Target | Effort | Priority |
|-------------|---------|--------|------------------|--------|----------|
| **agent_routing_decisions** | 209/24h | ✅ Production | Agent Operations | 1h | ⭐⭐⭐ |
| **agent_actions** | 205/24h | ✅ Production | Agent Operations | 1h | ⭐⭐⭐ |
| **pattern_lineage_nodes** | 1,033 | ✅ Production | Pattern Learning | 2h | ⭐⭐⭐ |
| **pattern_lineage_events** | 30 MB | ✅ Production | Pattern Learning | 3h | ⭐⭐ |
| **document_metadata** | 33 docs | ✅ Production | Code Intelligence | 3h | ⭐⭐ |
| **task_completion_metrics** | 1 | ⚠️ Low volume | Developer Experience | 2h | ⭐⭐ |
| **metadata_stamps** | 1 | ⚠️ Low volume | Code Intelligence | 2h | ⭐⭐ |
| **workflow_state** | 536 KB | ⚠️ Unknown | Agent Operations | 6h | ⭐ |
| **node_registrations** | 264 KB | ⚠️ Unknown | Platform Health | 2h | ⭐⭐ |
| **agent_execution_logs** | 0/24h | ❌ No data | Agent Operations | 4h | ⭐ |
| **document_freshness** | 0 | ❌ No data | Platform Health | 2h* | ⭐⭐ |
| **pattern_quality_metrics** | 0 | ❌ No data | Intelligence Ops | 3h* | ⭐⭐ |
| **pattern_pr_intelligence** | 0 | ❌ No data | Pattern Learning | 4h* | ⭐⭐ |

*Effort assumes data becomes available

## Quick Win Implementations (Total: ~12h)

### 1. Routing Strategy Breakdown (1h) ⭐⭐⭐
**Dashboard**: Agent Operations
**Endpoint**: `/api/intelligence/routing/strategies`
**Data**: `agent_routing_decisions.routing_strategy`
**Widget**: Pie chart showing trigger (54%), AI (43%), explicit (3%)

```typescript
// Sample query
SELECT routing_strategy, COUNT(*) as count
FROM agent_routing_decisions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY routing_strategy
```

### 2. Task Completion Velocity (2h) ⭐⭐
**Dashboard**: Developer Experience
**Endpoint**: `/api/intelligence/tasks/velocity`
**Data**: `task_completion_metrics`
**Widget**: Line chart showing task completion rate over time

```typescript
// Sample endpoint
GET /api/intelligence/tasks/velocity?timeWindow=7d
```

### 3. ONEX Stamp Coverage (2h) ⭐⭐
**Dashboard**: Code Intelligence
**Endpoint**: `/api/intelligence/stamps/coverage`
**Data**: `metadata_stamps`
**Widget**: Metric card showing "1 / 1,033 files stamped (0.1%)"

```typescript
// Sample query
SELECT
  COUNT(DISTINCT ms.file_path) as stamped_files,
  (SELECT COUNT(*) FROM pattern_lineage_nodes) as total_files
FROM metadata_stamps ms
```

### 4. Document Access Ranking (3h) ⭐⭐
**Dashboard**: Code Intelligence
**Endpoint**: `/api/intelligence/documents/popular`
**Data**: `document_metadata.access_count`
**Widget**: Table showing top 10 most accessed documents

```typescript
// Sample query
SELECT file_path, access_count, last_accessed_at
FROM document_metadata
WHERE status = 'active'
ORDER BY access_count DESC
LIMIT 10
```

### 5. Node Service Registry (2h) ⭐⭐
**Dashboard**: Platform Health
**Endpoint**: `/api/intelligence/nodes/health`
**Data**: `node_registrations`
**Widget**: Service status grid with health indicators

```typescript
// Sample query
SELECT node_id, node_type, health_status, last_heartbeat
FROM node_registrations
ORDER BY last_heartbeat DESC
```

### 6. Pattern Language Breakdown (2h) ⭐⭐⭐
**Dashboard**: Pattern Learning
**Endpoint**: `/api/intelligence/patterns/by-language`
**Data**: `pattern_lineage_nodes.language`
**Widget**: Bar chart showing Python (1,033), etc.

```typescript
// Sample query
SELECT language, pattern_type, COUNT(*) as count
FROM pattern_lineage_nodes
GROUP BY language, pattern_type
ORDER BY count DESC
```

## Medium Complexity Integrations (Total: ~18h)

### 7. Agent Execution Quality (4h) ⭐
**Dashboard**: Agent Operations
**Data**: `agent_execution_logs` (awaiting data)
**Requires**: Join with `agent_routing_decisions` on `correlation_id`

### 8. Document Dependency Graph (5h) ⭐
**Dashboard**: Knowledge Graph
**Data**: `document_dependencies` + `document_metadata`
**Visualization**: Force-directed graph using D3.js

### 9. Workflow State Viewer (6h) ⭐
**Dashboard**: Agent Operations
**Data**: `workflow_state` + `workflow_projection`
**Requires**: Understanding workflow state schema

### 10. Pattern Discovery Timeline (3h) ⭐⭐
**Dashboard**: Pattern Learning
**Data**: `pattern_lineage_events` (30 MB)
**Visualization**: Timeline showing pattern evolution

## API Endpoint Structure

### Recommended URL Pattern

```
/api/intelligence/{domain}/{resource}[/{id}][/{action}]

Examples:
GET  /api/intelligence/routing/strategies
GET  /api/intelligence/tasks/velocity?timeWindow=7d
GET  /api/intelligence/stamps/coverage
GET  /api/intelligence/documents/popular
GET  /api/intelligence/nodes/health
GET  /api/intelligence/patterns/by-language
POST /api/intelligence/workflows/{id}/cancel
```

### Response Format (Consistent Structure)

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  metadata?: {
    total?: number;
    page?: number;
    limit?: number;
    cached?: boolean;
    queryTimeMs?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
```

## Dashboard Mapping

### Agent Operations (6 new integrations)
1. Routing strategy breakdown (pie chart)
2. Top agents by confidence (table)
3. Agent execution quality trends (line chart) - awaiting data
4. Workflow state viewer (custom widget) - medium complexity
5. Agent transformation flow (Sankey) - already done
6. Recent agent actions (timeline) - already done

### Pattern Learning (3 new integrations)
1. Language/type breakdown (stacked bar)
2. Pattern discovery timeline (timeline) - medium complexity
3. PR mention tracking (table) - awaiting data

### Code Intelligence (3 new integrations)
1. ONEX stamp coverage (metric card)
2. Document access ranking (table)
3. Quality gate results (table) - awaiting data

### Platform Health (3 new integrations)
1. Node service registry (status grid)
2. Document freshness alerts (alert banner) - awaiting data
3. Kafka publish metrics (metric cards)

### Developer Experience (2 new integrations)
1. Task completion velocity (line chart)
2. Workflow completion rates (metric cards) - medium complexity

## Implementation Checklist

### Before Starting Integration

- [ ] Read data source schema (`\d table_name`)
- [ ] Check current data volume (`SELECT COUNT(*)`)
- [ ] Test sample query in psql
- [ ] Design API response structure
- [ ] Sketch widget mockup

### Implementation Steps

1. **Backend** (30 min)
   - [ ] Add route to `server/intelligence-routes.ts`
   - [ ] Write SQL query using Drizzle ORM
   - [ ] Add response type to TypeScript
   - [ ] Test endpoint with curl

2. **Frontend** (1-2h)
   - [ ] Add API query hook using TanStack Query
   - [ ] Create widget component
   - [ ] Add to dashboard layout
   - [ ] Style with Tailwind + shadcn/ui

3. **Testing** (30 min)
   - [ ] Verify data loads correctly
   - [ ] Test loading states
   - [ ] Test error states
   - [ ] Test responsive design

### Code Patterns to Follow

**Backend Route Example**:
```typescript
intelligenceRouter.get('/routing/strategies', async (req, res) => {
  try {
    const timeWindow = (req.query.timeWindow as string) || '24h';

    const strategies = await intelligenceDb
      .select({
        strategy: agentRoutingDecisions.routingStrategy,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(agentRoutingDecisions)
      .where(sql`created_at > NOW() - INTERVAL '${sql.raw(timeWindow)}'`)
      .groupBy(agentRoutingDecisions.routingStrategy);

    res.json({ success: true, data: strategies });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});
```

**Frontend Hook Example**:
```typescript
export function useRoutingStrategies(timeWindow: string = '24h') {
  return useQuery({
    queryKey: ['routing-strategies', timeWindow],
    queryFn: async () => {
      const res = await fetch(
        `/api/intelligence/routing/strategies?timeWindow=${timeWindow}`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}
```

## Testing Queries

### Verify Data Exists
```bash
# Check routing strategies
PGPASSWORD='omninode_remote_2024_secure' psql -h 192.168.86.200 -p 5436 \
  -U postgres -d omninode_bridge \
  -c "SELECT routing_strategy, COUNT(*) FROM agent_routing_decisions \
      WHERE created_at > NOW() - INTERVAL '24 hours' \
      GROUP BY routing_strategy"

# Check pattern languages
PGPASSWORD='omninode_remote_2024_secure' psql -h 192.168.86.200 -p 5436 \
  -U postgres -d omninode_bridge \
  -c "SELECT language, COUNT(*) FROM pattern_lineage_nodes \
      GROUP BY language ORDER BY count DESC"

# Check document access
PGPASSWORD='omninode_remote_2024_secure' psql -h 192.168.86.200 -p 5436 \
  -U postgres -d omninode_bridge \
  -c "SELECT repository, COUNT(*) FROM document_metadata \
      GROUP BY repository"
```

### Test Endpoints
```bash
# Agent routing strategies
curl http://localhost:3000/api/intelligence/routing/strategies

# Pattern summary
curl http://localhost:3000/api/intelligence/patterns/summary

# Agent metrics
curl http://localhost:3000/api/intelligence/agents/summary
```

## Next Steps

1. **Week 1**: Implement 6 quick wins (12h total)
   - Routing strategy breakdown
   - Task completion velocity
   - ONEX stamp coverage
   - Document access ranking
   - Node service registry
   - Pattern language breakdown

2. **Week 2**: Implement 3 medium complexity features (15h total)
   - Document dependency graph
   - Workflow state viewer
   - Pattern discovery timeline

3. **Ongoing**: Monitor for new data in empty tables
   - `document_freshness` - high value when populated
   - `pattern_quality_metrics` - essential for quality tracking
   - `pattern_pr_intelligence` - great for adoption metrics
   - `agent_execution_logs` - needed for quality analysis

## Resources

- **Main Report**: `RESEARCH_NEW_DATA_SOURCES.md` (full investigation details)
- **Database Schema**: `shared/intelligence-schema.ts`
- **API Routes**: `server/intelligence-routes.ts`
- **Dashboard Components**: `client/src/pages/*.tsx`
- **Database Connection**: `server/storage.ts`

## Contact for Questions

- Database schema questions: Check `\d table_name` in psql
- API design questions: Follow existing patterns in `intelligence-routes.ts`
- Frontend component questions: Use shadcn/ui components from `client/src/components/ui/`
