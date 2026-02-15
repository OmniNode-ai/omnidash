# Data Sources Unit Tests

This directory contains comprehensive unit tests for all data source modules.

## Test Coverage

### Tested Data Sources

1. **agent-management-source.test.ts** - Tests for agent management data fetching and aggregation
   - `fetchSummary` - Weighted average calculations, API fallbacks
   - `fetchRoutingStats` - Routing statistics transformation
   - `fetchRecentExecutions` - Execution data transformation
   - `fetchAll` - Combined data source orchestration

2. **intelligence-analytics-source.test.ts** - Tests for intelligence analytics metrics
   - `fetchMetrics` - Weighted success rate and response time calculations
   - `fetchRecentActivity` - Activity transformation
   - `fetchAgentPerformance` - Agent performance metrics
   - `fetchSavingsMetrics` - Savings calculations

3. **code-intelligence-source.test.ts** - Tests for code intelligence data
   - `fetchCodeAnalysis` - Code analysis from OmniIntelligence
   - `fetchCompliance` - ONEX compliance data
   - `fetchPatternSummary` - Pattern discovery summaries
   - `fetchAll` - Combined code intelligence data

4. **agent-operations-source.test.ts** - Tests for agent operations monitoring
   - `fetchSummary` - Weighted averages
   - `fetchRecentActions` - Action data transformation
   - `fetchHealth` - Health status monitoring
   - `transformOperationsForChart` - Chart data aggregation
   - `transformQualityForChart` - Quality metrics transformation
   - `transformOperationsStatus` - Operations status grouping

5. **agent-network-source.test.ts** - Tests for agent network visualization
   - `fetchAgents` - Agent registry data
   - `fetchRoutingDecisions` - Routing decision data
   - `fetchAll` - Network graph data combination

6. **intelligence-savings-source.test.ts** - Tests for savings metrics
   - `fetchMetrics` - Savings calculations
   - `fetchAgentComparisons` - Agent comparison data
   - `fetchTimeSeriesData` - Time series savings data
   - `fetchAll` - Combined savings data

7. **event-flow-source.test.ts** - Tests for event stream processing
   - `fetchEvents` - Event stream fetching
   - `calculateMetrics` - Metrics calculation from events
   - `generateChartData` - Chart data generation

8. **platform-monitoring-source.test.ts** - Tests for platform monitoring
   - `fetchSystemStatus` - System health status
   - `fetchDeveloperMetrics` - Developer productivity metrics
   - `fetchIncidents` - Incident tracking
   - `fetchAll` - Combined monitoring data

## Test Utilities

### mock-fetch.ts

Utility functions for mocking fetch in tests:

- `createMockResponse<T>(data, options)` - Create a mock Response object
- `setupFetchMock(responses)` - Setup global fetch mock with response map
- `resetFetchMock()` - Reset fetch to original implementation

## Running Tests

### Run all tests

```bash
npm test
```

### Run tests in watch mode

```bash
npm test -- --watch
```

### Run tests with coverage

```bash
npm run test:coverage
```

### Run tests with UI

```bash
npm run test:ui
```

### Run specific test file

```bash
npm test -- agent-management-source.test.ts
```

## Test Structure

Each test file follows this structure:

1. **Setup/Teardown** - Reset mocks before each test
2. **Happy Path Tests** - Test successful API responses
3. **Error Handling Tests** - Test API failures and fallbacks
4. **Edge Case Tests** - Test empty arrays, null values, etc.
5. **Transformation Tests** - Test data transformation logic
6. **Integration Tests** - Test `fetchAll` methods combining multiple sources

## Key Testing Patterns

### Mocking API Responses

```typescript
setupFetchMock(
  new Map([
    ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
    ['/api/agents/routing/stats', createMockResponse(mockStats)],
  ])
);
```

### Testing Weighted Averages

Tests verify that weighted averages are calculated correctly based on request volume, not simple averages.

### Testing Fallback Logic

Tests verify that when primary API fails, the source falls back to:

1. Alternative API endpoint
2. Mock data with `isMock: true` flag

### Testing Data Transformations

Tests verify that raw API data is correctly transformed to the expected format for UI consumption.

## Coverage Goals

- **Line Coverage**: >90%
- **Branch Coverage**: >85%
- **Function Coverage**: 100%

## Adding New Tests

When adding a new data source:

1. Create `{source-name}-source.test.ts` in this directory
2. Import the source and types
3. Test all public methods
4. Test error handling and fallbacks
5. Test data transformations
6. Test `fetchAll` if applicable

Example:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { myDataSource } from '../my-data-source';
import {
  createMockResponse,
  setupFetchMock,
  resetFetchMock,
} from '../../../tests/utils/mock-fetch';

describe('MyDataSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchData', () => {
    it('should return real data when API succeeds', async () => {
      // Test implementation
    });

    it('should return mock data when API fails', async () => {
      // Test implementation
    });
  });
});
```
