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

    it('should handle actions without durationMs as executing', async () => {
      const mockActions = [
        {
          id: 'action-1',
          agentName: 'agent-1',
          actionName: 'in-progress-action',
          actionType: 'tool_call',
          createdAt: new Date().toISOString(),
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse(mockActions)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchRecentActivity(5);

      expect(result.data[0].status).toBe('executing');
    });

    it('should fallback to agent executions API when actions API fails', async () => {
      const mockExecutions = [
        {
          id: 'exec-1',
          agentName: 'agent-test',
          agentId: 'agent-id-1',
          query: 'Test query',
          actionName: 'Test action',
          status: 'completed' as const,
          startedAt: new Date().toISOString(),
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse(null, { status: 500 })],
          ['/api/agents/executions', createMockResponse(mockExecutions)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchRecentActivity(5);

      expect(result.isMock).toBe(false);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].action).toBe('Test query');
      expect(result.data[0].agent).toBe('agent-test');
      expect(result.data[0].status).toBe('completed');
    });

    it('should handle executions with fallback fields', async () => {
      const mockExecutions = [
        {
          id: 'exec-1',
          agentId: 'fallback-agent-id',
          status: 'pending' as const,
          startedAt: new Date().toISOString(),
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse(null, { status: 500 })],
          ['/api/agents/executions', createMockResponse(mockExecutions)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchRecentActivity(5);

      expect(result.data[0].action).toBe('Task execution');
      expect(result.data[0].agent).toBe('fallback-agent-id');
    });

    it('should return mock data when both APIs fail', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse(null, { status: 500 })],
          ['/api/agents/executions', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchRecentActivity(5);

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle empty arrays from executions API', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/actions/recent', createMockResponse([])],
          ['/api/agents/executions', createMockResponse([])],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchRecentActivity(5);

      expect(result.isMock).toBe(true);
    });
  });

  describe('fetchAgentPerformance', () => {
    it('should transform agents to performance metrics with decimal format', async () => {
      const mockAgents = [
        {
          agent: 'polymorphic-agent',
          totalRequests: 456,
          successRate: 0.952,
          avgConfidence: 0.89,
          avgRoutingTime: 1200,
          avgTokens: 5000,
        },
        {
          agent: 'code-reviewer',
          totalRequests: 234,
          successRate: 0.925,
          avgConfidence: 0.85,
          avgRoutingTime: 1800,
          avgTokens: 7000,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toHaveLength(2);

      const polymorphic = result.data[0];
      expect(polymorphic.agentId).toBe('polymorphic-agent');
      expect(polymorphic.agentName).toBe('Polymorphic Agent');
      expect(polymorphic.totalRuns).toBe(456);
      expect(polymorphic.successRate).toBeCloseTo(95.2, 1); // Converted from 0.952
      expect(polymorphic.avgResponseTime).toBe(1200);
      expect(polymorphic.avgExecutionTime).toBe(1200);
      expect(polymorphic.efficiency).toBeCloseTo(95.2, 1);
      expect(polymorphic.avgQualityScore).toBeCloseTo(8.9, 1); // avgConfidence * 10
      expect(polymorphic.popularity).toBe(456);
      expect(polymorphic.costPerSuccess).toBeCloseTo(0.005, 3); // 0.001 * 5000 / 1000
      expect(polymorphic.p95Latency).toBe(1800); // avgRoutingTime * 1.5
      expect(polymorphic.lastUsed).toBeDefined();
    });

    it('should handle percentage format (values > 1)', async () => {
      const mockAgents = [
        {
          agent: 'test-agent',
          totalRequests: 100,
          successRate: 95.0, // Already in percentage format
          avgConfidence: 0.9,
          avgRoutingTime: 1000,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.data[0].successRate).toBe(95.0); // Should not be multiplied by 100
    });

    it('should use avgConfidence when successRate is null', async () => {
      const mockAgents = [
        {
          agent: 'test-agent',
          totalRequests: 100,
          successRate: null,
          avgConfidence: 0.88,
          avgRoutingTime: 1000,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.data[0].successRate).toBeCloseTo(88.0, 1);
    });

    it('should clamp success rate to 0-100 range', async () => {
      const mockAgents = [
        {
          agent: 'overperformer',
          totalRequests: 100,
          successRate: 150, // Invalid, should be clamped to 100
          avgRoutingTime: 1000,
        },
        {
          agent: 'underperformer',
          totalRequests: 50,
          successRate: -10, // Invalid, should be clamped to 0
          avgRoutingTime: 1000,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.data[0].successRate).toBe(100);
      expect(result.data[1].successRate).toBe(0);
    });

    it('should ensure all numeric values are non-negative', async () => {
      const mockAgents = [
        {
          agent: 'negative-agent',
          totalRequests: -5, // Invalid
          avgRoutingTime: -100, // Invalid
          avgConfidence: 0.8,
          avgTokens: -1000, // Invalid
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.data[0].totalRuns).toBeGreaterThanOrEqual(0);
      expect(result.data[0].avgResponseTime).toBeGreaterThanOrEqual(0);
      expect(result.data[0].avgExecutionTime).toBeGreaterThanOrEqual(0);
      expect(result.data[0].costPerSuccess).toBeGreaterThanOrEqual(0);
      expect(result.data[0].p95Latency).toBeGreaterThanOrEqual(0);
    });

    it('should handle agents with missing optional fields', async () => {
      const mockAgents = [
        {
          agent: 'minimal-agent',
          totalRequests: 50,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.data[0].agentId).toBe('minimal-agent');
      expect(result.data[0].successRate).toBe(0);
      expect(result.data[0].avgQualityScore).toBe(0);
    });

    it('should transform agent names correctly', async () => {
      const mockAgents = [
        { agent: 'agent-frontend-developer', totalRequests: 10 },
        { agent: 'test-generator', totalRequests: 5 },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(mockAgents)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.data[0].agentName).toBe('Frontend Developer');
      expect(result.data[1].agentName).toBe('Test Generator');
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].agentId).toBeDefined();
    });

    it('should return mock data for empty agents array', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/agents/summary', createMockResponse([])],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchAgentPerformance('24h');

      expect(result.isMock).toBe(true);
    });
  });

  describe('fetchSavingsMetrics', () => {
    it('should return real savings metrics from API', async () => {
      const mockSavings: SavingsMetrics = {
        totalSavings: 50000,
        monthlySavings: 12000,
        weeklySavings: 2800,
        dailySavings: 400,
        intelligenceRuns: 15000,
        baselineRuns: 25000,
        avgTokensPerRun: 3200,
        avgComputePerRun: 1.2,
        costPerToken: 0.000002,
        costPerCompute: 0.05,
        efficiencyGain: 35.5,
        timeSaved: 180,
      };

      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(mockSavings)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchSavingsMetrics('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockSavings);
    });

    it('should validate required fields exist', async () => {
      const incompleteSavings = {
        totalSavings: 50000,
        monthlySavings: 12000,
        // Missing required fields
      };

      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(incompleteSavings)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchSavingsMetrics('24h');

      expect(result.isMock).toBe(true); // Falls back to mock due to validation failure
    });

    it('should allow negative savings values (for regression detection)', async () => {
      const regressionSavings: SavingsMetrics = {
        totalSavings: -5000,
        monthlySavings: -1200,
        weeklySavings: -280,
        dailySavings: -40,
        intelligenceRuns: 15000,
        baselineRuns: 25000,
        avgTokensPerRun: 3200,
        avgComputePerRun: 1.2,
        costPerToken: 0.000002,
        costPerCompute: 0.05,
        efficiencyGain: -10.5, // Regression
        timeSaved: -20, // Taking longer
      };

      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(regressionSavings)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchSavingsMetrics('24h');

      expect(result.isMock).toBe(false);
      expect(result.data.totalSavings).toBe(-5000);
      expect(result.data.timeSaved).toBe(-20);
    });

    it('should reject savings data with invalid run counts', async () => {
      const invalidSavings = {
        totalSavings: 50000,
        monthlySavings: 12000,
        weeklySavings: 2800,
        dailySavings: 400,
        intelligenceRuns: -100, // Invalid: negative run count
        baselineRuns: 25000,
        timeSaved: 180,
      };

      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(invalidSavings)],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchSavingsMetrics('24h');

      expect(result.isMock).toBe(true); // Falls back due to validation
    });

    it('should reject non-object responses', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse('invalid string')],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchSavingsMetrics('24h');

      expect(result.isMock).toBe(true);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchSavingsMetrics('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.totalSavings).toBeGreaterThan(0);
      expect(result.data.dailySavings).toBeGreaterThan(0);
      expect(result.data.weeklySavings).toBeGreaterThan(result.data.dailySavings * 7);
      expect(result.data.monthlySavings).toBeGreaterThan(result.data.weeklySavings * 4);
      expect(result.data.efficiencyGain).toBeGreaterThanOrEqual(15);
      expect(result.data.efficiencyGain).toBeLessThanOrEqual(45);
      expect(result.data.timeSaved).toBeGreaterThanOrEqual(10);
    });

    it('should handle malformed JSON responses', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/metrics', new Error('Network error')],
        ])
      );

      const result = await intelligenceAnalyticsSource.fetchSavingsMetrics('24h');

      expect(result.isMock).toBe(true);
    });
  });

});

