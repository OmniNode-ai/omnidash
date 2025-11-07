# Mock Data System

This directory contains comprehensive mock data generators for all dashboard screens in Omnidash. The mock data system provides realistic, production-like data that can be used for development, testing, demos, and when backend services are unavailable.

## Quick Start

### Enable Mock Data

To enable mock data across all dashboards, set the `VITE_USE_MOCK_DATA` environment variable:

```bash
# In your .env file or .env.local
VITE_USE_MOCK_DATA=true
```

Then restart your development server:

```bash
npm run dev
```

### Disable Mock Data

To use real API endpoints, either remove the environment variable or set it to `false`:

```bash
# In your .env file or .env.local
VITE_USE_MOCK_DATA=false
```

Or simply remove the line entirely to use the default (false).

## Architecture

### Configuration (`config.ts`)

The central configuration file that:
- Exports the `USE_MOCK_DATA` flag (reads from `VITE_USE_MOCK_DATA` environment variable)
- Provides the `MockDataGenerator` utility class with helper methods for generating realistic data

### Mock Data Generators

Each dashboard has its own dedicated mock data generator:

| Generator | File | Dashboard |
|-----------|------|-----------|
| `AgentOperationsMockData` | `agent-operations-mock.ts` | Agent Operations Dashboard |
| `PatternLearningMockData` | `pattern-learning-mock.ts` | Pattern Learning Dashboard |
| `IntelligenceOperationsMockData` | `intelligence-operations-mock.ts` | Intelligence Operations Dashboard |
| `EventFlowMockData` | `event-flow-mock.ts` | Event Flow Dashboard |
| `CodeIntelligenceMockData` | `code-intelligence-mock.ts` | Code Intelligence Dashboard |
| `KnowledgeGraphMockData` | `knowledge-graph-mock.ts` | Knowledge Graph Dashboard |
| `PlatformHealthMockData` | `platform-health-mock.ts` | Platform Health Dashboard |
| `DeveloperExperienceMockData` | `developer-experience-mock.ts` | Developer Experience Dashboard |

### Data Sources Integration

Each data source in `client/src/lib/data-sources/` checks the `USE_MOCK_DATA` flag and returns comprehensive mock data when enabled:

```typescript
import { USE_MOCK_DATA, AgentOperationsMockData } from '../mock-data';

async fetchSummary(): Promise<{ data: AgentSummary; isMock: boolean }> {
  // Return comprehensive mock data if USE_MOCK_DATA is enabled
  if (USE_MOCK_DATA) {
    return { data: AgentOperationsMockData.generateSummary(), isMock: true };
  }

  // Otherwise, fetch from real API
  try {
    const response = await fetch('/api/...');
    // ...
  }
}
```

## Mock Data Generators

### MockDataGenerator Utility Class

The `MockDataGenerator` class provides helpful utilities for generating realistic mock data:

```typescript
import { MockDataGenerator as Gen } from './config';

// Generate random integers
Gen.randomInt(10, 100) // Random number between 10 and 100

// Generate random floats
Gen.randomFloat(0.5, 1.0, 2) // Random float between 0.5 and 1.0, 2 decimal places

// Pick random items
Gen.randomItem(['foo', 'bar', 'baz']) // Random item from array
Gen.randomItems(['a', 'b', 'c', 'd'], 2) // Pick 2 random items

// Generate timestamps
Gen.pastTimestamp(60) // Timestamp 0-60 minutes ago

// Generate time series data
Gen.generateTimeSeries(20, 0, 100, 1) // 20 data points, values 0-100, 1 minute intervals

// Generate IDs and names
Gen.uuid() // Generate UUID
Gen.agentName() // Generate realistic agent name
Gen.filePath() // Generate realistic file path
Gen.repositoryName() // Generate repository name
Gen.programmingLanguage() // Random programming language

// Generate statuses with weighted probabilities
Gen.status(0.8) // 80% success, 15% warning, 5% error
Gen.healthStatus() // healthy, degraded, or down
Gen.trend() // up, down, or stable
```

## Example: Creating Mock Data

### Simple Mock Data Generator

```typescript
import { MockDataGenerator as Gen } from './config';

export class MyDashboardMockData {
  static generateSummary() {
    return {
      totalItems: Gen.randomInt(100, 1000),
      activeItems: Gen.randomInt(50, 500),
      successRate: Gen.randomFloat(0.85, 0.99, 2),
      avgResponseTime: Gen.randomInt(100, 500),
    };
  }

  static generateChartData(dataPoints: number = 20) {
    return Gen.generateTimeSeries(dataPoints, 0, 100, 1);
  }

  static generateAll() {
    return {
      summary: this.generateSummary(),
      chartData: this.generateChartData(20),
      isMock: true,
    };
  }
}
```

### Using Mock Data in Data Sources

```typescript
import { USE_MOCK_DATA, MyDashboardMockData } from '../mock-data';

class MyDataSource {
  async fetchData() {
    // Check if mock data is enabled
    if (USE_MOCK_DATA) {
      return MyDashboardMockData.generateAll();
    }

    // Otherwise fetch from real API
    try {
      const response = await fetch('/api/my-endpoint');
      const data = await response.json();
      return { ...data, isMock: false };
    } catch (err) {
      // Fallback to mock data on error
      console.warn('API failed, using mock data', err);
      return MyDashboardMockData.generateAll();
    }
  }
}
```

