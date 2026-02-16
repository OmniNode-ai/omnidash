# Quality Trends Endpoint Integration

## Overview

The `/api/intelligence/patterns/quality-trends` endpoint has been updated to integrate with the OmniIntelligence Intelligence Service while maintaining robust fallback to the local database.

## Implementation Details

### Endpoint: `GET /api/intelligence/patterns/quality-trends`

**Query Parameters:**

- `timeWindow` (optional): Time window for trends - `24h`, `7d`, or `30d` (default: `7d`)

**Response Format:**

```typescript
Array<{
  period: string; // ISO timestamp (e.g., "2025-10-27 18:00:00+00")
  avgQuality: number; // Quality score 0-1 (e.g., 0.85)
  manifestCount: number; // Number of manifests in this period
}>;
```

### Architecture

The endpoint implements a **resilient proxy pattern** with the following flow:

```
1. Parse timeWindow query parameter
2. Try OmniIntelligence Intelligence Service (5 second timeout)
   └─ Success + has time-series data → Transform and return
   └─ No data or error → Continue to fallback
3. Query local database (agent_manifest_injections table)
4. Return database results
```

### Key Features

#### 1. Graceful Degradation

- **Primary**: Attempts to fetch from OmniIntelligence (`INTELLIGENCE_SERVICE_URL`)
- **Fallback**: Uses local database query if OmniIntelligence unavailable or lacks data
- **Timeout**: 5-second timeout prevents blocking on slow responses
- **Logging**: Clear indicators of which data source is being used

#### 2. Data Transformation

- Converts time windows (`24h`, `7d`, `30d`) to hours for OmniIntelligence API
- Transforms OmniIntelligence response to match frontend expectations
- Maintains consistent response format regardless of data source

#### 3. Error Handling

- Network failures don't break the endpoint
- Missing OmniIntelligence service gracefully falls back
- Database errors are caught and reported properly

### Current State

**Status:** ✅ Fully operational with database fallback

**OmniIntelligence API Limitation:**
The OmniIntelligence `/api/quality-trends/project/{project_id}/trend` endpoint currently returns aggregate statistics (average quality, trend slope, snapshot count) but NOT time-series data grouped by time periods.

**Frontend Requirements:**
The PatternLearning dashboard needs time-series data with timestamps to display quality trends over time in a chart.

**Resolution:**
The implementation correctly detects this data format mismatch and falls back to the database, which provides the required time-series format. When OmniIntelligence adds a project-wide time-series endpoint (e.g., `/project/{project_id}/history`), the transformation logic can be updated to use it.

## Configuration

### Environment Variables

```bash
# OmniIntelligence Intelligence Service URL (configured in .env)
INTELLIGENCE_SERVICE_URL=http://localhost:8053
```

The endpoint uses `process.env.INTELLIGENCE_SERVICE_URL` or defaults to `http://localhost:8053`.

## Testing

### Test Commands

```bash
# Test 24-hour window
curl "http://localhost:3000/api/intelligence/patterns/quality-trends?timeWindow=24h"

# Test 7-day window (default)
curl "http://localhost:3000/api/intelligence/patterns/quality-trends?timeWindow=7d"

# Test 30-day window
curl "http://localhost:3000/api/intelligence/patterns/quality-trends?timeWindow=30d"
```

### Expected Behavior

1. **With OmniIntelligence Running:**
   - Server logs show: `⚠ OmniIntelligence has no data yet, falling back to database`
   - Returns database results
   - Response time: ~90-110ms

2. **Without OmniIntelligence:**
   - Server logs show: `⚠ Failed to fetch from OmniIntelligence, falling back to database`
   - Returns database results
   - Response time: ~90-110ms (no significant overhead)

3. **With OmniIntelligence Time-Series Data (future):**
   - Server logs show: `✓ Using real data from OmniIntelligence (N snapshots)`
   - Returns OmniIntelligence results
   - Response time depends on OmniIntelligence service

## Log Messages

The endpoint provides clear logging to track behavior:

| Log Message                                                    | Meaning                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `✓ Using real data from OmniIntelligence (N snapshots)`              | Successfully fetched time-series data from OmniIntelligence          |
| `⚠ OmniIntelligence has no data yet, falling back to database`      | OmniIntelligence responded but doesn't have the required data format |
| `⚠ OmniIntelligence returned 500, falling back to database`         | OmniIntelligence service error                                       |
| `⚠ Failed to fetch from OmniIntelligence, falling back to database` | Network error or timeout                                       |
| `→ Fetching quality trends from database`                      | Using database fallback                                        |

## Implementation Code

**File:** `server/intelligence-routes.ts` (lines 467-555)

**Key Components:**

1. **Time window parsing** - Converts `24h`/`7d`/`30d` to hours for OmniIntelligence
2. **OmniIntelligence request** - Native `fetch()` with 5-second timeout
3. **Data format validation** - Checks for `snapshots` array in response
4. **Database fallback** - Original query using Drizzle ORM
5. **Error handling** - Try-catch blocks at both levels

## Future Enhancements

### When OmniIntelligence Adds Time-Series Support

Once OmniIntelligence implements a project-wide time-series endpoint, update the transformation logic:

```typescript
// Expected future OmniIntelligence response format
interface IntelligenceTimeSeriesResponse {
  success: true;
  project_id: string;
  snapshots: Array<{
    timestamp: string; // ISO timestamp
    overall_quality: number; // 0-1 score
    file_count: number; // Files analyzed
    // ... other quality metrics
  }>;
}

// Transform to frontend format
const formattedTrends = intelligenceData.snapshots.map((snapshot) => ({
  period: snapshot.timestamp,
  avgQuality: snapshot.overall_quality,
  manifestCount: snapshot.file_count,
}));
```

### Potential Optimizations

1. **Caching** - Cache OmniIntelligence responses for 30-60 seconds to reduce load
2. **Parallel Queries** - Query both sources in parallel and prefer OmniIntelligence if available
3. **Metrics** - Track OmniIntelligence hit rate and response times
4. **Feature Flag** - Add `ENABLE_INTELLIGENCE_QUALITY_TRENDS` to disable integration if needed

## Success Criteria

✅ **Completed:**

- [x] Endpoint proxies to OmniIntelligence intelligence service
- [x] Graceful fallback to database when OmniIntelligence unavailable
- [x] Response format matches frontend expectations
- [x] Error handling for network failures
- [x] Clear logging for debugging
- [x] No TypeScript errors
- [x] Frontend continues to work with existing data
- [x] 5-second timeout prevents blocking

## Related Files

- `server/intelligence-routes.ts` - Endpoint implementation
- `client/src/pages/PatternLearning.tsx` - Frontend consumer (lines 70-73)
- `.env` - Configuration (`INTELLIGENCE_SERVICE_URL`)
- `shared/intelligence-schema.ts` - Database schema

## Verification

```bash
# 1. Start development server
npm run dev

# 2. Test endpoint
curl "http://localhost:3000/api/intelligence/patterns/quality-trends?timeWindow=24h" | jq '.'

# 3. Check server logs for fallback messages
# Look for: "⚠ OmniIntelligence has no data yet, falling back to database"

# 4. Verify frontend displays data
# Open: http://localhost:3000/patterns
# Check: "Average Quality Score" chart displays data

# 5. Run type checking
npm run check
```

## Support

For issues or questions:

1. Check server logs for detailed error messages
2. Verify `INTELLIGENCE_SERVICE_URL` is set correctly
3. Ensure OmniIntelligence service is accessible: `curl http://localhost:8053/health`
4. Review this documentation for expected behavior
