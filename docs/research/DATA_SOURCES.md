# Data Sources Architecture

## Overview

Omnidash uses a **data source abstraction layer** to separate data fetching logic from UI components. All components should **only use data sources** and never directly call APIs, databases, or Kafka.

## Mock Data Mode

The system supports a **mock data mode** that completely disables all API, database, and Kafka calls, returning realistic mock data instead. This is useful for:

- **Development** when backend services are unavailable
- **Testing** with predictable, consistent data
- **Demos** and screenshots
- **Offline development**

### Enabling Mock Data Mode

Set the environment variable in your `.env` file:

```bash
# Enable mock data mode (no API/DB/Kafka calls)
VITE_USE_MOCK_DATA=true

# Disable mock data mode (use real APIs)
VITE_USE_MOCK_DATA=false
```

**Default:** `false` (uses real APIs)

### How It Works

All data sources check the `USE_MOCK_DATA` flag from `client/src/lib/mock-data/config.ts`:

```typescript
import { USE_MOCK_DATA } from '../mock-data/config';

class MyDataSource {
  async fetchData(params: string): Promise<{ data: MyData; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: {
          /* mock data */
        },
        isMock: true,
      };
    }

    // Try real API call
    try {
      const response = await fetch(`/api/endpoint?params=${params}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch data, using mock data', err);
    }

    // Fallback to mock data on error
    return {
      data: {
        /* mock data */
      },
      isMock: true,
    };
  }
}
```

### Key Benefits

1. **No API Calls**: When `USE_MOCK_DATA=true`, zero network requests are made
2. **No Database Connections**: All PostgreSQL queries are bypassed
3. **No Kafka Connections**: Event streaming is replaced with mock events
4. **Instant Response**: Mock data returns immediately without network latency
5. **Consistent Data**: Same mock data every time for predictable testing
6. **Offline Development**: Work without any backend services running

## Data Source Pattern

### Standard Pattern

All data sources follow this consistent pattern:

```typescript
// 1. Import dependencies
import { USE_MOCK_DATA } from '../mock-data/config';

// 2. Define interfaces
export interface MyData {
  field1: string;
  field2: number;
}

