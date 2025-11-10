# Agent Registry Mock Data Implementation

## Summary

Added comprehensive mock data support for the Agent Registry screen's "Recent Agent Activity" section.

## Changes Made

### 1. Created Mock Data Generator
**File**: `client/src/lib/mock-data/agent-registry-mock.ts`

- **New TypeScript interface**: `RecentActivity` with all required fields
- **Mock data class**: `AgentRegistryMockData` with multiple generation methods
- **Features**:
  - Generates 20 realistic recent agent activities by default
  - Uses 15 different agent names from across the system
  - Includes various action types: tool_call, decision, execution, error, success
  - Realistic action names: Read, Write, Edit, Bash, Grep, Glob, Route Selection, etc.
  - Dynamic descriptions based on action type and target
  - Realistic file paths and command targets
  - Weighted status distribution (75% success, 10% warning, 10% error, 5% in_progress)
  - Realistic duration values (50-5000ms depending on action type)
  - Timestamps within last 24 hours
  - Correlation IDs and action details
  - 20% of actions in debug mode

### 2. Updated Mock Data Index
**File**: `client/src/lib/mock-data/index.ts`

- Added export for `AgentRegistryMockData`
- Maintains consistency with existing mock data pattern

### 3. Enhanced Data Source
**File**: `client/src/lib/data-sources/agent-registry-source.ts`

- Added import for mock data: `USE_MOCK_DATA` and `AgentRegistryMockData`
- Exported `RecentActivity` type for component use
- **New method**: `fetchRecentActivity(limit: number = 20)`
  - Checks `USE_MOCK_DATA` flag (from `VITE_USE_MOCK_DATA` env var)
  - Returns mock data when flag is true
  - Falls back to API endpoint `/api/intelligence/actions/recent` when flag is false
  - Gracefully falls back to mock data if API fails
  - Returns both data and `isMock` flag for debugging

### 4. Updated Component
**File**: `client/src/pages/preview/AgentRegistry.tsx`

- Changed from direct API fetch to using data source method
- Updated query to use `agentRegistrySource.fetchRecentActivity(20)`
- Extracts data from response object: `recentActionsData?.data || []`
- Maintains existing UI behavior and interactivity
- Displays up to 20 recent activities (increased from 5)

## Data Structure

```typescript
interface RecentActivity {
  id: string;                    // UUID
  correlationId: string;         // UUID for tracing
  agentName: string;             // e.g., "agent-api", "agent-frontend"
  actionType: string;            // "tool_call", "decision", "execution", etc.
  actionName: string;            // "Read", "Edit", "Route Selection", etc.
  description: string;           // Human-readable description
  status: 'success' | 'error' | 'warning' | 'in_progress';
  timestamp: string;             // ISO timestamp
  createdAt: string;             // ISO timestamp
  duration: number;              // Duration in milliseconds
  durationMs: number;            // Same as duration
  target?: string;               // File path, command, or pattern
  actionDetails?: any;           // Additional action metadata
  debugMode?: boolean;           // Debug flag
}
```

## Mock Data Features

### Agent Names (15 total)
- agent-api
- agent-frontend
- agent-database
- agent-test-intelligence
- agent-code-review
- agent-polymorphic
- agent-architecture
- agent-security
- agent-performance
- agent-documentation
- agent-refactor
- agent-qa
- agent-deploy
- agent-analytics
- agent-integration

### Action Types & Names
- **tool_call**: Read, Write, Edit, Bash, Grep, Glob
- **decision**: Route Selection, Strategy Choice, Validation, Approval
- **execution**: Code Generation, Test Execution, Deployment, Analysis
- **error**: Timeout, Parse Error, Connection Failed, Invalid Input
- **success**: Task Complete, Validation Passed, Tests Passed, Deploy Success

### Status Distribution
- 75% Success
- 10% Warning
- 10% Error
- 5% In Progress

### Timestamps
- All within last 24 hours
- Sorted by most recent first

## Environment Configuration

**Enable Mock Data**:
```bash
# In .env file
VITE_USE_MOCK_DATA=true
```

**Use Real API**:
```bash
# In .env file
VITE_USE_MOCK_DATA=false
```

## Testing

1. **With Mock Data** (current setup):
   - Set `VITE_USE_MOCK_DATA=true` in `.env`
   - Run `PORT=3000 npm run dev`
   - Navigate to Agent Registry: http://localhost:3000/agents
   - Scroll to "Recent Agent Activity" section
   - Should see 20 realistic mock activities

2. **With Real API**:
   - Set `VITE_USE_MOCK_DATA=false` in `.env`
   - Ensure backend services are running
   - Run `PORT=3000 npm run dev`
   - Navigate to Agent Registry
   - Should fetch real data from `/api/intelligence/actions/recent`

## UI Behavior

- Each activity item is clickable (uses `clickable-row` pattern)
- Clicking opens `AgentExecutionTraceModal` with full execution trace
- Shows: agent name, action type, action name, duration, timestamp
- Activities auto-refresh every 10 seconds
- Displays "No recent activity available" when empty

## Success Criteria Met

✅ Recent activity section shows 10-20 recent agent actions
✅ Data is realistic and varied
✅ Includes multiple agents and action types
✅ Timestamps are recent (last 24 hours)
✅ Status badges are color-coded
✅ Items are clickable with detail view
✅ Uses existing mock data system (VITE_USE_MOCK_DATA flag)
✅ Graceful fallback if API fails
✅ Consistent with existing mock data patterns

## Files Modified

- ✅ `client/src/lib/mock-data/agent-registry-mock.ts` (NEW - 223 lines)
- ✅ `client/src/lib/mock-data/index.ts` (added export)
- ✅ `client/src/lib/data-sources/agent-registry-source.ts` (added method)
- ✅ `client/src/pages/preview/AgentRegistry.tsx` (updated component)

## Additional Features

The mock data generator provides additional utility methods:

1. **Generate single activity**: `generateSingleActivity()`
2. **Filter by agent**: `generateActivitiesForAgent(agentName, count)`
3. **Filter by status**: `generateActivitiesByStatus(status, count)`

These can be used for future enhancements or testing scenarios.

## Next Steps

1. **Backend Integration**: When ready to use real data, set `VITE_USE_MOCK_DATA=false`
2. **Real-time Updates**: Consider adding WebSocket support for live activity updates
3. **Filtering**: Add UI controls to filter by agent, status, or action type
4. **Pagination**: Add pagination if activity count grows beyond 20
5. **Search**: Add search capability for activity descriptions

## Notes

- Mock data generation uses weighted random distributions for realistic variance
- File paths use existing `MockDataGenerator.filePath()` utility
- Agent names align with actual agents in the system
- Action descriptions are contextual based on action type
- Duration values are realistic for each action type
- Debug mode flag is set for 20% of activities
