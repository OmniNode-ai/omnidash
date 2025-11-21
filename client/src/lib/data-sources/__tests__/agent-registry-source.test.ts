import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentRegistrySource } from '../agent-registry-source';
import type { AgentDefinition, RecentActivity } from '../agent-registry-source';
import {
  createMockResponse,
  setupFetchMock,
  resetFetchMock,
} from '../../../tests/utils/mock-fetch';

// Mock the USE_MOCK_DATA flag to ensure tests use real fetch
vi.mock('../../mock-data', () => ({
  USE_MOCK_DATA: false,
  AgentRegistryMockData: {
    generateRecentActivities: vi.fn((limit: number = 20) =>
      Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
        id: `activity-${i}`,
        correlationId: `corr-${i}`,
        agentName: 'test-agent',
        actionType: 'execution',
        actionName: 'test-action',
        description: 'Test activity',
        status: 'success' as const,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        duration: 100,
        durationMs: 100,
      }))
    ),
  },
}));

describe('AgentRegistrySource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchAgents', () => {
    it('should return agents from API', async () => {
      const mockAgents: AgentDefinition[] = [
        {
          id: 'agent-1',
          name: 'Code Generator',
          description: 'Generates code',
          category: 'development',
        },
        { id: 'agent-2', name: 'Test Agent', description: 'Runs tests', category: 'quality' },
        {
          id: 'agent-3',
          name: 'Doc Writer',
          description: 'Writes docs',
          category: 'documentation',
        },
      ];

      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(mockAgents)]]));

      const result = await agentRegistrySource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockAgents);
      expect(result.data.length).toBe(3);
    });

    it('should apply category filter', async () => {
      const mockAgents: AgentDefinition[] = [
        { id: 'agent-1', name: 'Test Agent', category: 'quality' },
      ];

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('category=quality')) {
          return createMockResponse(mockAgents);
        }
        return createMockResponse([]);
      });

      global.fetch = mockFetch as any;

      const result = await agentRegistrySource.fetchAgents({ category: 'quality' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('category=quality'));
      expect(result.data).toEqual(mockAgents);
    });

    it('should not apply "all" category filter', async () => {
      const mockAgents: AgentDefinition[] = [{ id: 'agent-1', name: 'Test Agent' }];

      const mockFetch = vi.fn(async (url: string) => {
        // URL should NOT include category=all
        expect(url).not.toContain('category=all');
        return createMockResponse(mockAgents);
      });

      global.fetch = mockFetch as any;

      await agentRegistrySource.fetchAgents({ category: 'all' });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should apply search filter', async () => {
      const mockAgents: AgentDefinition[] = [{ id: 'agent-1', name: 'Code Generator' }];

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('search=code')) {
          return createMockResponse(mockAgents);
        }
        return createMockResponse([]);
      });

      global.fetch = mockFetch as any;

      const result = await agentRegistrySource.fetchAgents({ search: 'code' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=code'));
      expect(result.data).toEqual(mockAgents);
    });

    it('should apply status filter', async () => {
      const mockAgents: AgentDefinition[] = [
        { id: 'agent-1', name: 'Active Agent', status: 'active' },
      ];

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('status=active')) {
          return createMockResponse(mockAgents);
        }
        return createMockResponse([]);
      });

      global.fetch = mockFetch as any;

      const result = await agentRegistrySource.fetchAgents({ status: 'active' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('status=active'));
      expect(result.data).toEqual(mockAgents);
    });

    it('should not apply "all" status filter', async () => {
      const mockAgents: AgentDefinition[] = [{ id: 'agent-1', name: 'Test Agent' }];

      const mockFetch = vi.fn(async (url: string) => {
        // URL should NOT include status=all
        expect(url).not.toContain('status=all');
        return createMockResponse(mockAgents);
      });

      global.fetch = mockFetch as any;

      await agentRegistrySource.fetchAgents({ status: 'all' });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should apply multiple filters', async () => {
      const mockAgents: AgentDefinition[] = [
        { id: 'agent-1', name: 'Test Agent', category: 'quality', status: 'active' },
      ];

      const mockFetch = vi.fn(async (url: string) => {
        if (
          url.includes('category=quality') &&
          url.includes('search=test') &&
          url.includes('status=active')
        ) {
          return createMockResponse(mockAgents);
        }
        return createMockResponse([]);
      });

      global.fetch = mockFetch as any;

      const result = await agentRegistrySource.fetchAgents({
        category: 'quality',
        search: 'test',
        status: 'active',
      });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('category=quality'));
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=test'));
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('status=active'));
      expect(result.data).toEqual(mockAgents);
    });

    it('should validate agent structure', async () => {
      const mockAgents: AgentDefinition[] = [
        { id: 'agent-1', name: 'Test Agent', description: 'A test agent', category: 'development' },
        { id: 'agent-2', name: 'Review Agent', category: 'quality' },
      ];

      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(mockAgents)]]));

      const result = await agentRegistrySource.fetchAgents();

      result.data.forEach((agent) => {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent.id).toBeTruthy();
        expect(agent.name).toBeTruthy();
      });
    });

    it('should return empty array when API returns non-array', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse({ agents: [] })]]));

      const result = await agentRegistrySource.fetchAgents();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should return empty mock data when API fails', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse(null, { status: 500 })]]));

      const result = await agentRegistrySource.fetchAgents();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(new Map([['/api/agents/agents', new Error('Network connection failed')]]));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await agentRegistrySource.fetchAgents();

      expect(result.isMock).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch agents from registry API',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchCategories', () => {
    it('should return categories from API', async () => {
      const mockCategories = ['Development', 'Quality', 'Infrastructure', 'Documentation'];

      setupFetchMock(new Map([['/api/agents/categories', createMockResponse(mockCategories)]]));

      const result = await agentRegistrySource.fetchCategories();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockCategories);
      expect(result.data.length).toBe(4);
    });

    it('should validate categories are strings', async () => {
      const mockCategories = ['Development', 'Quality'];

      setupFetchMock(new Map([['/api/agents/categories', createMockResponse(mockCategories)]]));

      const result = await agentRegistrySource.fetchCategories();

      result.data.forEach((category) => {
        expect(typeof category).toBe('string');
        expect(category).toBeTruthy();
      });
    });

    it('should return empty array when API returns non-array', async () => {
      setupFetchMock(new Map([['/api/agents/categories', createMockResponse({ categories: [] })]]));

      const result = await agentRegistrySource.fetchCategories();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([['/api/agents/categories', createMockResponse(null, { status: 500 })]])
      );

      const result = await agentRegistrySource.fetchCategories();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual(['Code Generation', 'Code Review', 'Testing', 'Documentation']);
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(new Map([['/api/agents/categories', new Error('Connection timeout')]]));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await agentRegistrySource.fetchCategories();

      expect(result.isMock).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch categories, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchPerformance', () => {
    it('should return performance data from API', async () => {
      const mockPerformance = {
        avgResponseTime: 1500,
        throughput: 100,
        errorRate: 0.05,
      };

      setupFetchMock(new Map([['/api/agents/performance', createMockResponse(mockPerformance)]]));

      const result = await agentRegistrySource.fetchPerformance();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockPerformance);
    });

    it('should return empty object when API fails', async () => {
      setupFetchMock(
        new Map([['/api/agents/performance', createMockResponse(null, { status: 500 })]])
      );

      const result = await agentRegistrySource.fetchPerformance();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(new Map([['/api/agents/performance', new Error('API unreachable')]]));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await agentRegistrySource.fetchPerformance();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch performance, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchRouting', () => {
    it('should return routing data from API', async () => {
      const mockRouting = {
        totalDecisions: 5000,
        avgConfidence: 0.92,
        routingTime: 500,
      };

      setupFetchMock(new Map([['/api/agents/routing', createMockResponse(mockRouting)]]));

      const result = await agentRegistrySource.fetchRouting();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockRouting);
    });

    it('should return empty object when API fails', async () => {
      setupFetchMock(new Map([['/api/agents/routing', createMockResponse(null, { status: 500 })]]));

      const result = await agentRegistrySource.fetchRouting();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(new Map([['/api/agents/routing', new Error('Network error')]]));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await agentRegistrySource.fetchRouting();

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch routing, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchRecentActivity', () => {
    it('should return recent activity from API', async () => {
      const mockActivity: RecentActivity[] = [
        {
          id: 'activity-1',
          agentId: 'agent-1',
          agentName: 'Test Agent',
          actionType: 'execution',
          timestamp: '2024-01-01T00:00:00Z',
          status: 'success',
        },
        {
          id: 'activity-2',
          agentId: 'agent-2',
          agentName: 'Review Agent',
          actionType: 'review',
          timestamp: '2024-01-01T00:01:00Z',
          status: 'completed',
        },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/actions/recent', createMockResponse(mockActivity)]])
      );

      const result = await agentRegistrySource.fetchRecentActivity(20);

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockActivity);
      expect(result.data.length).toBe(2);
    });

    it('should pass limit parameter to API', async () => {
      const mockActivity: RecentActivity[] = [];

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('limit=50')) {
          return createMockResponse(mockActivity);
        }
        return createMockResponse([]);
      });

      global.fetch = mockFetch as any;

      await agentRegistrySource.fetchRecentActivity(50);

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=50'));
    });

    it('should use default limit of 20', async () => {
      const mockActivity: RecentActivity[] = [];

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('limit=20')) {
          return createMockResponse(mockActivity);
        }
        return createMockResponse([]);
      });

      global.fetch = mockFetch as any;

      await agentRegistrySource.fetchRecentActivity();

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=20'));
    });

    it('should validate activity structure', async () => {
      const mockActivity: RecentActivity[] = [
        {
          id: 'activity-1',
          agentId: 'agent-1',
          agentName: 'Test Agent',
          actionType: 'execution',
          timestamp: '2024-01-01T00:00:00Z',
          status: 'success',
        },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/actions/recent', createMockResponse(mockActivity)]])
      );

      const result = await agentRegistrySource.fetchRecentActivity(10);

      result.data.forEach((activity) => {
        expect(activity).toHaveProperty('id');
        expect(activity).toHaveProperty('agentId');
        expect(activity).toHaveProperty('agentName');
        expect(activity.id).toBeTruthy();
        expect(activity.agentId).toBeTruthy();
      });
    });

    it('should return empty array when API returns non-array', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/actions/recent', createMockResponse({ activities: [] })]])
      );

      const result = await agentRegistrySource.fetchRecentActivity(20);

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should handle network error gracefully', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/actions/recent', new Error('Connection failed')]])
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await agentRegistrySource.fetchRecentActivity(20);

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0); // Mock data should be returned
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch recent activity from API, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchAll', () => {
    it('should combine all registry data sources', async () => {
      const mockAgents: AgentDefinition[] = [
        { id: 'agent-1', name: 'Test Agent', category: 'development' },
      ];
      const mockCategories = ['Development', 'Quality'];
      const mockPerformance = { avgResponseTime: 1500 };
      const mockRouting = { totalDecisions: 5000 };

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(mockAgents)],
          ['/api/agents/categories', createMockResponse(mockCategories)],
          ['/api/agents/performance', createMockResponse(mockPerformance)],
          ['/api/agents/routing', createMockResponse(mockRouting)],
        ])
      );

      const result = await agentRegistrySource.fetchAll({ category: 'development' });

      expect(result.agents).toEqual(mockAgents);
      expect(result.categories).toEqual(mockCategories);
      expect(result.performance).toEqual(mockPerformance);
      expect(result.routing).toEqual(mockRouting);
      expect(result.isMock).toBe(false);
    });

    it('should mark as mock if any source fails', async () => {
      const mockAgents: AgentDefinition[] = [{ id: 'agent-1', name: 'Test Agent' }];
      const mockCategories = ['Development'];

      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse(mockAgents)],
          ['/api/agents/categories', createMockResponse(mockCategories)],
          ['/api/agents/performance', createMockResponse(null, { status: 500 })],
          ['/api/agents/routing', createMockResponse({})],
        ])
      );

      const result = await agentRegistrySource.fetchAll();

      expect(result.isMock).toBe(true);
    });

    it('should pass filters to fetchAgents', async () => {
      const mockAgents: AgentDefinition[] = [];
      const mockCategories: string[] = [];

      const mockFetch = vi.fn(async (url: string) => {
        if (
          url.includes('/api/agents/agents') &&
          url.includes('category=quality') &&
          url.includes('search=test')
        ) {
          return createMockResponse(mockAgents);
        }
        if (url.includes('/api/agents/categories')) {
          return createMockResponse(mockCategories);
        }
        if (url.includes('/api/agents/performance')) {
          return createMockResponse({});
        }
        if (url.includes('/api/agents/routing')) {
          return createMockResponse({});
        }
        return createMockResponse(null, { status: 404 });
      });

      global.fetch = mockFetch as any;

      await agentRegistrySource.fetchAll({ category: 'quality', search: 'test', status: 'active' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('category=quality'));
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=test'));
    });
  });

  describe('edge cases', () => {
    it('should handle empty API response', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse([])]]));

      const result = await agentRegistrySource.fetchAgents();
      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should handle non-array API response', async () => {
      setupFetchMock(new Map([['/api/agents/agents', createMockResponse({ agents: [] })]]));

      const result = await agentRegistrySource.fetchAgents();
      expect(result.isMock).toBe(false);
      expect(result.data).toEqual([]);
    });

    it('should handle network errors gracefully', async () => {
      setupFetchMock(new Map([['/api/agents/agents', new Error('Network error')]]));

      const result = await agentRegistrySource.fetchAgents();
      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle 500 error responses', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/agents', createMockResponse({ error: 'Server error' }, { status: 500 })],
        ])
      );

      const result = await agentRegistrySource.fetchAgents();
      expect(result.isMock).toBe(true);
    });

    it('should handle fetch timeout', async () => {
      setupFetchMock(new Map([['/api/agents/agents', new Error('Timeout')]]));

      const result = await agentRegistrySource.fetchAgents();
      expect(result.isMock).toBe(true);
    });
  });
});
