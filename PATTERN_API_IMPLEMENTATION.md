# Pattern Discovery API Implementation

**Date**: 2025-10-27
**Correlation ID**: 28d384dc-a9ee-4ce4-9b22-a979b73a7fe3
**Status**: ✅ Complete

## Summary

Successfully implemented 4 Pattern Discovery API endpoints for the Pattern Learning Dashboard. These endpoints query the PostgreSQL intelligence database (`agent_manifest_injections` table) to provide real-time pattern discovery metrics.

## Implementation Details

### 1. Database Schema Added

**File**: `shared/intelligence-schema.ts`

Added `agentManifestInjections` table schema with Drizzle ORM:

```typescript
export const agentManifestInjections = pgTable('agent_manifest_injections', {
  id: uuid('id').primaryKey().defaultRandom(),
  correlationId: uuid('correlation_id').notNull(),
  agentName: text('agent_name').notNull(),
  patternsCount: integer('patterns_count').default(0),
  debugIntelligenceSuccesses: integer('debug_intelligence_successes').default(0),
  totalQueryTimeMs: integer('total_query_time_ms').notNull(),
  queryTimes: jsonb('query_times').notNull(),
  generationSource: text('generation_source').notNull(),
  isFallback: boolean('is_fallback').default(false),
  agentQualityScore: numeric('agent_quality_score', { precision: 5, scale: 4 }),
  createdAt: timestamp('created_at').defaultNow(),
  // ... additional fields
});
```

### 2. API Endpoints Created

**File**: `server/intelligence-routes.ts`

#### Endpoint 1: Pattern Summary
```
GET /api/intelligence/patterns/summary
```

**Response**:
```json
{
  "totalPatterns": 25000,
  "newPatternsToday": 150,
  "avgQualityScore": 0.87,
  "activeLearningCount": 42
}
```

**Implementation**: Aggregates pattern counts, quality scores, and active learning metrics from all manifest injections.

#### Endpoint 2: Pattern Trends
```
GET /api/intelligence/patterns/trends?timeWindow=7d
```

**Query Parameters**:
- `timeWindow`: "24h" (hourly), "7d" (daily), "30d" (daily)

**Response**:
```json
[
  {
    "period": "2025-10-27T00:00:00Z",
    "manifestsGenerated": 42,
    "avgPatternsPerManifest": 18.5,
    "avgQueryTimeMs": 450
  }
]
```

**Implementation**: Time-series data showing pattern discovery rate over time with configurable granularity (hourly/daily).

#### Endpoint 3: Pattern List
```
GET /api/intelligence/patterns/list?limit=50&offset=0
```

**Query Parameters**:
- `limit`: number of patterns (default: 50, max: 200)
- `offset`: pagination offset (default: 0)
- `category`: filter by category (optional)

**Response**:
```json
[
  {
    "id": "uuid",
    "name": "agent-api-architect",
    "description": "qdrant pattern (18.5 patterns/manifest)",
    "quality": 0.92,
    "usage": 45,
    "trend": "up",
    "category": "qdrant"
  }
]
```

**Implementation**: Lists patterns grouped by agent with usage statistics and trend analysis (up/down/stable based on 7-day vs 14-day comparison).

#### Endpoint 4: Pattern Performance
```
GET /api/intelligence/patterns/performance
```

**Response**:
```json
[
  {
    "generationSource": "qdrant",
    "totalManifests": 150,
    "avgTotalMs": 450.5,
    "avgPatterns": 18.2,
    "fallbackCount": 5,
    "avgPatternQueryMs": 200.3,
    "avgInfraQueryMs": 150.2
  }
]
```

**Implementation**: Performance breakdown by generation source showing query times and fallback rates.

### 3. TypeScript Interfaces

Added type definitions for all responses:

```typescript
interface PatternSummary { /* ... */ }
interface PatternTrend { /* ... */ }
interface PatternListItem { /* ... */ }
interface PatternPerformance { /* ... */ }
```

### 4. Error Handling

All endpoints include comprehensive error handling:
- Try-catch blocks around database queries
- Proper HTTP status codes (200 for success, 500 for errors)
- Detailed error messages with stack traces in development
- Graceful handling of null/undefined values

## Testing

### Prerequisites

1. **Environment Variables** (`.env` file):
```bash
# IMPORTANT: Get actual values from ~/.claude/CLAUDE.md or shared .env file
# NEVER commit passwords to git!
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}"
POSTGRES_HOST=<check_shared_env>
POSTGRES_PORT=<check_shared_env>
POSTGRES_DATABASE=omninode_bridge
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<get_from_shared_env>
```

2. **Network Access**: Server must be able to connect to `${POSTGRES_HOST}:${POSTGRES_PORT}` (verify values in `.env`)

