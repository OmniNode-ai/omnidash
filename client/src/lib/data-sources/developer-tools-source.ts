// Developer Tools Data Source
import { USE_MOCK_DATA } from '../mock-data/config';

export interface DeveloperActivity {
  totalQueries: number;
  activeSessions: number;
  avgResponseTime: number;
  satisfactionScore: number;
  topTools: Array<{
    name: string;
    usage: number;
    satisfaction: number;
  }>;
}

export interface ToolUsage {
  toolName: string;
  usageCount: number;
  avgRating: number;
  lastUsed: string;
  category: string;
}

export interface QueryHistory {
  id: string;
  query: string;
  response: string;
  timestamp: string;
  rating?: number;
  tool: string;
}

interface DeveloperToolsData {
  activity: DeveloperActivity;
  toolUsage: ToolUsage[];
  queryHistory: QueryHistory[];
  isMock: boolean;
}

class DeveloperToolsSource {
  async fetchActivity(timeRange: string): Promise<{ data: DeveloperActivity; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: {
          totalQueries: 1247,
          activeSessions: 23,
          avgResponseTime: 245,
          satisfactionScore: 8.7,
          topTools: [
            { name: 'Query Assistant', usage: 456, satisfaction: 9.2 },
            { name: 'Code Analysis', usage: 234, satisfaction: 8.5 },
            { name: 'Event Tracing', usage: 189, satisfaction: 8.8 },
          ]
        },
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/developer/activity?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch developer activity, using mock data', err);
    }

    return {
      data: {
        totalQueries: 1247,
        activeSessions: 23,
        avgResponseTime: 245,
        satisfactionScore: 8.7,
        topTools: [
          { name: 'Query Assistant', usage: 456, satisfaction: 9.2 },
          { name: 'Code Analysis', usage: 234, satisfaction: 8.5 },
          { name: 'Event Tracing', usage: 189, satisfaction: 8.8 },
        ]
      },
      isMock: true,
    };
  }

  async fetchToolUsage(timeRange: string): Promise<{ data: ToolUsage[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: [
          { toolName: 'Query Assistant', usageCount: 456, avgRating: 4.6, lastUsed: new Date().toISOString(), category: 'AI Tools' },
          { toolName: 'Code Analysis', usageCount: 234, avgRating: 4.3, lastUsed: new Date(Date.now() - 3600000).toISOString(), category: 'Code Tools' },
          { toolName: 'Event Tracing', usageCount: 189, avgRating: 4.4, lastUsed: new Date(Date.now() - 7200000).toISOString(), category: 'Debugging' },
          { toolName: 'System Monitoring', usageCount: 156, avgRating: 4.2, lastUsed: new Date(Date.now() - 10800000).toISOString(), category: 'Monitoring' },
          { toolName: 'Data Visualization', usageCount: 98, avgRating: 4.5, lastUsed: new Date(Date.now() - 14400000).toISOString(), category: 'Analytics' },
        ],
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/tools/usage?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch tool usage, using mock data', err);
    }

    return {
      data: [
        { toolName: 'Query Assistant', usageCount: 456, avgRating: 4.6, lastUsed: new Date().toISOString(), category: 'AI Tools' },
        { toolName: 'Code Analysis', usageCount: 234, avgRating: 4.3, lastUsed: new Date(Date.now() - 3600000).toISOString(), category: 'Code Tools' },
        { toolName: 'Event Tracing', usageCount: 189, avgRating: 4.4, lastUsed: new Date(Date.now() - 7200000).toISOString(), category: 'Debugging' },
        { toolName: 'System Monitoring', usageCount: 156, avgRating: 4.2, lastUsed: new Date(Date.now() - 10800000).toISOString(), category: 'Monitoring' },
        { toolName: 'Data Visualization', usageCount: 98, avgRating: 4.5, lastUsed: new Date(Date.now() - 14400000).toISOString(), category: 'Analytics' },
      ],
      isMock: true,
    };
  }

  async fetchQueryHistory(timeRange: string, limit: number = 10): Promise<{ data: QueryHistory[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: [],
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/developer/queries?timeRange=${timeRange}&limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch query history, using mock data', err);
    }

    return {
      data: [],
      isMock: true,
    };
  }

  async fetchAll(timeRange: string): Promise<DeveloperToolsData> {
    const [activity, toolUsage, queryHistory] = await Promise.all([
      this.fetchActivity(timeRange),
      this.fetchToolUsage(timeRange),
      this.fetchQueryHistory(timeRange, 10),
    ]);

    return {
      activity: activity.data,
      toolUsage: toolUsage.data,
      queryHistory: queryHistory.data,
      isMock: activity.isMock || toolUsage.isMock || queryHistory.isMock,
    };
  }
}

export const developerToolsSource = new DeveloperToolsSource();





