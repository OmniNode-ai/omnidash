/**
 * Mock Data Generator for Agent Management Dashboard
 */

import { MockDataGenerator as Gen } from './config';
import type {
  AgentSummary,
  RoutingStats,
  AgentExecution,
  RoutingDecision,
} from '../data-sources/agent-management-source';

export class AgentManagementMockData {
  /**
   * Generate mock agent summary aligned with YC demo script metrics
   */
  static generateSummary(): AgentSummary {
    return {
      totalAgents: Gen.randomInt(12, 18),
      activeAgents: Gen.randomInt(10, 15),
      totalRuns: Gen.randomInt(1000, 1500), // ~1200 requests/day for demo
      successRate: Gen.randomFloat(92, 96, 1), // 94% success rate from script
      avgExecutionTime: Gen.randomFloat(0.8, 1.8, 2), // 1.2s avg response time from script
      totalSavings: Gen.randomInt(40000, 50000),
    };
  }

  /**
   * Generate mock routing statistics aligned with YC demo script
   */
  static generateRoutingStats(): RoutingStats {
    const totalDecisions = Gen.randomInt(14000, 16000);
    const avgConfidence = Gen.randomFloat(0.92, 0.96, 3);

    // Generate top agents
    const agentNames = [
      'Polymorphic Agent',
      'Code Reviewer',
      'Test Generator',
      'Documentation Agent',
      'Refactoring Agent',
      'Security Analyzer',
      'Performance Optimizer',
      'API Designer',
    ];

    const topAgents = Gen.randomItems(agentNames, 5).map((name) => ({
      agentId: name.toLowerCase().replace(/\s+/g, '-'),
      agentName: name,
      usage: Gen.randomInt(100, 600),
      successRate: Gen.randomFloat(90, 98, 1),
    }));

    // Sort by usage descending
    topAgents.sort((a, b) => b.usage - a.usage);

    return {
      totalDecisions,
      avgConfidence,
      avgRoutingTime: Gen.randomFloat(40, 50, 0), // 45ms from demo script
      accuracy: Gen.randomFloat(92, 96, 1), // 94.2% from demo script
      strategyBreakdown: {
        enhanced_fuzzy_matching: Gen.randomInt(9000, 11000),
        exact_match: Gen.randomInt(3000, 4000),
        capability_alignment: Gen.randomInt(1000, 1500),
        fallback: Gen.randomInt(500, 1000),
      },
      topAgents,
    };
  }

  /**
   * Generate mock recent executions
   */
  static generateRecentExecutions(count: number = 10): AgentExecution[] {
    const executions: AgentExecution[] = [];
    const agentNames = [
      'Polymorphic Agent',
      'Code Reviewer',
      'Test Generator',
      'Documentation Agent',
      'Refactoring Agent',
      'Security Analyzer',
      'Performance Optimizer',
      'API Designer',
    ];

    const queries = [
      'Refactor user authentication module',
      'Generate unit tests for payment service',
      'Review API endpoint security',
      'Optimize database query performance',
      'Update documentation for new features',
      'Analyze code complexity metrics',
      'Generate TypeScript types from schema',
      'Review pull request changes',
      'Create integration tests',
      'Audit third-party dependencies',
    ];

    for (let i = 0; i < count; i++) {
      const agentName = Gen.randomItem(agentNames);
      const status = Gen.randomItem([
        'completed',
        'completed',
        'completed',
        'completed',
        'executing',
        'failed',
      ] as const);
      const startedAt = Gen.pastTimestamp(60);
      const duration = status === 'completed' ? Gen.randomInt(500, 5000) : undefined;
      const completedAt =
        status === 'completed'
          ? new Date(new Date(startedAt).getTime() + (duration || 0)).toISOString()
          : undefined;

      executions.push({
        id: Gen.uuid(),
        agentId: agentName.toLowerCase().replace(/\s+/g, '-'),
        agentName,
        query: Gen.randomItem(queries),
        status,
        startedAt,
        completedAt,
        duration: duration ? duration / 1000 : undefined,
        result:
          status === 'completed'
            ? {
                success: true,
                output: 'Task completed successfully',
                qualityScore: Gen.randomFloat(7.5, 9.5, 1),
              }
            : status === 'failed'
              ? {
                  success: false,
                  output: 'Execution failed due to timeout',
                }
              : undefined,
      });
    }

    // Sort by startedAt (most recent first)
    return executions.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  /**
   * Generate mock routing decisions
   */
  static generateRecentDecisions(count: number = 10): RoutingDecision[] {
    const decisions: RoutingDecision[] = [];
    const agentNames = [
      'Polymorphic Agent',
      'Code Reviewer',
      'Test Generator',
      'Documentation Agent',
      'Refactoring Agent',
      'Security Analyzer',
      'Performance Optimizer',
      'API Designer',
    ];

    const queries = [
      'Refactor user authentication module',
      'Generate unit tests for payment service',
      'Review API endpoint security',
      'Optimize database query performance',
      'Update documentation for new features',
      'Analyze code complexity metrics',
      'Generate TypeScript types from schema',
      'Review pull request changes',
      'Create integration tests',
      'Audit third-party dependencies',
    ];

    const strategies = [
      'enhanced_fuzzy_matching',
      'exact_match',
      'capability_alignment',
      'fallback',
    ];

    for (let i = 0; i < count; i++) {
      const selectedAgent = Gen.randomItem(agentNames);
      const confidenceScore = Gen.randomFloat(0.75, 0.99, 2);

      // Generate alternatives (other agents with lower confidence)
      const alternatives = Gen.randomItems(
        agentNames.filter((name) => name !== selectedAgent),
        Gen.randomInt(2, 4)
      ).map((agent) => ({
        agent,
        confidence: Gen.randomFloat(0.4, confidenceScore - 0.1, 2),
      }));

      // Sort alternatives by confidence descending
      alternatives.sort((a, b) => b.confidence - a.confidence);

      decisions.push({
        id: Gen.uuid(),
        correlationId: Gen.uuid(),
        userRequest: Gen.randomItem(queries),
        selectedAgent,
        confidenceScore,
        routingStrategy: Gen.randomItem(strategies),
        alternatives,
        reasoning: `Selected ${selectedAgent} based on ${Gen.randomItem(strategies).replace('_', ' ')} with high confidence`,
        routingTimeMs: Gen.randomInt(30, 80),
        createdAt: Gen.pastTimestamp(60),
      });
    }

    // Sort by createdAt (most recent first)
    return decisions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Generate complete agent management data
   */
  static generateAll() {
    return {
      summary: this.generateSummary(),
      routingStats: this.generateRoutingStats(),
      recentExecutions: this.generateRecentExecutions(10),
      recentDecisions: this.generateRecentDecisions(10),
      isMock: true,
    };
  }
}