## Features

### Realistic Data Generation

All mock data generators create realistic data that matches production patterns:

- **Agents**: 45-60 total agents with 70-100% active
- **Patterns**: 800-1500 patterns with quality scores 0.78-0.92
- **Events**: Realistic event types, sources, and timestamps
- **Health**: Mostly healthy services (85%+) with occasional degraded status
- **Performance**: Realistic latencies, durations, and success rates

### Time Series Data

Chart data includes realistic time series with:
- Configurable data point count
- Realistic value ranges
- Proper time intervals (minutes, hours, days)
- Time-sorted data points

### Weighted Probabilities

Status generation uses weighted probabilities to match production distributions:
- **Success Rate**: 80-95% (configurable)
- **Health Status**: 85% healthy, 10% degraded, 5% down
- **Trends**: 40% up, 10% down, 50% stable

### Comprehensive Coverage

Mock data includes all fields expected by dashboard components:
- Summary metrics
- Recent activity/actions
- Health status
- Chart data (time series)
- Lists (patterns, agents, documents)
- Breakdowns (languages, categories, types)

## Testing

### Testing with Mock Data

1. Enable mock data in your environment:
   ```bash
   echo "VITE_USE_MOCK_DATA=true" >> .env.local
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Visit each dashboard and verify data is displayed:
   - http://localhost:3000/ (Agent Operations)
   - http://localhost:3000/patterns (Pattern Learning)
   - http://localhost:3000/intelligence (Intelligence Operations)
   - http://localhost:3000/events (Event Flow)
   - http://localhost:3000/code (Code Intelligence)
   - http://localhost:3000/knowledge (Knowledge Graph)
   - http://localhost:3000/health (Platform Health)
   - http://localhost:3000/developer (Developer Experience)

### Testing API Fallback

The mock data system also serves as a fallback when APIs are unavailable. To test this:

1. Disable mock data: `VITE_USE_MOCK_DATA=false`
2. Ensure backend services are stopped
3. Visit dashboards - they should automatically fall back to mock data
4. Check browser console for warnings about API failures

## Development Workflow

### Adding New Mock Data

When adding a new dashboard or data source:

1. Create a new mock data generator file:
   ```typescript
   // client/src/lib/mock-data/my-dashboard-mock.ts
   import { MockDataGenerator as Gen } from './config';

   export class MyDashboardMockData {
     static generateAll() {
       // Generate comprehensive mock data
     }
   }
   ```

2. Export from `index.ts`:
   ```typescript
   export { MyDashboardMockData } from './my-dashboard-mock';
   ```

3. Update data source to use mock data:
   ```typescript
   import { USE_MOCK_DATA, MyDashboardMockData } from '../mock-data';

   // In fetch method:
   if (USE_MOCK_DATA) {
     return MyDashboardMockData.generateAll();
   }
   ```

### Updating Mock Data

To update existing mock data:

1. Locate the relevant mock data generator file
2. Update the generation logic to match new requirements
3. Test by enabling `VITE_USE_MOCK_DATA=true` and viewing the dashboard
4. Verify all fields are populated and displayed correctly

## Benefits

### Development
- **No Backend Required**: Develop and test frontend without running backend services
- **Consistent Data**: Same data structure across team members
- **Fast Iteration**: No API latency during development

### Testing
- **Reliable Tests**: Consistent mock data for testing
- **Edge Cases**: Easily test error states, edge cases, and unusual data
- **Reproducible**: Same data every time for debugging

### Demos
- **Professional**: Show dashboards with realistic, production-like data
- **Offline**: Run demos without internet or backend connectivity
- **Controlled**: Control exactly what data is displayed

## Troubleshooting

### Mock Data Not Showing

1. Check environment variable is set:
   ```bash
   grep VITE_USE_MOCK_DATA .env .env.local
   ```

2. Restart development server after changing .env files

3. Check browser console for errors

4. Verify data source imports USE_MOCK_DATA correctly

### Inconsistent Data

- Mock data is regenerated on each fetch
- To get consistent data, consider adding seeding or caching
- Check if dashboard is polling/refetching too frequently

### Performance Issues

- Mock data generation is very fast (<1ms typically)
- If slow, check for infinite loops in generation logic
- Consider memoizing expensive calculations

## Future Enhancements

Potential improvements to the mock data system:

1. **Seeded Random Data**: Use seed for reproducible mock data
2. **Persistence**: Cache mock data in localStorage for consistency
3. **Scenarios**: Pre-defined scenarios (error state, high load, etc.)
4. **Live Updates**: Simulate real-time updates with WebSocket mock
5. **Data Evolution**: Mock data that changes over time
6. **Configuration UI**: Control mock data parameters via UI

## Contributing

When contributing new mock data generators:

1. Follow existing patterns and structure
2. Use `MockDataGenerator` utility methods
3. Ensure data matches production schema exactly
4. Include all required fields (don't leave empty arrays/objects)
5. Test thoroughly with dashboard UI
6. Document any special considerations

## Support

For questions or issues with mock data:

1. Check this README first
2. Review existing mock data generators for examples
3. Check data source integration patterns
4. Consult team members or create an issue
