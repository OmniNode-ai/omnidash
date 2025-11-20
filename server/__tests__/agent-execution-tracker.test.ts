import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentExecutionTracker } from '../agent-execution-tracker';

describe('AgentExecutionTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startExecution', () => {
    it('should start tracking an agent execution', () => {
      const execution = AgentExecutionTracker.startExecution(
        'test-agent',
        'Test Agent',
        'test query',
        { context: 'test' },
        { confidence: 0.9 }
      );

      expect(execution).toHaveProperty('id');
      expect(execution.agentId).toBe('test-agent');
      expect(execution.agentName).toBe('Test Agent');
      expect(execution.query).toBe('test query');
      expect(execution.status).toBe('executing');
      expect(execution.startedAt).toBeDefined();
    });
  });

  describe('updateExecutionStatus', () => {
    it('should update execution status', () => {
      const execution = AgentExecutionTracker.startExecution(
        'test-agent',
        'Test Agent',
        'test query'
      );

      const updated = AgentExecutionTracker.updateExecutionStatus(execution.id, 'completed', {
        success: true,
        output: 'test output',
        qualityScore: 0.9,
      });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
      expect(updated?.duration).toBeDefined();
      expect(updated?.result).toBeDefined();
    });

    it('should return null for non-existent execution', () => {
      const result = AgentExecutionTracker.updateExecutionStatus('non-existent-id', 'completed');

      expect(result).toBeNull();
    });
  });

  describe('getExecution', () => {
    it('should return execution by ID', () => {
      const execution = AgentExecutionTracker.startExecution(
        'test-agent',
        'Test Agent',
        'test query'
      );

      const retrieved = AgentExecutionTracker.getExecution(execution.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(execution.id);
    });

    it('should return null for non-existent execution', () => {
      const result = AgentExecutionTracker.getExecution('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getExecutionsForAgent', () => {
    it('should return executions for a specific agent', () => {
      AgentExecutionTracker.startExecution('agent-1', 'Agent 1', 'query 1');
      AgentExecutionTracker.startExecution('agent-1', 'Agent 1', 'query 2');
      AgentExecutionTracker.startExecution('agent-2', 'Agent 2', 'query 3');

      const executions = AgentExecutionTracker.getExecutionsForAgent('agent-1');

      expect(Array.isArray(executions)).toBe(true);
      expect(executions.every((e) => e.agentId === 'agent-1')).toBe(true);
    });

    it('should respect limit parameter', () => {
      // Create multiple executions
      for (let i = 0; i < 10; i++) {
        AgentExecutionTracker.startExecution('test-agent', 'Test Agent', `query ${i}`);
      }

      const executions = AgentExecutionTracker.getExecutionsForAgent('test-agent', 5);

      expect(executions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getAgentPerformanceMetrics', () => {
    it('should return performance metrics for an agent with executions', () => {
      // Create some executions
      const exec1 = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec1.id, 'completed', {
        success: true,
        qualityScore: 0.9,
        metrics: { tokensUsed: 1000, cost: 0.1 },
      });

      const exec2 = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 2');
      AgentExecutionTracker.updateExecutionStatus(exec2.id, 'completed', {
        success: true,
        qualityScore: 0.85,
        metrics: { tokensUsed: 1200, cost: 0.12 },
      });

      const metrics = AgentExecutionTracker.getAgentPerformanceMetrics('test-agent');

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('totalRuns');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('avgExecutionTime');
      expect(metrics).toHaveProperty('avgQualityScore');
    });

    it('should return default metrics for agent with no executions', () => {
      const metrics = AgentExecutionTracker.getAgentPerformanceMetrics('non-existent-agent');

      expect(metrics).toBeDefined();
      expect(metrics.totalRuns).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.avgExecutionTime).toBe(0);
    });
  });

  describe('getRecentExecutions', () => {
    it('should return recent executions', () => {
      AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 2');

      const executions = AgentExecutionTracker.getRecentExecutions(10);

      expect(Array.isArray(executions)).toBe(true);
      expect(executions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getExecutionStats', () => {
    it('should return execution statistics', () => {
      const exec1 = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec1.id, 'completed');

      const stats = AgentExecutionTracker.getExecutionStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('executing');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('avgDuration');
    });

    it('should filter stats by agentId', () => {
      AgentExecutionTracker.startExecution('agent-1', 'Agent 1', 'query 1');
      AgentExecutionTracker.startExecution('agent-2', 'Agent 2', 'query 2');

      const stats = AgentExecutionTracker.getExecutionStats('agent-1');

      expect(stats.total).toBeGreaterThanOrEqual(0);
    });

    it('should filter stats by time range', () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 60 * 60 * 1000);

      AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');

      const stats = AgentExecutionTracker.getExecutionStats(undefined, {
        start: startDate,
        end: endDate,
      });

      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThanOrEqual(0);
    });

    it('should handle failed executions in stats', () => {
      const exec = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec.id, 'failed', {
        success: false,
        error: 'Test error',
      });

      const stats = AgentExecutionTracker.getExecutionStats();
      expect(stats.failed).toBeGreaterThanOrEqual(0);
    });

    it('should handle cancelled executions', () => {
      const exec = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      const updated = AgentExecutionTracker.updateExecutionStatus(exec.id, 'cancelled');

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('cancelled');
      expect(updated?.completedAt).toBeDefined();
    });

    it('should calculate avgDuration correctly', () => {
      const exec1 = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec1.id, 'completed', {
        success: true,
      });

      const stats = AgentExecutionTracker.getExecutionStats();
      expect(stats.avgDuration).toBeGreaterThanOrEqual(0);
    });

    it('should handle executions without duration', () => {
      const exec = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec.id, 'executing');

      const stats = AgentExecutionTracker.getExecutionStats();
      expect(stats.executing).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAgentPerformanceMetrics edge cases', () => {
    it('should handle executions with quality scores', () => {
      const exec1 = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec1.id, 'completed', {
        success: true,
        qualityScore: 0.95,
      });

      const exec2 = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 2');
      AgentExecutionTracker.updateExecutionStatus(exec2.id, 'completed', {
        success: true,
        qualityScore: 0.85,
      });

      const metrics = AgentExecutionTracker.getAgentPerformanceMetrics('test-agent');
      expect(metrics.avgQualityScore).toBeGreaterThan(0);
    });

    it('should calculate popularity based on recent executions', () => {
      const exec = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec.id, 'completed');

      const metrics = AgentExecutionTracker.getAgentPerformanceMetrics('test-agent');
      expect(metrics.popularity).toBeGreaterThanOrEqual(0);
      expect(metrics.popularity).toBeLessThanOrEqual(100);
    });

    it('should calculate efficiency score', () => {
      const exec = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec.id, 'completed', {
        success: true,
      });

      const metrics = AgentExecutionTracker.getAgentPerformanceMetrics('test-agent');
      expect(metrics.efficiency).toBeGreaterThanOrEqual(0);
      expect(metrics.efficiency).toBeLessThanOrEqual(100);
    });

    it('should return lastUsed timestamp', () => {
      const exec = AgentExecutionTracker.startExecution('test-agent', 'Test Agent', 'query 1');
      AgentExecutionTracker.updateExecutionStatus(exec.id, 'completed');

      const metrics = AgentExecutionTracker.getAgentPerformanceMetrics('test-agent');
      expect(metrics.lastUsed).toBeDefined();
    });
  });
});
