/**
 * Mock Data Generator for Intelligence Operations Dashboard
 */

import { MockDataGenerator as Gen } from './config';

export interface ManifestInjectionHealth {
  successRate: number;
  avgLatencyMs: number;
  failedInjections: Array<{
    errorType: string;
    count: number;
    lastOccurrence: string;
  }>;
  manifestSizeStats: {
    avgSizeKb: number;
    minSizeKb: number;
    maxSizeKb: number;
  };
  latencyTrend: Array<{
    period: string;
    avgLatencyMs: number;
    count: number;
  }>;
  serviceHealth: {
    postgresql: { status: 'up' | 'down'; latencyMs?: number };
    omniarchon: { status: 'up' | 'down'; latencyMs?: number };
    qdrant: { status: 'up' | 'down'; latencyMs?: number };
  };
}

export interface OperationsPerMinute {
  period: string;
  operationsPerMinute: number;
  actionType: string;
}

export interface QualityImpact {
  period: string;
  avgQualityImprovement: number;
  manifestsImproved: number;
}

export interface AgentAction {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: string;
  actionName: string;
  actionDetails?: any;
  debugMode?: boolean;
  durationMs: number;
  createdAt: string;
}

export interface TopAccessedDocument {
  id: string;
  repository: string;
  filePath: string;
  accessCount: number;
  lastAccessedAt: string | null;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

export interface LiveEvent {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  timestamp: string;
  source: string;
}

export class IntelligenceOperationsMockData {
  /**
   * Generate mock manifest injection health
   */
  static generateManifestHealth(): ManifestInjectionHealth {
    const errorTypes = [
      'timeout',
      'validation_error',
      'connection_error',
      'rate_limit',
      'parse_error',
    ];

    const failedInjections = errorTypes.slice(0, Gen.randomInt(1, 3)).map((errorType) => ({
      errorType,
      count: Gen.randomInt(1, 15),
      lastOccurrence: Gen.pastTimestamp(240),
    }));

    const latencyTrend = [];
    const now = new Date();
    for (let i = 19; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      latencyTrend.push({
        period: timestamp.toISOString(),
        avgLatencyMs: Gen.randomInt(150, 500),
        count: Gen.randomInt(10, 50),
      });
    }

    return {
      successRate: Gen.randomFloat(0.92, 0.99, 3),
      avgLatencyMs: Gen.randomInt(200, 450),
      failedInjections,
      manifestSizeStats: {
        avgSizeKb: Gen.randomFloat(45, 120, 1),
        minSizeKb: Gen.randomFloat(15, 40, 1),
        maxSizeKb: Gen.randomFloat(150, 300, 1),
      },
      latencyTrend,
      serviceHealth: {
        postgresql: {
          status: Math.random() > 0.05 ? 'up' : 'down',
          latencyMs: Gen.randomInt(10, 50),
        },
        omniarchon: {
          status: Math.random() > 0.05 ? 'up' : 'down',
          latencyMs: Gen.randomInt(30, 100),
        },
        qdrant: {
          status: Math.random() > 0.05 ? 'up' : 'down',
          latencyMs: Gen.randomInt(20, 80),
        },
      },
    };
  }

  /**
   * Generate mock operations per minute
   */
  static generateOperationsPerMinute(dataPoints: number = 20): OperationsPerMinute[] {
    const operations: OperationsPerMinute[] = [];
    const actionTypes = [
      'pattern_discovery',
      'manifest_generation',
      'quality_assessment',
      'code_analysis',
      'agent_routing',
    ];
    const now = new Date();

    for (let i = dataPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 1000); // Per minute
      const actionType = Gen.randomItem(actionTypes);
      operations.push({
        period: timestamp.toISOString(),
        operationsPerMinute: Gen.randomInt(5, 30),
        actionType,
      });
    }

    return operations;
  }

  /**
   * Generate mock quality impact data
   */
  static generateQualityImpact(dataPoints: number = 20): QualityImpact[] {
    const impacts: QualityImpact[] = [];
    const now = new Date();

    for (let i = dataPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 1000);
      impacts.push({
        period: timestamp.toISOString(),
        avgQualityImprovement: Gen.randomFloat(0.7, 0.95, 2),
        manifestsImproved: Gen.randomInt(5, 25),
      });
    }

