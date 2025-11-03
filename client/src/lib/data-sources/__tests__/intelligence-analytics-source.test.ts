import { describe, it, expect, beforeEach, vi } from 'vitest';
import { intelligenceAnalyticsSource } from '../intelligence-analytics-source';
import type { IntelligenceMetrics, RecentActivity, AgentPerformance, SavingsMetrics } from '../intelligence-analytics-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('IntelligenceAnalyticsDataSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchMetrics', () => {
    it('should return real metrics with weighted averages', async () => {
      const mockAgents = [
        {
          agent: 'agent-1',
          totalRequests: 1000,
          successRate: 0.95,
          avgRoutingTime: 1200,
          avgConfidence: 0.92,
        },
        {
          agent: 'agent-2',
          totalRequests: 500,
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

      const result = await intelligenceAnalyticsSource.fetchMetrics('24h');

      expect(result.isMock).toBe(false);
      expect(result.data.totalQueries).toBe(1500);
      // Weighted avg routing time: (1000 * 1200 + 500 * 800) / 1500 = 1066.67ms
      expect(result.data.avgResponseTime).toBeCloseTo(1066.67, 1);
      // Weighted success rate: (1000 * 0.95 + 500 * 0.88) / 1500 * 100 = 92.67%
      expect(result.data.successRate).toBeCloseTo(92.67, 1);
      expect(result.data.fallbackRate).toBeCloseTo(7.33, 1);
      expect(result.data.totalCost).toBe(1.5); // 1500 * 0.001
    });

    it('should use avgConfidence as fallback when successRate is null', async () => {
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

      const result = await intelligenceAnalyticsSource.fetchMetrics('24h');

      expect(result.data.successRate).toBeCloseTo(90, 1); // avgConfidence * 100
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchMetrics('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.totalQueries).toBe(15420);
      expect(result.data.successRate).toBe(94.0);
    });

    it('should handle empty agents array', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse([])],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchMetrics('24h');

      expect(result.isMock).toBe(true);
    });
  });

  describe('fetchRecentActivity', () => {
    it('should transform actions to recent activity format', async () => {
      const mockActions = [
        {
          id: 'action-1',
          agentName: 'agent-1',
          actionName: 'code-review',
          actionType: 'tool_call',
          durationMs: 5000,
          createdAt: '2024-01-01T12:00:00Z',
        },
        {
          id: 'action-2',
          agentName: 'agent-2',
          actionName: 'error-action',
          actionType: 'error',
          createdAt: '2024-01-01T11:00:00Z',
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse(mockActions)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchRecentActivity(5);

      expect(result.isMock).toBe(false);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].action).toBe('code-review');
      expect(result.data[0].agent).toBe('agent-1');
      expect(result.data[0].status).toBe('completed');
      expect(result.data[1].status).toBe('failed');
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchRecentActivity(5);

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

});

