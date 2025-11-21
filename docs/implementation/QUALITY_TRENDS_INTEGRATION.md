# Quality Trends Endpoint Integration

## Overview

The `/api/intelligence/patterns/quality-trends` endpoint has been updated to integrate with the Omniarchon Intelligence Service while maintaining robust fallback to the local database.

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
2. Try Omniarchon Intelligence Service (5 second timeout)
   └─ Success + has time-series data → Transform and return
   └─ No data or error → Continue to fallback
3. Query local database (agent_manifest_injections table)
4. Return database results
```

### Key Features

#### 1. Graceful Degradation

- **Primary**: Attempts to fetch from Omniarchon (`INTELLIGENCE_SERVICE_URL`)
- **Fallback**: Uses local database query if Omniarchon unavailable or lacks data
- **Timeout**: 5-second timeout prevents blocking on slow responses
- **Logging**: Clear indicators of which data source is being used

#### 2. Data Transformation

- Converts time windows (`24h`, `7d`, `30d`) to hours for Omniarchon API
- Transforms Omniarchon response to match frontend expectations
- Maintains consistent response format regardless of data source

#### 3. Error Handling

- Network failures don't break the endpoint
- Missing Omniarchon service gracefully falls back
- Database errors are caught and reported properly

### Current State

**Status:** ✅ Fully operational with database fallback

**Omniarchon API Limitation:**
The Omniarchon `/api/quality-trends/project/{project_id}/trend` endpoint currently returns aggregate statistics (average quality, trend slope, snapshot count) but NOT time-series data grouped by time periods.

**Frontend Requirements:**
The PatternLearning dashboard needs time-series data with timestamps to display quality trends over time in a chart.

**Resolution:**
The implementation correctly detects this data format mismatch and falls back to the database, which provides the required time-series format. When Omniarchon adds a project-wide time-series endpoint (e.g., `/project/{project_id}/history`), the transformation logic can be updated to use it.

## Configuration

### Environment Variables

```bash
# Omniarchon Intelligence Service URL (configured in .env)
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

1. **With Omniarchon Running:**
   - Server logs show: `⚠ Omniarchon has no data yet, falling back to database`
   - Returns database results
   - Response time: ~90-110ms

2. **Without Omniarchon:**
   - Server logs show: `⚠ Failed to fetch from Omniarchon, falling back to database`
   - Returns database results
   - Response time: ~90-110ms (no significant overhead)

3. **With Omniarchon Time-Series Data (future):**
   - Server logs show: `✓ Using real data from Omniarchon (N snapshots)`
   - Returns Omniarchon results
   - Response time depends on Omniarchon service

## Log Messages

The endpoint provides clear logging to track behavior:

| Log Message                                                    | Meaning                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `✓ Using real data from Omniarchon (N snapshots)`              | Successfully fetched time-series data from Omniarchon          |
| `⚠ Omniarchon has no data yet, falling back to database`      | Omniarchon responded but doesn't have the required data format |
| `⚠ Omniarchon returned 500, falling back to database`         | Omniarchon service error                                       |
| `⚠ Failed to fetch from Omniarchon, falling back to database` | Network error or timeout                                       |
| `→ Fetching quality trends from database`                      | Using database fallback                                        |

## Implementation Code

**File:** `server/intelligence-routes.ts` (lines 467-555)

**Key Components:**

1. **Time window parsing** - Converts `24h`/`7d`/`30d` to hours for Omniarchon
2. **Omniarchon request** - Native `fetch()` with 5-second timeout
3. **Data format validation** - Checks for `snapshots` array in response
4. **Database fallback** - Original query using Drizzle ORM
5. **Error handling** - Try-catch blocks at both levels

## Future Enhancements

### When Omniarchon Adds Time-Series Support

Once Omniarchon implements a project-wide time-series endpoint, update the transformation logic:

```typescript
// Expected future Omniarchon response format
interface OmniarchonTimeSeriesResponse {
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
const formattedTrends = omniarchonData.snapshots.map((snapshot) => ({
  period: snapshot.timestamp,
  avgQuality: snapshot.overall_quality,
  manifestCount: snapshot.file_count,
}));
```

### Potential Optimizations

1. **Caching** - Cache Omniarchon responses for 30-60 seconds to reduce load
2. **Parallel Queries** - Query both sources in parallel and prefer Omniarchon if available
3. **Metrics** - Track Omniarchon hit rate and response times
4. **Feature Flag** - Add `ENABLE_OMNIARCHON_QUALITY_TRENDS` to disable integration if needed

## Success Criteria

✅ **Completed:**

- [x] Endpoint proxies to Omniarchon intelligence service
- [x] Graceful fallback to database when Omniarchon unavailable
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
# Look for: "⚠ Omniarchon has no data yet, falling back to database"

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
3. Ensure Omniarchon service is accessible: `curl http://localhost:8053/health`
4. Review this documentation for expected behavior