    return impacts;
  }

  /**
   * Generate mock agent actions
   */
  static generateAgentActions(count: number = 50): AgentAction[] {
    const actions: AgentAction[] = [];
    const actionTypes = [
      'tool_call',
      'decision',
      'error',
      'success',
      'manifest_injection',
      'pattern_match',
    ];
    const actionNames = [
      'File Analysis',
      'Code Generation',
      'Pattern Discovery',
      'Quality Check',
      'Test Execution',
      'Documentation',
      'Refactoring',
      'Security Scan',
    ];

    for (let i = 0; i < count; i++) {
      actions.push({
        id: Gen.uuid(),
        correlationId: Gen.uuid(),
        agentName: Gen.agentName(),
        actionType: Gen.randomItem(actionTypes),
        actionName: Gen.randomItem(actionNames),
        actionDetails: {
          result: 'completed',
          confidence: Gen.randomFloat(0.7, 0.99, 2),
        },
        debugMode: Math.random() > 0.9,
        durationMs: Gen.randomInt(100, 5000),
        createdAt: Gen.pastTimestamp(60),
      });
    }

    return actions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Generate mock top accessed documents
   */
  static generateTopDocuments(count: number = 10): TopAccessedDocument[] {
    const documents: TopAccessedDocument[] = [];
    const repositories = [
      'frontend-app',
      'backend-services',
      'shared-lib',
      'infrastructure',
      'mobile-app',
    ];

    for (let i = 0; i < count; i++) {
      const trend = Gen.trend();
      const trendPercentage =
        trend === 'up'
          ? Gen.randomInt(5, 45)
          : trend === 'down'
            ? -Gen.randomInt(5, 25)
            : Gen.randomInt(-2, 2);

      documents.push({
        id: Gen.uuid(),
        repository: Gen.randomItem(repositories),
        filePath: Gen.filePath(),
        accessCount: Gen.randomInt(10, 500),
        lastAccessedAt: Gen.pastTimestamp(120),
        trend,
        trendPercentage,
      });
    }

    return documents.sort((a, b) => b.accessCount - a.accessCount);
  }

  /**
   * Generate mock live events
   */
  static generateLiveEvents(count: number = 20): LiveEvent[] {
    const events: LiveEvent[] = [];
    const sources = [
      'agent-router',
      'pattern-engine',
      'manifest-generator',
      'quality-checker',
      'code-analyzer',
    ];

    const eventMessages = {
      success: [
        'Pattern successfully injected',
        'Manifest generated successfully',
        'Quality check passed',
        'Code analysis completed',
        'Agent routing decision made',
      ],
      info: [
        'New pattern discovered',
        'Agent transformation started',
        'Cache hit for pattern query',
        'Workflow step completed',
        'Health check passed',
      ],
      warning: [
        'High latency detected',
        'Pattern quality below threshold',
        'Cache miss rate elevated',
        'Service degraded performance',
        'Retry attempt in progress',
      ],
      error: [
        'Pattern injection failed',
        'Manifest generation timeout',
        'Quality check failed',
        'Service connection lost',
        'Invalid pattern detected',
      ],
    };

    for (let i = 0; i < count; i++) {
      const type = Gen.randomItem(['success', 'info', 'warning', 'error'] as const);
      events.push({
        id: Gen.uuid(),
        type,
        message: Gen.randomItem(eventMessages[type]),
        timestamp: Gen.pastTimestamp(30),
        source: Gen.randomItem(sources),
      });
    }

    return events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Generate complete intelligence operations data
   */
  static generateAll() {
    return {
      manifestHealth: this.generateManifestHealth(),
      operationsPerMinute: this.generateOperationsPerMinute(20),
      qualityImpact: this.generateQualityImpact(20),
      agentActions: this.generateAgentActions(50),
      topDocuments: this.generateTopDocuments(10),
      liveEvents: this.generateLiveEvents(20),
      isMock: true,
    };
  }
}
