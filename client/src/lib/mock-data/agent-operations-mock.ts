/**
 * Mock Data Generator for Agent Operations Dashboard
 */

import { MockDataGenerator as Gen } from './config';
import type {
  AgentSummary,
  RecentAction,
  HealthStatus,
  ChartDataPoint,
  OperationStatus,
} from '../data-sources/agent-operations-source';

export class AgentOperationsMockData {
  /**
   * Generate mock agent summary
   */
  static generateSummary(): AgentSummary {
    const totalAgents = Gen.randomInt(45, 60);
    const activeAgents = Gen.randomInt(Math.floor(totalAgents * 0.7), totalAgents);
    const totalRuns = Gen.randomInt(1000, 5000);
    const successRate = Gen.randomFloat(85, 98, 1);
    const avgExecutionTime = Gen.randomFloat(0.5, 3.5, 2);

    return {
      totalAgents,
      activeAgents,
      totalRuns,
      successRate,
      avgExecutionTime,
    };
  }

  /**
   * Generate mock recent actions
   */
  static generateRecentActions(count: number = 50): RecentAction[] {
    const actions: RecentAction[] = [];
    const actionTypes = [
      'File Analysis',
      'Code Generation',
      'Test Execution',
      'Documentation Update',
      'Refactoring',
      'Security Scan',
      'Performance Check',
      'Deployment',
      'Code Review',
      'Bug Fix',
    ];

    for (let i = 0; i < count; i++) {
      const agentName = Gen.agentName();
      const status = Gen.status(0.85);

      actions.push({
        id: Gen.uuid(),
        agentId: `agent-${Gen.randomInt(1, 52)}`,
        agentName,
        action: Gen.randomItem(actionTypes),
        status,
        timestamp: Gen.pastTimestamp(60),
        duration: Gen.randomInt(100, 5000),
      });
    }

    // Sort by timestamp (most recent first)
    return actions.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Generate mock health status
   */
  static generateHealth(): HealthStatus {
    const services = [
      { name: 'PostgreSQL', status: 'up', latency: Gen.randomInt(5, 25) },
      { name: 'OmniArchon', status: 'up', latency: Gen.randomInt(10, 50) },
      { name: 'Qdrant', status: 'up', latency: Gen.randomInt(15, 45) },
      { name: 'Kafka', status: 'up', latency: Gen.randomInt(8, 30) },
      { name: 'Redis', status: 'up', latency: Gen.randomInt(3, 15) },
    ];

    // Randomly make one service degraded (10% chance)
    if (Math.random() < 0.1) {
      const idx = Gen.randomInt(0, services.length - 1);
      services[idx].status = 'degraded';
      services[idx].latency = Gen.randomInt(100, 300);
    }

    return {
      status: 'healthy',
      services,
    };
  }

  /**
   * Generate mock chart data for operations per minute
   */
  static generateOperationsChart(dataPoints: number = 20): ChartDataPoint[] {
    return Gen.generateTimeSeries(dataPoints, 10, 50, 1);
  }

  /**
   * Generate mock chart data for quality improvement
   */
  static generateQualityChart(dataPoints: number = 20): ChartDataPoint[] {
    return Gen.generateTimeSeries(dataPoints, 70, 95, 1);
  }

  /**
   * Generate mock operation statuses
   */
  static generateOperations(count: number = 8): OperationStatus[] {
    const operationNames = [
      'Pattern Discovery',
      'Manifest Generation',
      'Code Analysis',
      'Test Generation',
      'Documentation',
      'Refactoring',
      'Security Audit',
      'Performance Optimization',
      'Deployment',
      'Monitoring',
    ];

    return Gen.randomItems(operationNames, count).map((name) => {
      const isRunning = Math.random() > 0.3;
      return {
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        status: isRunning ? ('running' as const) : ('idle' as const),
        count: isRunning ? Gen.randomInt(5, 50) : 0,
        avgTime: isRunning ? `${Gen.randomFloat(0.5, 5, 1)}s` : 'N/A',
      };
    });
  }

  /**
   * Generate complete agent operations data
   */
  static generateAll() {
    const summary = this.generateSummary();
    const recentActions = this.generateRecentActions(50);
    const health = this.generateHealth();
    const chartData = this.generateOperationsChart(20);
    const qualityChartData = this.generateQualityChart(20);
    const operations = this.generateOperations(8);

    const totalOperations = operations.length;
    const runningOperations = operations.filter((op) => op.status === 'running').length;
    const totalOpsPerMinute = chartData[chartData.length - 1]?.value || 0;
    const avgQualityImprovement =
      qualityChartData.reduce((sum, d) => sum + d.value, 0) / qualityChartData.length;

    return {
      summary,
      recentActions,
      health,
      chartData,
      qualityChartData,
      operations,
      totalOperations,
      runningOperations,
      totalOpsPerMinute,
      avgQualityImprovement,
      isMock: true,
    };
  }
}