3. **Database Table**: `agent_manifest_injections` table must exist with data

### Manual Testing

Start the server:
```bash
npm run dev
```

Test endpoints with curl:

```bash
# 1. Pattern Summary
curl http://localhost:3000/api/intelligence/patterns/summary | jq

# 2. Pattern Trends (last 7 days)
curl http://localhost:3000/api/intelligence/patterns/trends?timeWindow=7d | jq

# 3. Pattern List
curl http://localhost:3000/api/intelligence/patterns/list?limit=10 | jq

# 4. Pattern Performance
curl http://localhost:3000/api/intelligence/patterns/performance | jq
```

### Expected Behavior

**If database has data**:
- Endpoints return JSON with aggregated metrics
- Trends show time-series data
- List shows patterns with usage statistics
- Performance shows query breakdown by source

**If database is empty**:
- Endpoints return zero values or empty arrays
- No errors should occur

**If database is unreachable**:
- 500 status code with error message
- Error logged to console

## Database Connection

The endpoints use the existing `intelligenceDb` connection from `server/storage.ts`:

```typescript
import { intelligenceDb } from './storage';
```

This connection is configured to point to the intelligence infrastructure database at 192.168.86.200:5436.

## SQL Queries

All queries are implemented using Drizzle ORM with proper typing:

```typescript
// Example: Pattern summary query
const [summaryResult] = await intelligenceDb
  .select({
    totalPatterns: sql<number>`SUM(${agentManifestInjections.patternsCount})::int`,
    avgQualityScore: sql<number>`AVG(${agentManifestInjections.agentQualityScore})::numeric`,
  })
  .from(agentManifestInjections);
```

## Integration with Dashboard

The PatternLearning.tsx dashboard component can now replace mock data with real API calls:

```typescript
import { useQuery } from '@tanstack/react-query';

const { data: summary } = useQuery({
  queryKey: ['pattern-summary'],
  queryFn: async () => {
    const res = await fetch('/api/intelligence/patterns/summary');
    return res.json();
  },
  refetchInterval: 30000, // Refresh every 30 seconds
});

const { data: trends } = useQuery({
  queryKey: ['pattern-trends', '7d'],
  queryFn: async () => {
    const res = await fetch('/api/intelligence/patterns/trends?timeWindow=7d');
    return res.json();
  },
  refetchInterval: 60000, // Refresh every minute
});
```

## Performance Considerations

### Query Optimization

1. **Aggregations**: All queries use efficient SQL aggregations (`COUNT`, `AVG`, `SUM`)
2. **Time Windows**: Queries are limited to relevant time ranges (24h, 7d, 30d)
3. **Pagination**: List endpoint supports pagination with configurable limits
4. **Indexing Recommendation**: Add indexes on:
   - `created_at` (for time-based queries)
   - `agent_name` (for filtering)
   - `generation_source` (for grouping)

### Caching Strategy

For production, consider adding:
1. **Redis Caching**: Cache aggregated results for 1-5 minutes
2. **Response Headers**: Add Cache-Control headers
3. **Query Result Caching**: Drizzle supports query result caching

## Success Criteria

✅ **All 4 endpoints implemented**
- `/patterns/summary` - Pattern metrics
- `/patterns/trends` - Time-series data
- `/patterns/list` - Pattern listing with pagination
- `/patterns/performance` - Performance breakdown

✅ **TypeScript interfaces defined** for all response types

✅ **Error handling** with try-catch and proper status codes

✅ **TypeScript compiles** without errors (`npm run check` passes)

✅ **Real PostgreSQL data** queried via Drizzle ORM

✅ **Documentation** complete with examples and testing instructions

## Next Steps

### Phase 1: Dashboard Integration (Recommended Next)
1. Update `client/src/pages/PatternLearning.tsx` to use real API endpoints
2. Replace mock data with `useQuery` hooks
3. Add loading and error states
4. Test with real data

### Phase 2: Real-Time Updates (Optional)
1. Add WebSocket support for live pattern discovery events
2. Subscribe to Kafka `agent-manifest-injections` topic
3. Broadcast events to connected clients
4. Update dashboard in real-time

### Phase 3: Advanced Features (Future)
1. Add Qdrant integration for pattern similarity search
2. Implement pattern relationship graph visualization
3. Add pattern quality improvement recommendations
4. Create pattern export functionality

## References

- **Integration Guide**: `INTELLIGENCE_INTEGRATION.md` (lines 300-400)
- **Database Schema**: `shared/intelligence-schema.ts`
- **API Routes**: `server/intelligence-routes.ts`
- **Database Connection**: `server/storage.ts`
- **Correlation ID**: 28d384dc-a9ee-4ce4-9b22-a979b73a7fe3