// 3. Create data source class
class MyDataSource {
  async fetchData(timeRange: string): Promise<{ data: MyData; isMock: boolean }> {
    // Check test environment
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Mock data mode
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: { field1: 'mock', field2: 123 },
        isMock: true,
      };
    }

    // Real API call
    try {
      const response = await fetch(`/api/my-endpoint?timeWindow=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch data, using mock data', err);
    }

    // Error fallback
    return {
      data: { field1: 'mock', field2: 123 },
      isMock: true,
    };
  }
}

// 4. Export singleton instance
export const myDataSource = new MyDataSource();
```

### Return Format

All data source methods return an object with:

```typescript
{
  data: T,           // The actual data
  isMock: boolean    // Whether this is mock data or real data
}
```

### Component Usage

Components should **only** use data sources:

```typescript
// ✅ CORRECT: Use data source
import { myDataSource } from '@/lib/data-sources';

function MyComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-data', timeRange],
    queryFn: async () => {
      const result = await myDataSource.fetchData(timeRange);
      return result.data; // Use the data
    },
  });

  // ...
}

// ❌ WRONG: Direct fetch call
function BadComponent() {
  const { data } = useQuery({
    queryKey: ['bad-data'],
    queryFn: async () => {
      const response = await fetch('/api/endpoint'); // DON'T DO THIS!
      return response.json();
    },
  });
}

// ❌ WRONG: Direct WebSocket
function BadComponent2() {
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/ws'); // DON'T DO THIS!
  }, []);
}
```

## Available Data Sources

| Data Source                   | File                               | Purpose                    |
| ----------------------------- | ---------------------------------- | -------------------------- |
| `agentOperationsSource`       | `agent-operations-source.ts`       | Agent execution metrics    |
| `agentManagementSource`       | `agent-management-source.ts`       | Agent configuration        |
| `agentNetworkSource`          | `agent-network-source.ts`          | Agent network topology     |
| `agentRegistrySource`         | `agent-registry-source.ts`         | Agent registry             |
| `architectureNetworksSource`  | `architecture-networks-source.ts`  | Architecture visualization |
| `codeIntelligenceSource`      | `code-intelligence-source.ts`      | Code analysis              |
| `developerToolsSource`        | `developer-tools-source.ts`        | Developer metrics          |
| `eventFlowSource`             | `event-flow-source.ts`             | Event stream               |
| `intelligenceAnalyticsSource` | `intelligence-analytics-source.ts` | Intelligence metrics       |
| `intelligenceSavingsSource`   | `intelligence-savings-source.ts`   | Cost savings               |
| `knowledgeGraphSource`        | `knowledge-graph-source.ts`        | Knowledge graph            |
| `patternLearningSource`       | `pattern-learning-source.ts`       | Pattern discovery          |
| `platformHealthSource`        | `platform-health-source.ts`        | Platform health            |
| `platformMonitoringSource`    | `platform-monitoring-source.ts`    | System monitoring          |

## Mock Data Configuration

The `USE_MOCK_DATA` flag is read from the environment variable:

```typescript
// client/src/lib/mock-data/config.ts
export const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true' || false;
```

## Testing

The system automatically detects test environment and disables `USE_MOCK_DATA` to allow test-specific mocks:

```typescript
const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

if (USE_MOCK_DATA && !isTestEnv) {
  // Use mock data
}
```

This ensures that:

- Tests can provide their own mock data
- Tests can verify real API calls when needed
- Mock mode doesn't interfere with test assertions

## Real-Time Data

For real-time updates (WebSocket, SSE), use hooks:

```typescript
// ✅ CORRECT: Use WebSocket hook
import { useWebSocket } from '@/hooks/useWebSocket';

function MyComponent() {
  const { events, connected } = useWebSocket();
  // ...
}
```

The WebSocket hook internally respects `USE_MOCK_DATA` and provides mock events when enabled.

## Best Practices

### ✅ Do

1. **Always use data sources** for all data fetching
2. **Check `USE_MOCK_DATA`** at the beginning of each fetch method
3. **Return `{ data, isMock }`** from all data source methods
4. **Provide fallback mock data** for error cases
5. **Use realistic mock data** that matches real API responses
6. **Import `USE_MOCK_DATA`** from `@/lib/mock-data/config`

### ❌ Don't

1. **Never make direct `fetch()` calls** in components
2. **Never create `WebSocket` connections** directly in components
3. **Never access Kafka/DB** from client-side code
4. **Never hardcode mock data** in components
5. **Don't skip test environment check** when using `USE_MOCK_DATA`

## Migration Guide

If you find a component making direct API calls, migrate it:

### Before

```typescript
// Component with direct fetch
function MyComponent() {
  const { data } = useQuery({
    queryKey: ['data'],
    queryFn: async () => {
      const res = await fetch('/api/endpoint');
      return res.json();
    },
  });
}
```

### After

```typescript
// 1. Create data source
// client/src/lib/data-sources/my-source.ts
import { USE_MOCK_DATA } from '../mock-data/config';

export interface MyData {
  field: string;
}

class MyDataSource {
  async fetchData(): Promise<{ data: MyData; isMock: boolean }> {
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    if (USE_MOCK_DATA && !isTestEnv) {
      return { data: { field: 'mock' }, isMock: true };
    }

    try {
      const res = await fetch('/api/endpoint');
      if (res.ok) {
        const data = await res.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch, using mock', err);
    }

    return { data: { field: 'mock' }, isMock: true };
  }
}

export const myDataSource = new MyDataSource();

// 2. Export from index
// client/src/lib/data-sources/index.ts
export { myDataSource, type MyData } from './my-source';

// 3. Update component
import { myDataSource } from '@/lib/data-sources';

function MyComponent() {
  const { data } = useQuery({
    queryKey: ['data'],
    queryFn: async () => {
      const result = await myDataSource.fetchData();
      return result.data;
    },
  });
}
```

## Environment Variables

```bash
# .env
# Mock Data System
VITE_USE_MOCK_DATA=false  # Set to 'true' to enable mock-only mode
```

## Architecture Benefits

1. **Separation of Concerns**: UI components focus on presentation, data sources handle fetching
2. **Testability**: Easy to mock data sources in tests
3. **Consistency**: All data fetching follows the same pattern
4. **Offline Development**: Work without backend services
5. **Error Handling**: Centralized error handling with automatic fallback
6. **Type Safety**: TypeScript interfaces for all data shapes
7. **Maintainability**: Changes to APIs only require updating data sources

## Summary

- ✅ All components use data sources
- ✅ All data sources check `USE_MOCK_DATA`
- ✅ No direct API calls in components
- ✅ No direct WebSocket/Kafka in components
- ✅ Consistent return format: `{ data, isMock }`
- ✅ Automatic fallback to mock data on errors
- ✅ Works with or without backend services
