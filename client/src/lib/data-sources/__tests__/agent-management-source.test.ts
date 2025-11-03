import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentManagementSource } from '../agent-management-source';
import type { AgentSummary, RoutingStats, AgentExecution } from '../agent-management-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('AgentManagementDataSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchSummary', () => {
    it('should return real data from intelligence API when available', async () => {
      const mockAgents = [
        {
          agent: 'agent-1',
          totalRequests: 100,
          successRate: 0.95,
          avgRoutingTime: 1200,
          avgConfidence: 0.92,
        },
        {
          agent: 'agent-2',
          totalRequests: 200,
          successRate: 0.88,
          avgRoutingTime: 800,
          avgConfidence: 0.85,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await agentManagementSource.fetchSummary('24h');

      expect(result.isMock).toBe(false);
      expect(result.data.totalAgents).toBe(2);
      expect(result.data.activeAgents).toBe(2);
      expect(result.data.totalRuns).toBe(300);
      expect(result.data.successRate).toBeCloseTo(91.5, 1); // (0.95 + 0.88) / 2 * 100
      // Weighted avg execution time: (100 * 1200 + 200 * 800) / 300 = 933.33ms = 0.933s
      expect(result.data.avgExecutionTime).toBeCloseTo(0.933, 2);
    });

    it('should calculate weighted average execution time correctly', async () => {
      const mockAgents = [
        { agent: 'agent-1', totalRequests: 1000, avgRoutingTime: 2000 },
        { agent: 'agent-2', totalRequests: 100, avgRoutingTime: 1000 },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await agentManagementSource.fetchSummary('24h');

      // Weighted: (1000 * 2000 + 100 * 1000) / 1100 = 1909ms = 1.909s
      expect(result.data.avgExecutionTime).toBeCloseTo(1.909, 2);
    });

    it('should handle empty agent array from intelligence API', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse([])],
        ])
      );

      const result = await agentManagementSource.fetchSummary('24h');

      // Should fallback to registry API or mock
      expect(result.isMock).toBe(true);
    });

    it('should fallback to registry API when intelligence API fails', async () => {
      const mockSummary: AgentSummary = {
        totalAgents: 10,
        activeAgents: 8,
        totalRuns: 500,
        successRate: 92.5,
        avgExecutionTime: 1.5,
        totalSavings: 10000,
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(null, { status: 500 })],
          ['/api/agents/summary', createMockResponse(mockSummary)],
        ])
      );

      const result = await agentManagementSource.fetchSummary('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockSummary);
    });

    it('should return mock data when all APIs fail', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(null, { status: 500 })],
          ['/api/agents/summary', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentManagementSource.fetchSummary('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.totalAgents).toBe(15);
      expect(result.data.successRate).toBe(94.0);
      expect(result.data.avgExecutionTime).toBe(1.2);
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network request failed');
      
      // Use setupFetchMock to throw error for all requests
      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', networkError],
          ['/api/agents/summary', networkError],
        ])
      );

      const result = await agentManagementSource.fetchSummary('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.totalAgents).toBe(15); // Mock fallback data
    });

    it('should filter out inactive agents correctly', async () => {
      const mockAgents = [
        { agent: 'agent-1', totalRequests: 100 },
        { agent: 'agent-2', totalRequests: 0 },
        { agent: 'agent-3', totalRequests: 50 },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await agentManagementSource.fetchSummary('24h');

      expect(result.data.totalAgents).toBe(3);
      expect(result.data.activeAgents).toBe(2); // Only agent-1 and agent-3
    });
  });

  describe('fetchRoutingStats', () => {
    it('should return real routing stats from API', async () => {
      const mockStats: RoutingStats = {
        totalDecisions: 1500,
        avgConfidence: 0.94,
        avgRoutingTime: 45,
        accuracy: 94.0,
        strategyBreakdown: {
          enhanced_fuzzy_matching: 1000,
          exact_match: 500,
        },
        topAgents: [
          { agentId: 'agent-1', agentName: 'Agent 1', usage: 500, successRate: 95 },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/agents/routing/stats', createMockResponse(mockStats)],
        ])
      );

      const result = await agentManagementSource.fetchRoutingStats('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockStats);
    });

    it('should derive routing stats from intelligence API when routing stats endpoint unavailable', async () => {
      const mockMetrics = [
        {
          agent: 'agent-1',
          totalRequests: 500,
          avgConfidence: 0.92,
          avgRoutingTime: 50,
        },
        {
          agent: 'agent-2',
          totalRequests: 300,
          avgConfidence: 0.88,
          avgRoutingTime: 40,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/routing/stats', createMockResponse(null, { status: 404 })],
          ['/api/intelligence/agents/summary', createMockResponse(mockMetrics)],
        ])
      );

      const result = await agentManagementSource.fetchRoutingStats('24h');

      expect(result.isMock).toBe(false);
      expect(result.data.totalDecisions).toBe(800);
      expect(result.data.avgConfidence).toBeCloseTo(0.9, 1); // (0.92 + 0.88) / 2
      expect(result.data.avgRoutingTime).toBeCloseTo(45, 0); // Simple average: (50 + 40) / 2, but test is checking actual implementation
      expect(result.data.accuracy).toBeCloseTo(90, 0); // avgConfidence * 100
      expect(result.data.topAgents.length).toBeGreaterThan(0);
    });

    it('should return mock data when all APIs fail', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/routing/stats', createMockResponse(null, { status: 500 })],
          ['/api/intelligence/agents/summary', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentManagementSource.fetchRoutingStats('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.totalDecisions).toBe(15420);
      expect(result.data.accuracy).toBe(94.2);
    });
  });

  describe('fetchRecentExecutions', () => {
    it('should return real executions from API', async () => {
      const mockExecutions: AgentExecution[] = [
        {
          id: 'exec-1',
          agentId: 'agent-1',
          agentName: 'Agent 1',
          query: 'Test query',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:00:10Z',
          duration: 10,
          result: { success: true, qualityScore: 8.5 },
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/executions', createMockResponse(mockExecutions)],
        ])
      );

      const result = await agentManagementSource.fetchRecentExecutions('24h', 10);

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockExecutions);
    });

    it('should transform intelligence actions to executions format', async () => {
      const mockActions = [
        {
          id: 'action-1',
          agentName: 'agent-1',
          actionName: 'test-action',
          actionType: 'tool_call',
          durationMs: 5000,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'action-2',
          agentName: 'agent-2',
          actionName: 'error-action',
          actionType: 'error',
          createdAt: '2024-01-01T00:01:00Z',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/agents/executions', createMockResponse(null, { status: 404 })],
          ['/api/intelligence/actions/recent', createMockResponse(mockActions)],
        ])
      );

      const result = await agentManagementSource.fetchRecentExecutions('24h', 10);

      expect(result.isMock).toBe(false);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].status).toBe('completed');
      expect(result.data[0].duration).toBe(5); // 5000ms = 5s
      expect(result.data[1].status).toBe('failed');
    });

    it('should return empty array with mock flag when no data available', async () => {
      setupFetchMock(
        new Map([
          ['/api/agents/executions', createMockResponse([])],
          ['/api/intelligence/actions/recent', createMockResponse([])],
        ])
      );

      const result = await agentManagementSource.fetchRecentExecutions('24h', 10);

      expect(result.isMock).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('fetchAll', () => {
    it('should combine all data sources correctly', async () => {
      const mockAgents = [
        { agent: 'agent-1', totalRequests: 100, successRate: 0.95, avgRoutingTime: 1200, avgConfidence: 0.92 },
      ];
      const mockStats: RoutingStats = {
        totalDecisions: 100,
        avgConfidence: 0.92,
        avgRoutingTime: 45,
        accuracy: 92.0,
        strategyBreakdown: {},
        topAgents: [],
      };
      const mockExecutions: AgentExecution[] = [
        {
          id: 'exec-1',
          agentId: 'agent-1',
          agentName: 'Agent 1',
          query: 'Test',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00Z',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
          ['/api/agents/routing/stats', createMockResponse(mockStats)],
          ['/api/agents/executions', createMockResponse(mockExecutions)],
        ])
      );

      const result = await agentManagementSource.fetchAll('24h');

      expect(result.summary).toBeDefined();
      expect(result.routingStats).toEqual(mockStats);
      expect(result.recentExecutions).toEqual(mockExecutions);
      expect(result.isMock).toBe(false);
    });

    it('should mark as mock if any source returns mock data', async () => {
      const mockAgents = [
        { agent: 'agent-1', totalRequests: 100, successRate: 0.95, avgRoutingTime: 1200, avgConfidence: 0.92 },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
          ['/api/agents/routing/stats', createMockResponse(null, { status: 500 })],
          ['/api/agents/executions', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentManagementSource.fetchAll('24h');

      expect(result.isMock).toBe(true); // Because routing and executions fell back to mock
    });
  });
});

