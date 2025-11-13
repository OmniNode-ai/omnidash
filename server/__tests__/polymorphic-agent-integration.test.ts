import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentExecutionTracker } from '../agent-execution-tracker';
import { PolymorphicAgentIntegration } from '../polymorphic-agent-integration';

vi.mock('../agent-execution-tracker', () => {
  const startExecution = vi.fn();
  const updateExecutionStatus = vi.fn();
  const getRecentExecutions = vi.fn();
  const getAgentPerformanceMetrics = vi.fn();
  const getExecutionsForAgent = vi.fn();
  return {
    AgentExecutionTracker: {
      startExecution,
      updateExecutionStatus,
      getRecentExecutions,
      getAgentPerformanceMetrics,
      getExecutionsForAgent,
    },
  };
});

describe('PolymorphicAgentIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('simulateRoutingDecision', () => {
    it('should route API-related queries to api-architect', async () => {
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Create a REST API endpoint',
        {}
      );

      expect(decision.selectedAgent).toBe('agent-api-architect');
      expect(decision.confidence).toBeGreaterThan(0.8);
      expect(decision.strategy).toBe('enhanced_fuzzy_matching');
    });

    it('should route debug queries to debug-intelligence', async () => {
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Debug this error in my code',
        {}
      );

      expect(decision.selectedAgent).toBe('agent-debug-intelligence');
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should route frontend queries to frontend-developer', async () => {
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Build a React component',
        {}
      );

      expect(decision.selectedAgent).toBe('agent-frontend-developer');
      expect(decision.confidence).toBeGreaterThan(0.9);
      expect(decision.strategy).toBe('exact_trigger_match');
    });

    it('should route performance queries to performance agent', async () => {
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Optimize this slow function',
        {}
      );

      expect(decision.selectedAgent).toBe('agent-performance');
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should route test queries to testing agent', async () => {
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Write tests for this function',
        {}
      );

      expect(decision.selectedAgent).toBe('agent-testing');
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should use polymorphic agent as fallback', async () => {
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Do something generic',
        {}
      );

      expect(decision.selectedAgent).toBe('agent-polymorphic-agent');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.5);
      expect(decision.strategy).toBe('fallback_routing');
    });

    it('should include alternatives in decision', async () => {
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Create an API endpoint',
        {}
      );

      expect(decision.alternatives).toBeDefined();
      expect(Array.isArray(decision.alternatives)).toBe(true);
      expect(decision.alternatives.length).toBeLessThanOrEqual(3);
    });

    it('should include routing time', async () => {
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Test query',
        {}
      );

      expect(decision.routingTime).toBeDefined();
      expect(typeof decision.routingTime).toBe('number');
      expect(decision.routingTime).toBeGreaterThanOrEqual(0);
    });

    it('should include context in decision', async () => {
      const context = { userId: '123', projectId: '456' };
      const decision = await PolymorphicAgentIntegration.simulateRoutingDecision(
        'Test query',
        context
      );

      expect(decision.context).toEqual(context);
    });
  });

  describe('executeAgent', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(AgentExecutionTracker.startExecution).mockReturnValue({ id: 'exec-1' } as any);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should update execution tracker and return result payload', async () => {
      const decision = {
        query: 'Process data',
        selectedAgent: 'agent-testing',
        confidence: 0.9,
        strategy: 'enhanced_fuzzy_matching',
        alternatives: [],
        reasoning: 'Test case',
        routingTime: 12,
        context: { ticketId: 'T-123' },
      };

      const promise = PolymorphicAgentIntegration.executeAgent(decision as any);
      vi.advanceTimersByTime(5000);
      const result = await promise;

      expect(vi.mocked(AgentExecutionTracker.startExecution)).toHaveBeenCalledWith(
        'agent-testing',
        expect.stringContaining('testing'),
        'Process data',
        { ticketId: 'T-123' },
        decision
      );
      expect(vi.mocked(AgentExecutionTracker.updateExecutionStatus)).toHaveBeenCalled();
      expect(result).toHaveProperty('executionId', 'exec-1');
      expect(result).toHaveProperty('result');
    });

    it('should handle failure execution path', async () => {
      vi.mocked(AgentExecutionTracker.startExecution).mockReturnValue({ id: 'exec-2' } as any);
      const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => 0.05);

      const decision = {
        query: 'Process data',
        selectedAgent: 'agent-testing',
        confidence: 0.4,
        strategy: 'fallback',
        alternatives: [],
        reasoning: 'Test failure path',
        routingTime: 10,
        context: undefined,
      };

      const promise = PolymorphicAgentIntegration.executeAgent(decision as any);
      vi.advanceTimersByTime(5000);
      const result = await promise;

      expect(result.result.success).toBe(false);
      expect(vi.mocked(AgentExecutionTracker.updateExecutionStatus)).toHaveBeenCalledWith(
        'exec-2',
        'failed',
        expect.objectContaining({ success: false })
      );

      randomSpy.mockRestore();
    });
  });

  describe('getRoutingStatistics', () => {
    it('should compute averages and success rates from tracker data', () => {
      vi.mocked(AgentExecutionTracker.getRecentExecutions).mockReturnValue([
        {
          agentId: 'agent-api-architect',
          status: 'completed',
          result: { success: true },
          routingDecision: { confidence: 0.9, routingTime: 50, strategy: 'enhanced_fuzzy_matching' },
        },
        {
          agentId: 'agent-api-architect',
          status: 'failed',
          result: { success: false },
          routingDecision: { confidence: 0.7, routingTime: 70, strategy: 'fallback_routing' },
        },
      ]);

      const stats = PolymorphicAgentIntegration.getRoutingStatistics();

      expect(stats.totalDecisions).toBe(2);
      expect(stats.avgConfidence).toBeCloseTo(0.8);
      expect(stats.avgRoutingTime).toBeCloseTo(60);
      expect(stats.successRate).toBeCloseTo(50);
      expect(stats.strategyBreakdown).toHaveProperty('enhanced_fuzzy_matching');
    });

    it('should return defaults when no executions recorded', () => {
      vi.mocked(AgentExecutionTracker.getRecentExecutions).mockReturnValue([]);

      const stats = PolymorphicAgentIntegration.getRoutingStatistics();

      expect(stats.totalDecisions).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('getAgentPerformanceComparison', () => {
    it('should include performance metrics and routing stats per agent', () => {
      vi.mocked(AgentExecutionTracker.getAgentPerformanceMetrics).mockReturnValue({
        avgQualityScore: 0.95,
        popularity: 80,
        efficiency: 75,
        lastUsed: Date.now(),
      });
      vi.mocked(AgentExecutionTracker.getExecutionsForAgent).mockReturnValue([
        {
          routingDecision: { confidence: 0.9, routingTime: 40 },
        },
        {
          routingDecision: { confidence: 0.7, routingTime: 60 },
        },
      ]);

      const comparison = PolymorphicAgentIntegration.getAgentPerformanceComparison();

      expect(comparison.length).toBeGreaterThan(0);
      expect(comparison[0]).toHaveProperty('performance');
      expect(comparison[0].routingStats.avgConfidence).toBeGreaterThan(0);
    });
  });
});

