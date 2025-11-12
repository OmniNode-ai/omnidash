import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentOperationsSource } from '../agent-operations-source';
import type { AgentSummary, RecentAction, HealthStatus } from '../agent-operations-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('AgentOperationsSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchSummary', () => {
    it('should calculate weighted average success rate and execution time', async () => {
      const mockAgents = [
        {
          agent: 'agent-1',
          totalRequests: 1000,
          successRate: 0.95,
          avgConfidence: 0.92,
          avgRoutingTime: 2000,
        },
        {
          agent: 'agent-2',
          totalRequests: 500,
          successRate: 0.88,
          avgConfidence: 0.85,
          avgRoutingTime: 1000,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await agentOperationsSource.fetchSummary('24h');

      expect(result.isMock).toBe(false);
      expect(result.data.totalAgents).toBe(2);
      expect(result.data.activeAgents).toBe(2);
      expect(result.data.totalRuns).toBe(1500);
      // Weighted success rate: (1000 * 0.95 + 500 * 0.88) / 1500 * 100 = 92.67%
      expect(result.data.successRate).toBeCloseTo(92.67, 1);
      // Weighted execution time: (1000 * 2000 + 500 * 1000) / 1500 / 1000 = 1.667s
      expect(result.data.avgExecutionTime).toBeCloseTo(1.667, 2);
    });

    it('should use avgConfidence as fallback for successRate', async () => {
      const mockAgents = [
        {
          agent: 'agent-1',
          totalRequests: 100,
          successRate: null,
          avgConfidence: 0.90,
          avgRoutingTime: 1000,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await agentOperationsSource.fetchSummary('24h');

      expect(result.data.successRate).toBeCloseTo(90, 1);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentOperationsSource.fetchSummary('24h');

      expect(result.isMock).toBe(true);
      // Mock data returns realistic data, not empty data
      expect(result.data.totalAgents).toBeGreaterThan(0);
      expect(result.data.successRate).toBeGreaterThanOrEqual(0);
      expect(result.data.successRate).toBeLessThanOrEqual(100);
    });
  });

  describe('fetchRecentActions', () => {
    it('should return recent actions from API', async () => {
      const mockActions = [
        {
          id: 'action-1',
          agentId: 'agent-1',
          agentName: 'agent-1',
          action: 'test-action',
          status: 'completed',
          timestamp: '2024-01-01T00:00:00Z',
          duration: 5000,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse(mockActions)],
        ])
      );

      const result = await agentOperationsSource.fetchRecentActions('24h', 100);

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockActions);
    });

    it('should return empty array when no data (not marked as mock if API succeeded)', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse([])],
        ])
      );

      const result = await agentOperationsSource.fetchRecentActions('24h', 100);

      expect(result.isMock).toBe(false); // API succeeded, just no data
      expect(result.data).toEqual([]);
    });
  });

  describe('fetchHealth', () => {
    it('should return health status from API', async () => {
      const mockHealth: HealthStatus = {
        status: 'healthy',
        services: [
          { name: 'PostgreSQL', status: 'up' },
          { name: 'OmniArchon', status: 'up' },
          { name: 'Qdrant', status: 'up' },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/health', createMockResponse(mockHealth)],
        ])
      );

      const result = await agentOperationsSource.fetchHealth();

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockHealth);
    });

    it('should return mock health when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/health', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await agentOperationsSource.fetchHealth();

      expect(result.isMock).toBe(true);
      expect(result.data.status).toBe('healthy');
      expect(result.data.services.length).toBeGreaterThan(0);
    });
  });

  describe('transformOperationsForChart', () => {
    it('should aggregate operations by time period', () => {
      const operationsData = [
        { period: '2024-01-01T12:00:00Z', operationsPerMinute: 10, actionType: 'tool_call' },
        { period: '2024-01-01T12:00:00Z', operationsPerMinute: 5, actionType: 'decision' },
        { period: '2024-01-01T13:00:00Z', operationsPerMinute: 15, actionType: 'tool_call' },
      ];

      const result = agentOperationsSource.transformOperationsForChart(operationsData);

      expect(result.length).toBe(2); // Two unique time periods
      expect(result[0].value).toBe(15); // 13:00 aggregated
      expect(result[1].value).toBe(15); // 12:00 aggregated (10 + 5)
    });

    it('should return empty array for empty input', () => {
      const result = agentOperationsSource.transformOperationsForChart([]);
      expect(result).toEqual([]);
    });
  });

  describe('transformQualityForChart', () => {
    it('should convert quality improvement to percentage', () => {
      const qualityData = [
        { period: '2024-01-01T12:00:00Z', avgQualityImprovement: 0.85 },
        { period: '2024-01-01T13:00:00Z', avgQualityImprovement: 0.92 },
      ];

      const result = agentOperationsSource.transformQualityForChart(qualityData);

      expect(result.length).toBe(2);
      expect(result[0].value).toBe(92); // 0.92 * 100
      expect(result[1].value).toBe(85); // 0.85 * 100
    });
  });

  describe('transformOperationsStatus', () => {
    it('should group operations by type and calculate status', () => {
      const operationsData = [
        { actionType: 'tool_call', operationsPerMinute: 10 },
        { actionType: 'tool_call', operationsPerMinute: 5 },
        { actionType: 'decision', operationsPerMinute: 0 },
      ];

      const result = agentOperationsSource.transformOperationsStatus(operationsData);

      expect(result.length).toBe(2);
      const toolCall = result.find(op => op.id === 'tool_call');
      expect(toolCall?.status).toBe('running');
      expect(toolCall?.count).toBe(15); // 10 + 5
      const decision = result.find(op => op.id === 'decision');
      expect(decision?.status).toBe('idle');
    });
  });

  describe('fetchAll', () => {
    it('should combine all data sources and transform correctly', async () => {
      const mockAgents = [
        { agent: 'agent-1', totalRequests: 100, successRate: 0.95, avgConfidence: 0.92, avgRoutingTime: 1000 },
      ];
      const mockActions = [
        { id: 'action-1', agentId: 'agent-1', agentName: 'agent-1', action: 'test', status: 'completed', timestamp: '2024-01-01T00:00:00Z' },
      ];
      const mockHealth: HealthStatus = {
        status: 'healthy',
        services: [{ name: 'PostgreSQL', status: 'up' }],
      };
      const mockOperations = [
        { period: '2024-01-01T12:00:00Z', operationsPerMinute: 10, actionType: 'tool_call' },
      ];
      const mockQuality = [
        { period: '2024-01-01T12:00:00Z', avgQualityImprovement: 0.85 },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
          ['/api/intelligence/actions/recent', createMockResponse(mockActions)],
          ['/api/intelligence/health', createMockResponse(mockHealth)],
          ['/api/intelligence/metrics/operations-per-minute', createMockResponse(mockOperations)],
          ['/api/intelligence/metrics/quality-impact', createMockResponse(mockQuality)],
        ])
      );

      const result = await agentOperationsSource.fetchAll('24h');

      expect(result.summary).toBeDefined();
      expect(result.recentActions).toEqual(mockActions);
      expect(result.health).toEqual(mockHealth);
      expect(result.chartData.length).toBeGreaterThan(0);
      expect(result.qualityChartData.length).toBeGreaterThan(0);
      expect(result.operations.length).toBeGreaterThan(0);
      expect(result.totalOperations).toBeGreaterThan(0);
    });
  });
});

