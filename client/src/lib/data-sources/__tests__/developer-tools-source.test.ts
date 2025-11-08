import { describe, it, expect, beforeEach, vi } from 'vitest';
import { developerToolsSource } from '../developer-tools-source';
import type { DeveloperActivity, ToolUsage, QueryHistory } from '../developer-tools-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('DeveloperToolsSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchActivity', () => {
    it('should fetch developer activity from API successfully', async () => {
      const mockActivity: DeveloperActivity = {
        totalQueries: 500,
        activeSessions: 15,
        avgResponseTime: 150,
        satisfactionScore: 8.5,
        topTools: [
          { name: 'Query Assistant', usage: 200, satisfaction: 9.0 },
          { name: 'Code Analysis', usage: 150, satisfaction: 8.5 },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse(mockActivity)],
        ])
      );

      const result = await developerToolsSource.fetchActivity('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockActivity);
      expect(result.data.totalQueries).toBe(500);
      expect(result.data.activeSessions).toBe(15);
      expect(result.data.avgResponseTime).toBe(150);
      expect(result.data.satisfactionScore).toBe(8.5);
      expect(result.data.topTools.length).toBe(2);
    });

    it('should include timeRange parameter in API request', async () => {
      const mockActivity: DeveloperActivity = {
        totalQueries: 100,
        activeSessions: 5,
        avgResponseTime: 100,
        satisfactionScore: 8.0,
        topTools: [],
      };

      setupFetchMock(
        new Map([
          ['/api/developer/activity?timeRange=7d', createMockResponse(mockActivity)],
        ])
      );

      await developerToolsSource.fetchActivity('7d');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/developer/activity?timeRange=7d')
      );
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await developerToolsSource.fetchActivity('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.totalQueries).toBeGreaterThan(0);
      expect(result.data.activeSessions).toBeGreaterThan(0);
      expect(result.data.avgResponseTime).toBeGreaterThan(0);
      expect(result.data.satisfactionScore).toBeGreaterThan(0);
      expect(result.data.topTools.length).toBeGreaterThan(0);
    });

    it('should return mock data when network error occurs', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/activity', new Error('Network error')],
        ])
      );

      const result = await developerToolsSource.fetchActivity('24h');

      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.totalQueries).toBe(1247);
    });

    it('should handle empty topTools array', async () => {
      const mockActivity: DeveloperActivity = {
        totalQueries: 0,
        activeSessions: 0,
        avgResponseTime: 0,
        satisfactionScore: 0,
        topTools: [],
      };

      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse(mockActivity)],
        ])
      );

      const result = await developerToolsSource.fetchActivity('24h');

      expect(result.isMock).toBe(false);
      expect(result.data.topTools).toEqual([]);
    });
  });

  describe('fetchToolUsage', () => {
    it('should fetch tool usage from API successfully', async () => {
      const mockToolUsage: ToolUsage[] = [
        {
          toolName: 'Query Assistant',
          usageCount: 250,
          avgRating: 4.5,
          lastUsed: '2024-01-01T12:00:00Z',
          category: 'AI Tools',
        },
        {
          toolName: 'Code Analysis',
          usageCount: 150,
          avgRating: 4.2,
          lastUsed: '2024-01-01T11:00:00Z',
          category: 'Code Tools',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/tools/usage', createMockResponse(mockToolUsage)],
        ])
      );

      const result = await developerToolsSource.fetchToolUsage('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockToolUsage);
      expect(result.data.length).toBe(2);
      expect(result.data[0].toolName).toBe('Query Assistant');
      expect(result.data[0].usageCount).toBe(250);
      expect(result.data[0].avgRating).toBe(4.5);
      expect(result.data[0].category).toBe('AI Tools');
    });

    it('should include timeRange parameter in API request', async () => {
      setupFetchMock(
        new Map([
          ['/api/tools/usage?timeRange=30d', createMockResponse([])],
        ])
      );

      await developerToolsSource.fetchToolUsage('30d');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tools/usage?timeRange=30d')
      );
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/tools/usage', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await developerToolsSource.fetchToolUsage('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].toolName).toBeDefined();
      expect(result.data[0].usageCount).toBeGreaterThan(0);
      expect(result.data[0].avgRating).toBeGreaterThan(0);
      expect(result.data[0].lastUsed).toBeDefined();
      expect(result.data[0].category).toBeDefined();
    });

    it('should return mock data when network error occurs', async () => {
      setupFetchMock(
        new Map([
          ['/api/tools/usage', new Error('Network error')],
        ])
      );

      const result = await developerToolsSource.fetchToolUsage('24h');

      expect(result.isMock).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(5);
    });

    it('should handle empty tool usage array from API', async () => {
      setupFetchMock(
        new Map([
          ['/api/tools/usage', createMockResponse([])],
        ])
      );

      const result = await developerToolsSource.fetchToolUsage('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should validate tool usage data structure', async () => {
      const mockToolUsage: ToolUsage[] = [
        {
          toolName: 'Test Tool',
          usageCount: 100,
          avgRating: 4.8,
          lastUsed: '2024-01-01T12:00:00Z',
          category: 'Testing',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/tools/usage', createMockResponse(mockToolUsage)],
        ])
      );

      const result = await developerToolsSource.fetchToolUsage('24h');

      expect(result.data[0]).toHaveProperty('toolName');
      expect(result.data[0]).toHaveProperty('usageCount');
      expect(result.data[0]).toHaveProperty('avgRating');
      expect(result.data[0]).toHaveProperty('lastUsed');
      expect(result.data[0]).toHaveProperty('category');
    });
  });

  describe('fetchQueryHistory', () => {
    it('should fetch query history from API successfully', async () => {
      const mockQueryHistory: QueryHistory[] = [
        {
          id: 'query-1',
          query: 'How do I implement authentication?',
          response: 'Here is how you implement authentication...',
          timestamp: '2024-01-01T12:00:00Z',
          rating: 5,
          tool: 'Query Assistant',
        },
        {
          id: 'query-2',
          query: 'Show me recent errors',
          response: 'Here are the recent errors...',
          timestamp: '2024-01-01T11:00:00Z',
          rating: 4,
          tool: 'Event Tracing',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/developer/queries', createMockResponse(mockQueryHistory)],
        ])
      );

      const result = await developerToolsSource.fetchQueryHistory('24h', 10);

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockQueryHistory);
      expect(result.data.length).toBe(2);
      expect(result.data[0].id).toBe('query-1');
      expect(result.data[0].query).toBeDefined();
      expect(result.data[0].response).toBeDefined();
      expect(result.data[0].rating).toBe(5);
    });

    it('should use default limit of 10 when not specified', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/queries?timeRange=24h&limit=10', createMockResponse([])],
        ])
      );

      await developerToolsSource.fetchQueryHistory('24h');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10')
      );
    });

    it('should include custom limit parameter in API request', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/queries?timeRange=24h&limit=20', createMockResponse([])],
        ])
      );

      await developerToolsSource.fetchQueryHistory('24h', 20);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=20')
      );
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/queries', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await developerToolsSource.fetchQueryHistory('24h', 10);

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return mock data when network error occurs', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/queries', new Error('Network error')],
        ])
      );

      const result = await developerToolsSource.fetchQueryHistory('24h');

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle empty query history from API', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/queries', createMockResponse([])],
        ])
      );

      const result = await developerToolsSource.fetchQueryHistory('24h', 5);

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should handle query history with optional rating', async () => {
      const mockQueryHistory: QueryHistory[] = [
        {
          id: 'query-1',
          query: 'Test query',
          response: 'Test response',
          timestamp: '2024-01-01T12:00:00Z',
          tool: 'Query Assistant',
          // No rating
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/developer/queries', createMockResponse(mockQueryHistory)],
        ])
      );

      const result = await developerToolsSource.fetchQueryHistory('24h');

      expect(result.isMock).toBe(false);
      expect(result.data[0].rating).toBeUndefined();
    });
  });

  describe('fetchAll', () => {
    it('should fetch all data sources in parallel', async () => {
      const mockActivity: DeveloperActivity = {
        totalQueries: 500,
        activeSessions: 15,
        avgResponseTime: 150,
        satisfactionScore: 8.5,
        topTools: [
          { name: 'Query Assistant', usage: 200, satisfaction: 9.0 },
        ],
      };

      const mockToolUsage: ToolUsage[] = [
        {
          toolName: 'Query Assistant',
          usageCount: 200,
          avgRating: 4.5,
          lastUsed: '2024-01-01T12:00:00Z',
          category: 'AI Tools',
        },
      ];

      const mockQueryHistory: QueryHistory[] = [
        {
          id: 'query-1',
          query: 'Test query',
          response: 'Test response',
          timestamp: '2024-01-01T12:00:00Z',
          rating: 5,
          tool: 'Query Assistant',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse(mockActivity)],
          ['/api/tools/usage', createMockResponse(mockToolUsage)],
          ['/api/developer/queries', createMockResponse(mockQueryHistory)],
        ])
      );

      const result = await developerToolsSource.fetchAll('24h');

      expect(result.activity).toEqual(mockActivity);
      expect(result.toolUsage).toEqual(mockToolUsage);
      expect(result.queryHistory).toEqual(mockQueryHistory);
      expect(result.isMock).toBe(false);
    });

    it('should mark as mock if any data source uses mock data', async () => {
      const mockActivity: DeveloperActivity = {
        totalQueries: 500,
        activeSessions: 15,
        avgResponseTime: 150,
        satisfactionScore: 8.5,
        topTools: [],
      };

      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse(mockActivity)],
          ['/api/tools/usage', createMockResponse(null, { status: 500 })], // This will fail
          ['/api/developer/queries', createMockResponse([])],
        ])
      );

      const result = await developerToolsSource.fetchAll('24h');

      expect(result.isMock).toBe(true); // Should be true because toolUsage failed
      expect(result.activity).toBeDefined();
      expect(result.toolUsage).toBeDefined();
      expect(result.queryHistory).toBeDefined();
    });

    it('should handle all API failures gracefully', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse(null, { status: 500 })],
          ['/api/tools/usage', createMockResponse(null, { status: 500 })],
          ['/api/developer/queries', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await developerToolsSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
      expect(result.activity).toBeDefined();
      expect(result.activity.totalQueries).toBeGreaterThan(0);
      expect(result.toolUsage).toBeDefined();
      expect(result.toolUsage.length).toBeGreaterThan(0);
      expect(result.queryHistory).toBeDefined();
      expect(result.queryHistory).toEqual([]);
    });

    it('should pass timeRange to all fetch methods', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/activity?timeRange=7d', createMockResponse({} as DeveloperActivity)],
          ['/api/tools/usage?timeRange=7d', createMockResponse([])],
          ['/api/developer/queries?timeRange=7d', createMockResponse([])],
        ])
      );

      await developerToolsSource.fetchAll('7d');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('timeRange=7d')
      );
    });

    it('should use default limit of 10 for query history in fetchAll', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse({} as DeveloperActivity)],
          ['/api/tools/usage', createMockResponse([])],
          ['/api/developer/queries?timeRange=24h&limit=10', createMockResponse([])],
        ])
      );

      await developerToolsSource.fetchAll('24h');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10')
      );
    });

    it('should combine isMock flags correctly with OR logic', async () => {
      const mockActivity: DeveloperActivity = {
        totalQueries: 100,
        activeSessions: 5,
        avgResponseTime: 100,
        satisfactionScore: 8.0,
        topTools: [],
      };

      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse(mockActivity)],
          ['/api/tools/usage', createMockResponse([])],
          ['/api/developer/queries', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await developerToolsSource.fetchAll('24h');

      // Should be true because queryHistory failed and returned mock
      expect(result.isMock).toBe(true);
    });

    it('should return complete data structure even with partial failures', async () => {
      setupFetchMock(
        new Map([
          ['/api/developer/activity', createMockResponse(null, { status: 500 })],
          ['/api/tools/usage', createMockResponse([{ toolName: 'Test', usageCount: 1, avgRating: 5, lastUsed: '', category: 'Test' }])],
          ['/api/developer/queries', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await developerToolsSource.fetchAll('24h');

      expect(result).toHaveProperty('activity');
      expect(result).toHaveProperty('toolUsage');
      expect(result).toHaveProperty('queryHistory');
      expect(result).toHaveProperty('isMock');
      expect(result.toolUsage.length).toBe(1);
    });
  });
});
