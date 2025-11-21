/**
 * Mock Data Generator for Developer Experience Dashboard
 */

import { MockDataGenerator as Gen } from './config';

export interface DeveloperMetrics {
  workflows: {
    workflows: Array<{
      agent_name: string;
      total_workflows: number;
      successful_workflows: number;
      avg_duration_ms: number;
      improvement_percentage: number;
    }>;
    total_developers: number;
    total_code_generated: number;
  };
  velocity: {
    time_window: string;
    data: Array<{
      period: string;
      workflows_completed: number;
      avg_duration_ms: number;
    }>;
  };
  productivity: {
    time_window: string;
    data: Array<{
      period: string;
      productivity_score: number;
      code_generated: number;
    }>;
    avg_productivity_gain: number;
    pattern_reuse_rate: number;
  };
}

export class DeveloperExperienceMockData {
  /**
   * Generate mock workflow data
   */
  static generateWorkflows() {
    const agentNames = [
      'Code Generator',
      'Test Writer',
      'Documentation',
      'Refactoring',
      'Code Reviewer',
      'Bug Fixer',
      'API Designer',
      'Database Schema',
      'UI Component',
      'Performance Optimizer',
    ];

    const workflows = agentNames.map((agent_name) => {
      const total_workflows = Gen.randomInt(20, 200);
      const successful_workflows = Math.floor(total_workflows * Gen.randomFloat(0.85, 0.98));
      return {
        agent_name,
        total_workflows,
        successful_workflows,
        avg_duration_ms: Gen.randomInt(800, 5000),
        improvement_percentage: Gen.randomFloat(15, 45, 1),
      };
    });

    return {
      workflows,
      total_developers: Gen.randomInt(15, 35),
      total_code_generated: Gen.randomInt(50000, 150000),
    };
  }

  /**
   * Generate mock velocity data
   */
  static generateVelocity(dataPoints: number = 20) {
    const data = [];
    const now = new Date();

    for (let i = dataPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // Hourly
      data.push({
        period: timestamp.toISOString(),
        workflows_completed: Gen.randomInt(5, 30),
        avg_duration_ms: Gen.randomInt(1000, 4000),
      });
    }

    return {
      time_window: '24h',
      data,
    };
  }

  /**
   * Generate mock productivity data
   */
  static generateProductivity(dataPoints: number = 20) {
    const data = [];
    const now = new Date();

    for (let i = dataPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // Hourly
      data.push({
        period: timestamp.toISOString(),
        productivity_score: Gen.randomFloat(70, 95, 1),
        code_generated: Gen.randomInt(1000, 8000),
      });
    }

    return {
      time_window: '24h',
      data,
      avg_productivity_gain: Gen.randomFloat(25, 45, 1),
      pattern_reuse_rate: Gen.randomFloat(0.65, 0.85, 2),
    };
  }

  /**
   * Generate task velocity data
   */
  static generateTaskVelocity(dataPoints: number = 20) {
    const data = [];
    const now = new Date();

    for (let i = dataPoints - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000); // Daily
      const tasksCompleted = Gen.randomInt(10, 50);
      data.push({
        date: date.toISOString(),
        tasksCompleted,
        avgDurationMs: Gen.randomInt(1500, 6000),
        tasksPerDay: tasksCompleted,
      });
    }

    return data;
  }

  /**
   * Generate complete developer metrics
   */
  static generateAll(): DeveloperMetrics {
    return {
      workflows: this.generateWorkflows(),
      velocity: this.generateVelocity(20),
      productivity: this.generateProductivity(20),
    };
  }
}
