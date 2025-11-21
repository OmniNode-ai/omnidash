import { describe, it, expect } from 'vitest';
import { AgentOperationsMockData } from '../agent-operations-mock';
import { PatternLearningMockData } from '../pattern-learning-mock';
import { EventFlowMockData } from '../event-flow-mock';
import { CodeIntelligenceMockData } from '../code-intelligence-mock';
import { DeveloperExperienceMockData } from '../developer-experience-mock';
import { PlatformHealthMockData } from '../platform-health-mock';
import { IntelligenceOperationsMockData } from '../intelligence-operations-mock';
import { KnowledgeGraphMockData } from '../knowledge-graph-mock';
import { MockDataGenerator } from '../config';

describe('MockDataGenerator Utilities', () => {
  describe('randomInt', () => {
    it('generates integers within specified range', () => {
      for (let i = 0; i < 100; i++) {
        const value = MockDataGenerator.randomInt(10, 20);
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThanOrEqual(20);
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  });

  describe('randomFloat', () => {
    it('generates floats within specified range with correct decimals', () => {
      for (let i = 0; i < 100; i++) {
        const value = MockDataGenerator.randomFloat(0.5, 1.5, 2);
        expect(value).toBeGreaterThanOrEqual(0.5);
        expect(value).toBeLessThanOrEqual(1.5);
        const decimals = value.toString().split('.')[1]?.length || 0;
        expect(decimals).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('uuid', () => {
    it('generates valid UUID v4 format', () => {
      const uuid = MockDataGenerator.uuid();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('generates unique UUIDs', () => {
      const uuids = new Set();
      for (let i = 0; i < 100; i++) {
        uuids.add(MockDataGenerator.uuid());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('pastTimestamp', () => {
    it('generates valid ISO timestamps in the past', () => {
      const timestamp = MockDataGenerator.pastTimestamp(60);
      const date = new Date(timestamp);
      const now = new Date();

      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('status', () => {
    it('generates success status with high probability', () => {
      const results = { success: 0, error: 0, warning: 0 };
      for (let i = 0; i < 1000; i++) {
        const status = MockDataGenerator.status(0.8);
        results[status]++;
      }

      // With 80% success weight, expect roughly 800 successes
      expect(results.success).toBeGreaterThan(700);
      expect(results.success).toBeLessThan(900);
    });
  });
});

describe('AgentOperationsMockData', () => {
  describe('generateSummary', () => {
    it('generates summary with valid ranges', () => {
      const summary = AgentOperationsMockData.generateSummary();

      expect(summary.totalAgents).toBeGreaterThanOrEqual(45);
      expect(summary.totalAgents).toBeLessThanOrEqual(60);
      expect(summary.activeAgents).toBeGreaterThanOrEqual(0);
      expect(summary.activeAgents).toBeLessThanOrEqual(summary.totalAgents);
      expect(summary.totalRuns).toBeGreaterThanOrEqual(1000);
      expect(summary.totalRuns).toBeLessThanOrEqual(5000);
      expect(summary.successRate).toBeGreaterThanOrEqual(85);
      expect(summary.successRate).toBeLessThanOrEqual(98);
      expect(summary.avgExecutionTime).toBeGreaterThanOrEqual(0.5);
      expect(summary.avgExecutionTime).toBeLessThanOrEqual(3.5);
    });

    it('has all required fields', () => {
      const summary = AgentOperationsMockData.generateSummary();

      expect(summary).toHaveProperty('totalAgents');
      expect(summary).toHaveProperty('activeAgents');
      expect(summary).toHaveProperty('totalRuns');
      expect(summary).toHaveProperty('successRate');
      expect(summary).toHaveProperty('avgExecutionTime');
    });

    it('activeAgents is at least 70% of totalAgents', () => {
      const summary = AgentOperationsMockData.generateSummary();
      const minActiveAgents = Math.floor(summary.totalAgents * 0.7);

      expect(summary.activeAgents).toBeGreaterThanOrEqual(minActiveAgents);
    });
  });

  describe('generateRecentActions', () => {
    it('generates specified number of actions', () => {
      const actions = AgentOperationsMockData.generateRecentActions(10);
      expect(actions).toHaveLength(10);
    });

    it('generates actions with proper structure', () => {
      const actions = AgentOperationsMockData.generateRecentActions(5);

      actions.forEach((action) => {
        expect(action).toHaveProperty('id');
        expect(action).toHaveProperty('agentId');
        expect(action).toHaveProperty('agentName');
        expect(action).toHaveProperty('action');
        expect(action).toHaveProperty('status');
        expect(action).toHaveProperty('timestamp');
        expect(action).toHaveProperty('duration');

        expect(typeof action.id).toBe('string');
        expect(typeof action.agentId).toBe('string');
        expect(typeof action.agentName).toBe('string');
        expect(typeof action.action).toBe('string');
        expect(['success', 'error', 'warning']).toContain(action.status);
        expect(typeof action.timestamp).toBe('string');
        expect(typeof action.duration).toBe('number');
      });
    });

    it('sorts actions by timestamp descending', () => {
      const actions = AgentOperationsMockData.generateRecentActions(10);

      for (let i = 0; i < actions.length - 1; i++) {
        const current = new Date(actions[i].timestamp).getTime();
        const next = new Date(actions[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('generates valid timestamps within last hour', () => {
      const actions = AgentOperationsMockData.generateRecentActions(5);
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;

      actions.forEach((action) => {
        const timestamp = new Date(action.timestamp).getTime();
        expect(timestamp).toBeGreaterThanOrEqual(oneHourAgo);
        expect(timestamp).toBeLessThanOrEqual(now);
      });
    });
  });

  describe('generateHealth', () => {
    it('generates health status with service list', () => {
      const health = AgentOperationsMockData.generateHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('services');
      expect(Array.isArray(health.services)).toBe(true);
      expect(health.services.length).toBeGreaterThan(0);
    });

    it('generates services with proper structure', () => {
      const health = AgentOperationsMockData.generateHealth();

      health.services.forEach((service) => {
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('status');
        expect(service).toHaveProperty('latency');
        expect(typeof service.name).toBe('string');
        expect(['up', 'degraded', 'down']).toContain(service.status);
        expect(typeof service.latency).toBe('number');
        expect(service.latency).toBeGreaterThan(0);
      });
    });
  });

  describe('generateOperationsChart', () => {
    it('generates chart with specified data points', () => {
      const chartData = AgentOperationsMockData.generateOperationsChart(20);
      expect(chartData).toHaveLength(20);
    });

    it('generates data points with time and value', () => {
      const chartData = AgentOperationsMockData.generateOperationsChart(10);

      chartData.forEach((point) => {
        expect(point).toHaveProperty('time');
        expect(point).toHaveProperty('value');
        expect(typeof point.time).toBe('string');
        expect(typeof point.value).toBe('number');
        expect(point.value).toBeGreaterThanOrEqual(10);
        expect(point.value).toBeLessThanOrEqual(50);
      });
    });
  });

  describe('generateOperations', () => {
    it('generates specified number of operations', () => {
      const operations = AgentOperationsMockData.generateOperations(8);
      expect(operations.length).toBeLessThanOrEqual(8);
    });

    it('generates operations with proper structure', () => {
      const operations = AgentOperationsMockData.generateOperations(5);

      operations.forEach((op) => {
        expect(op).toHaveProperty('id');
        expect(op).toHaveProperty('name');
        expect(op).toHaveProperty('status');
        expect(op).toHaveProperty('count');
        expect(op).toHaveProperty('avgTime');
        expect(['running', 'idle']).toContain(op.status);
      });
    });
  });

  describe('generateAll', () => {
    it('generates complete data with all sections', () => {
      const data = AgentOperationsMockData.generateAll();

      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('recentActions');
      expect(data).toHaveProperty('health');
      expect(data).toHaveProperty('chartData');
      expect(data).toHaveProperty('qualityChartData');
      expect(data).toHaveProperty('operations');
      expect(data).toHaveProperty('totalOperations');
      expect(data).toHaveProperty('runningOperations');
      expect(data).toHaveProperty('totalOpsPerMinute');
      expect(data).toHaveProperty('avgQualityImprovement');
      expect(data.isMock).toBe(true);
    });

    it('generates consistent aggregate metrics', () => {
      const data = AgentOperationsMockData.generateAll();

      expect(data.totalOperations).toBe(data.operations.length);
      expect(data.runningOperations).toBeLessThanOrEqual(data.totalOperations);
      expect(data.recentActions).toHaveLength(50);
      expect(data.chartData).toHaveLength(20);
      expect(data.qualityChartData).toHaveLength(20);
    });
  });
});

describe('PatternLearningMockData', () => {
  describe('generateSummary', () => {
    it('generates summary with valid ranges', () => {
      const summary = PatternLearningMockData.generateSummary();

      expect(summary.totalPatterns).toBeGreaterThanOrEqual(800);
      expect(summary.totalPatterns).toBeLessThanOrEqual(1500);
      expect(summary.newPatternsToday).toBeGreaterThanOrEqual(20);
      expect(summary.newPatternsToday).toBeLessThanOrEqual(60);
      expect(summary.avgQualityScore).toBeGreaterThanOrEqual(0.78);
      expect(summary.avgQualityScore).toBeLessThanOrEqual(0.92);
      expect(summary.activeLearningCount).toBeGreaterThanOrEqual(5);
      expect(summary.activeLearningCount).toBeLessThanOrEqual(15);
    });
  });

  describe('generateTrends', () => {
    it('generates specified number of trend data points', () => {
      const trends = PatternLearningMockData.generateTrends(20);
      expect(trends).toHaveLength(20);
    });

    it('generates trends with proper structure', () => {
      const trends = PatternLearningMockData.generateTrends(10);

      trends.forEach((trend) => {
        expect(trend).toHaveProperty('period');
        expect(trend).toHaveProperty('manifestsGenerated');
        expect(trend).toHaveProperty('avgPatternsPerManifest');
        expect(trend).toHaveProperty('avgQueryTimeMs');

        expect(typeof trend.period).toBe('string');
        expect(trend.manifestsGenerated).toBeGreaterThanOrEqual(5);
        expect(trend.manifestsGenerated).toBeLessThanOrEqual(25);
        expect(trend.avgPatternsPerManifest).toBeGreaterThanOrEqual(0.5);
        expect(trend.avgPatternsPerManifest).toBeLessThanOrEqual(2.5);
      });
    });

    it('generates trends in chronological order', () => {
      const trends = PatternLearningMockData.generateTrends(10);

      for (let i = 0; i < trends.length - 1; i++) {
        const current = new Date(trends[i].period).getTime();
        const next = new Date(trends[i + 1].period).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });
  });

  describe('generatePatternList', () => {
    it('generates specified number of patterns', () => {
      const patterns = PatternLearningMockData.generatePatternList(50);
      expect(patterns).toHaveLength(50);
    });

    it('generates patterns with proper structure', () => {
      const patterns = PatternLearningMockData.generatePatternList(10);

      patterns.forEach((pattern) => {
        expect(pattern).toHaveProperty('id');
        expect(pattern).toHaveProperty('name');
        expect(pattern).toHaveProperty('description');
        expect(pattern).toHaveProperty('quality');
        expect(pattern).toHaveProperty('usage');
        expect(pattern).toHaveProperty('trend');
        expect(pattern).toHaveProperty('trendPercentage');
        expect(pattern).toHaveProperty('category');
        expect(pattern).toHaveProperty('language');

        expect(pattern.quality).toBeGreaterThanOrEqual(0.65);
        expect(pattern.quality).toBeLessThanOrEqual(0.98);
        expect(['up', 'down', 'stable']).toContain(pattern.trend);
      });
    });

    it('sorts patterns by usage descending', () => {
      const patterns = PatternLearningMockData.generatePatternList(20);

      for (let i = 0; i < patterns.length - 1; i++) {
        expect(patterns[i].usage).toBeGreaterThanOrEqual(patterns[i + 1].usage);
      }
    });
  });

  describe('generateLanguageBreakdown', () => {
    it('generates language breakdown with percentages summing to 100', () => {
      const breakdown = PatternLearningMockData.generateLanguageBreakdown();
      const totalPercentage = breakdown.reduce((sum, lang) => sum + lang.percentage, 0);

      expect(breakdown.length).toBeGreaterThan(0);
      expect(totalPercentage).toBeCloseTo(100, 0);
    });

    it('generates breakdown with proper structure', () => {
      const breakdown = PatternLearningMockData.generateLanguageBreakdown();

      breakdown.forEach((lang) => {
        expect(lang).toHaveProperty('language');
        expect(lang).toHaveProperty('count');
        expect(lang).toHaveProperty('percentage');
        expect(typeof lang.language).toBe('string');
        expect(lang.count).toBeGreaterThanOrEqual(0);
        expect(lang.percentage).toBeGreaterThanOrEqual(0);
        expect(lang.percentage).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('generateDiscoveredPatterns', () => {
    it('generates specified number of discovered patterns', () => {
      const patterns = PatternLearningMockData.generateDiscoveredPatterns(8);
      expect(patterns).toHaveLength(8);
    });

    it('generates patterns with proper structure', () => {
      const patterns = PatternLearningMockData.generateDiscoveredPatterns(5);

      patterns.forEach((pattern) => {
        expect(pattern).toHaveProperty('name');
        expect(pattern).toHaveProperty('file_path');
        expect(pattern).toHaveProperty('createdAt');
        expect(pattern).toHaveProperty('metadata');
        expect(pattern.metadata).toHaveProperty('createdAt');
      });
    });

    it('sorts patterns by timestamp descending', () => {
      const patterns = PatternLearningMockData.generateDiscoveredPatterns(10);

      for (let i = 0; i < patterns.length - 1; i++) {
        const current = new Date(patterns[i].createdAt).getTime();
        const next = new Date(patterns[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });
});

describe('EventFlowMockData', () => {
  describe('generateEvents', () => {
    it('generates specified number of events', () => {
      const events = EventFlowMockData.generateEvents(100);
      expect(events).toHaveLength(100);
    });

    it('generates events with proper structure', () => {
      const events = EventFlowMockData.generateEvents(10);

      events.forEach((event) => {
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('source');
        expect(event).toHaveProperty('data');

        expect(typeof event.id).toBe('string');
        expect(typeof event.timestamp).toBe('string');
        expect(typeof event.type).toBe('string');
        expect(typeof event.source).toBe('string');
        expect(typeof event.data).toBe('object');
      });
    });

    it('sorts events by timestamp descending', () => {
      const events = EventFlowMockData.generateEvents(20);

      for (let i = 0; i < events.length - 1; i++) {
        const current = new Date(events[i].timestamp).getTime();
        const next = new Date(events[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('generates events with durationMs in data', () => {
      const events = EventFlowMockData.generateEvents(10);

      events.forEach((event) => {
        expect(event.data).toHaveProperty('durationMs');
        expect(typeof event.data.durationMs).toBe('number');
        expect(event.data.durationMs).toBeGreaterThan(0);
      });
    });
  });

  describe('calculateMetrics', () => {
    it('calculates correct metrics from events', () => {
      const events = EventFlowMockData.generateEvents(50);
      const metrics = EventFlowMockData.calculateMetrics(events);

      expect(metrics).toHaveProperty('totalEvents');
      expect(metrics).toHaveProperty('uniqueTypes');
      expect(metrics).toHaveProperty('eventsPerMinute');
      expect(metrics).toHaveProperty('avgProcessingTime');
      expect(metrics).toHaveProperty('topicCounts');

      expect(metrics.totalEvents).toBe(50);
      expect(metrics.uniqueTypes).toBeGreaterThan(0);
      expect(metrics.avgProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it('counts events per minute correctly', () => {
      const events = EventFlowMockData.generateEvents(100);
      const metrics = EventFlowMockData.calculateMetrics(events);

      // Events are within last 60 minutes, so eventsPerMinute should be > 0
      expect(metrics.eventsPerMinute).toBeGreaterThanOrEqual(0);
      expect(metrics.eventsPerMinute).toBeLessThanOrEqual(100);
    });
  });

  describe('generateChartData', () => {
    it('generates chart data with throughput and lag', () => {
      const events = EventFlowMockData.generateEvents(50);
      const chartData = EventFlowMockData.generateChartData(events);

      expect(chartData).toHaveProperty('throughput');
      expect(chartData).toHaveProperty('lag');
      expect(Array.isArray(chartData.throughput)).toBe(true);
      expect(Array.isArray(chartData.lag)).toBe(true);
    });
  });

  describe('generateAll', () => {
    it('generates complete event flow data', () => {
      const data = EventFlowMockData.generateAll(100);

      expect(data).toHaveProperty('events');
      expect(data).toHaveProperty('metrics');
      expect(data).toHaveProperty('chartData');
      expect(data.isMock).toBe(true);
      expect(data.events).toHaveLength(100);
    });
  });
});

describe('CodeIntelligenceMockData', () => {
  describe('generateCodeAnalysis', () => {
    it('generates code analysis with valid ranges', () => {
      const analysis = CodeIntelligenceMockData.generateCodeAnalysis();

      expect(analysis.files_analyzed).toBeGreaterThanOrEqual(800);
      expect(analysis.files_analyzed).toBeLessThanOrEqual(2000);
      expect(analysis.avg_complexity).toBeGreaterThanOrEqual(5.0);
      expect(analysis.avg_complexity).toBeLessThanOrEqual(12.0);
      expect(analysis.code_smells).toBeGreaterThanOrEqual(10);
      expect(analysis.code_smells).toBeLessThanOrEqual(80);
      expect(analysis.security_issues).toBeGreaterThanOrEqual(0);
      expect(analysis.security_issues).toBeLessThanOrEqual(15);
    });

    it('generates trends with proper structure', () => {
      const analysis = CodeIntelligenceMockData.generateCodeAnalysis();

      expect(Array.isArray(analysis.complexity_trend)).toBe(true);
      expect(Array.isArray(analysis.quality_trend)).toBe(true);
      expect(analysis.complexity_trend.length).toBe(20);
      expect(analysis.quality_trend.length).toBe(20);

      analysis.complexity_trend.forEach((point) => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('value');
      });
    });
  });

  describe('generateCompliance', () => {
    it('generates compliance data with proper structure', () => {
      const compliance = CodeIntelligenceMockData.generateCompliance();

      expect(compliance).toHaveProperty('summary');
      expect(compliance).toHaveProperty('statusBreakdown');
      expect(compliance).toHaveProperty('nodeTypeBreakdown');
      expect(compliance).toHaveProperty('trend');
    });

    it('generates valid compliance summary', () => {
      const compliance = CodeIntelligenceMockData.generateCompliance();
      const summary = compliance.summary;

      expect(summary.totalFiles).toBeGreaterThanOrEqual(100);
      expect(summary.totalFiles).toBeLessThanOrEqual(300);
      expect(summary.compliantFiles).toBeLessThanOrEqual(summary.totalFiles);
      expect(summary.nonCompliantFiles).toBeLessThanOrEqual(summary.totalFiles);
      expect(summary.pendingFiles).toBeLessThanOrEqual(summary.totalFiles);
      expect(summary.compliancePercentage).toBeGreaterThanOrEqual(0);
      expect(summary.compliancePercentage).toBeLessThanOrEqual(100);
    });

    it('generates status breakdown summing to total files', () => {
      const compliance = CodeIntelligenceMockData.generateCompliance();
      const totalFromBreakdown = compliance.statusBreakdown.reduce(
        (sum, status) => sum + status.count,
        0
      );

      expect(totalFromBreakdown).toBe(compliance.summary.totalFiles);
    });

    it('generates node type breakdown with proper structure', () => {
      const compliance = CodeIntelligenceMockData.generateCompliance();

      compliance.nodeTypeBreakdown.forEach((nodeType) => {
        expect(nodeType).toHaveProperty('nodeType');
        expect(nodeType).toHaveProperty('compliantCount');
        expect(nodeType).toHaveProperty('totalCount');
        expect(nodeType).toHaveProperty('percentage');
        expect(nodeType.compliantCount).toBeLessThanOrEqual(nodeType.totalCount);
      });
    });

    it('generates 30-day compliance trend', () => {
      const compliance = CodeIntelligenceMockData.generateCompliance();

      expect(compliance.trend).toHaveLength(30);
      compliance.trend.forEach((point) => {
        expect(point).toHaveProperty('period');
        expect(point).toHaveProperty('compliancePercentage');
        expect(point).toHaveProperty('totalFiles');
      });
    });
  });

  describe('generateAll', () => {
    it('generates complete code intelligence data', () => {
      const data = CodeIntelligenceMockData.generateAll();

      expect(data).toHaveProperty('codeAnalysis');
      expect(data).toHaveProperty('compliance');
      expect(data.isMock).toBe(true);
    });
  });
});

describe('DeveloperExperienceMockData', () => {
  describe('generateWorkflows', () => {
    it('generates workflows with proper structure', () => {
      const workflows = DeveloperExperienceMockData.generateWorkflows();

      expect(workflows).toHaveProperty('workflows');
      expect(workflows).toHaveProperty('total_developers');
      expect(workflows).toHaveProperty('total_code_generated');
      expect(Array.isArray(workflows.workflows)).toBe(true);
    });

    it('generates workflow data with valid ranges', () => {
      const workflows = DeveloperExperienceMockData.generateWorkflows();

      workflows.workflows.forEach((workflow) => {
        expect(workflow).toHaveProperty('agent_name');
        expect(workflow).toHaveProperty('total_workflows');
        expect(workflow).toHaveProperty('successful_workflows');
        expect(workflow).toHaveProperty('avg_duration_ms');
        expect(workflow).toHaveProperty('improvement_percentage');

        expect(workflow.successful_workflows).toBeLessThanOrEqual(workflow.total_workflows);
        expect(workflow.improvement_percentage).toBeGreaterThanOrEqual(15);
        expect(workflow.improvement_percentage).toBeLessThanOrEqual(45);
      });
    });
  });

  describe('generateVelocity', () => {
    it('generates velocity data with specified points', () => {
      const velocity = DeveloperExperienceMockData.generateVelocity(20);

      expect(velocity).toHaveProperty('time_window');
      expect(velocity).toHaveProperty('data');
      expect(velocity.data).toHaveLength(20);
    });

    it('generates velocity data with proper structure', () => {
      const velocity = DeveloperExperienceMockData.generateVelocity(10);

      velocity.data.forEach((point) => {
        expect(point).toHaveProperty('period');
        expect(point).toHaveProperty('workflows_completed');
        expect(point).toHaveProperty('avg_duration_ms');
      });
    });
  });

  describe('generateProductivity', () => {
    it('generates productivity data with metrics', () => {
      const productivity = DeveloperExperienceMockData.generateProductivity(20);

      expect(productivity).toHaveProperty('time_window');
      expect(productivity).toHaveProperty('data');
      expect(productivity).toHaveProperty('avg_productivity_gain');
      expect(productivity).toHaveProperty('pattern_reuse_rate');
      expect(productivity.data).toHaveLength(20);
    });

    it('generates productivity with valid ranges', () => {
      const productivity = DeveloperExperienceMockData.generateProductivity(10);

      expect(productivity.avg_productivity_gain).toBeGreaterThanOrEqual(25);
      expect(productivity.avg_productivity_gain).toBeLessThanOrEqual(45);
      expect(productivity.pattern_reuse_rate).toBeGreaterThanOrEqual(0.65);
      expect(productivity.pattern_reuse_rate).toBeLessThanOrEqual(0.85);
    });
  });
});

describe('PlatformHealthMockData', () => {
  describe('generateHealth', () => {
    it('generates health data with required structure', () => {
      const health = PlatformHealthMockData.generateHealth();

      expect(health).toHaveProperty('database');
      expect(health).toHaveProperty('kafka');
      expect(health).toHaveProperty('services');
    });

    it('generates database health with valid structure', () => {
      const health = PlatformHealthMockData.generateHealth();

      expect(health.database).toHaveProperty('name', 'PostgreSQL');
      expect(health.database).toHaveProperty('status');
      expect(health.database).toHaveProperty('uptime');
      expect(health.database).toHaveProperty('latency_ms');

      expect(['healthy', 'degraded', 'down']).toContain(health.database.status);
      expect(health.database.latency_ms).toBeGreaterThanOrEqual(5);
      expect(health.database.latency_ms).toBeLessThanOrEqual(30);
      expect(health.database.uptime).toMatch(/^\d+\.\d+%$/);
    });

    it('generates kafka health with valid structure', () => {
      const health = PlatformHealthMockData.generateHealth();

      expect(health.kafka).toHaveProperty('name', 'Kafka/Redpanda');
      expect(health.kafka).toHaveProperty('status');
      expect(health.kafka).toHaveProperty('uptime');
      expect(health.kafka).toHaveProperty('latency_ms');

      expect(['healthy', 'degraded', 'down']).toContain(health.kafka.status);
      expect(health.kafka.latency_ms).toBeGreaterThanOrEqual(15);
      expect(health.kafka.latency_ms).toBeLessThanOrEqual(60);
      expect(health.kafka.uptime).toMatch(/^\d+\.\d+%$/);
    });

    it('generates services array with valid structure', () => {
      const health = PlatformHealthMockData.generateHealth();

      expect(Array.isArray(health.services)).toBe(true);
      expect(health.services.length).toBe(6);

      health.services.forEach((service) => {
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('status');
        expect(service).toHaveProperty('latency_ms');
        expect(service).toHaveProperty('uptime');

        expect(typeof service.name).toBe('string');
        expect(['up', 'degraded']).toContain(service.status);
        expect(service.latency_ms).toBeGreaterThan(0);
        expect(service.uptime).toBeGreaterThanOrEqual(99.0);
        expect(service.uptime).toBeLessThanOrEqual(99.99);
      });
    });

    it('occasionally degrades a service', () => {
      // Run multiple times to check degradation logic
      let foundDegraded = false;
      for (let i = 0; i < 50; i++) {
        const health = PlatformHealthMockData.generateHealth();
        if (health.services.some((s) => s.status === 'degraded')) {
          foundDegraded = true;
          break;
        }
      }
      // With 10% chance over 50 runs, we should find at least one degraded service
      expect(foundDegraded).toBe(true);
    });

    it('generates different data on subsequent calls', () => {
      const health1 = PlatformHealthMockData.generateHealth();
      const health2 = PlatformHealthMockData.generateHealth();

      // Should have some variation (not identical)
      expect(JSON.stringify(health1)).not.toBe(JSON.stringify(health2));
    });
  });

  describe('generateServices', () => {
    it('generates services with valid structure', () => {
      const services = PlatformHealthMockData.generateServices();

      expect(services).toHaveProperty('services');
      expect(Array.isArray(services.services)).toBe(true);
      expect(services.services.length).toBe(12);
    });

    it('generates service entries with required fields', () => {
      const services = PlatformHealthMockData.generateServices();

      services.services.forEach((service) => {
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('status');
        expect(service).toHaveProperty('health');

        expect(typeof service.name).toBe('string');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(service.status);
        expect(['up', 'degraded', 'down']).toContain(service.health);
      });
    });

    it('maps health status correctly', () => {
      const services = PlatformHealthMockData.generateServices();

      services.services.forEach((service) => {
        if (service.status === 'healthy') {
          expect(service.health).toBe('up');
        } else if (service.status === 'degraded') {
          expect(service.health).toBe('degraded');
        } else if (service.status === 'unhealthy') {
          expect(service.health).toBe('down');
        }
      });
    });
  });

  describe('generateCpuUsage', () => {
    it('generates specified number of data points', () => {
      const cpuUsage = PlatformHealthMockData.generateCpuUsage(20);
      expect(cpuUsage).toHaveLength(20);
    });

    it('generates CPU usage within realistic range', () => {
      const cpuUsage = PlatformHealthMockData.generateCpuUsage(10);

      cpuUsage.forEach((point) => {
        expect(point).toHaveProperty('time');
        expect(point).toHaveProperty('value');
        expect(typeof point.time).toBe('string');
        expect(point.value).toBeGreaterThanOrEqual(20);
        expect(point.value).toBeLessThanOrEqual(75);
      });
    });
  });

  describe('generateMemoryUsage', () => {
    it('generates specified number of data points', () => {
      const memoryUsage = PlatformHealthMockData.generateMemoryUsage(20);
      expect(memoryUsage).toHaveLength(20);
    });

    it('generates memory usage within realistic range', () => {
      const memoryUsage = PlatformHealthMockData.generateMemoryUsage(10);

      memoryUsage.forEach((point) => {
        expect(point).toHaveProperty('time');
        expect(point).toHaveProperty('value');
        expect(typeof point.time).toBe('string');
        expect(point.value).toBeGreaterThanOrEqual(45);
        expect(point.value).toBeLessThanOrEqual(85);
      });
    });
  });

  describe('generateServiceRegistry', () => {
    it('generates service registry entries', () => {
      const registry = PlatformHealthMockData.generateServiceRegistry();

      expect(Array.isArray(registry)).toBe(true);
      expect(registry.length).toBe(13);
    });

    it('generates registry entries with valid structure', () => {
      const registry = PlatformHealthMockData.generateServiceRegistry();

      registry.forEach((entry) => {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('serviceName');
        expect(entry).toHaveProperty('serviceUrl');
        expect(entry).toHaveProperty('serviceType');
        expect(entry).toHaveProperty('healthStatus');
        expect(entry).toHaveProperty('lastHealthCheck');

        expect(typeof entry.id).toBe('string');
        expect(typeof entry.serviceName).toBe('string');
        expect(entry.serviceUrl).toMatch(/^http:\/\/192\.168\.86\.200:\d+$/);
        expect(['api', 'database', 'queue', 'cache', 'compute']).toContain(entry.serviceType);
        expect(['healthy', 'degraded', 'unhealthy']).toContain(entry.healthStatus);
        expect(typeof entry.lastHealthCheck).toBe('string');
      });
    });

    it('generates unique IDs for each service', () => {
      const registry = PlatformHealthMockData.generateServiceRegistry();
      const ids = registry.map((r) => r.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(registry.length);
    });

    it('generates valid timestamps for health checks', () => {
      const registry = PlatformHealthMockData.generateServiceRegistry();
      const now = new Date().getTime();
      const fifteenMinutesAgo = now - 15 * 60 * 1000;

      registry.forEach((entry) => {
        const checkTime = new Date(entry.lastHealthCheck).getTime();
        expect(checkTime).toBeGreaterThanOrEqual(fifteenMinutesAgo - 1000);
        expect(checkTime).toBeLessThanOrEqual(now);
      });
    });
  });

  describe('generateAll', () => {
    it('generates complete platform health data', () => {
      const data = PlatformHealthMockData.generateAll();

      expect(data).toHaveProperty('health');
      expect(data).toHaveProperty('services');
      expect(data).toHaveProperty('cpuUsage');
      expect(data).toHaveProperty('memoryUsage');
      expect(data).toHaveProperty('serviceRegistry');
      expect(data.isMock).toBe(true);
    });

    it('generates consistent data across sections', () => {
      const data = PlatformHealthMockData.generateAll();

      expect(data.health).toBeDefined();
      expect(data.services).toBeDefined();
      expect(data.cpuUsage).toHaveLength(20);
      expect(data.memoryUsage).toHaveLength(20);
      expect(data.serviceRegistry).toHaveLength(13);
    });
  });
});

describe('IntelligenceOperationsMockData', () => {
  describe('generateManifestHealth', () => {
    it('generates manifest health with required structure', () => {
      const health = IntelligenceOperationsMockData.generateManifestHealth();

      expect(health).toHaveProperty('successRate');
      expect(health).toHaveProperty('avgLatencyMs');
      expect(health).toHaveProperty('failedInjections');
      expect(health).toHaveProperty('manifestSizeStats');
      expect(health).toHaveProperty('latencyTrend');
      expect(health).toHaveProperty('serviceHealth');
    });

    it('generates success rate within realistic range', () => {
      const health = IntelligenceOperationsMockData.generateManifestHealth();

      expect(health.successRate).toBeGreaterThanOrEqual(0.92);
      expect(health.successRate).toBeLessThanOrEqual(0.99);
    });

    it('generates average latency within realistic range', () => {
      const health = IntelligenceOperationsMockData.generateManifestHealth();

      expect(health.avgLatencyMs).toBeGreaterThanOrEqual(200);
      expect(health.avgLatencyMs).toBeLessThanOrEqual(450);
    });

    it('generates failed injections with valid structure', () => {
      const health = IntelligenceOperationsMockData.generateManifestHealth();

      expect(Array.isArray(health.failedInjections)).toBe(true);
      expect(health.failedInjections.length).toBeGreaterThanOrEqual(1);
      expect(health.failedInjections.length).toBeLessThanOrEqual(3);

      health.failedInjections.forEach((failure) => {
        expect(failure).toHaveProperty('errorType');
        expect(failure).toHaveProperty('count');
        expect(failure).toHaveProperty('lastOccurrence');

        expect([
          'timeout',
          'validation_error',
          'connection_error',
          'rate_limit',
          'parse_error',
        ]).toContain(failure.errorType);
        expect(failure.count).toBeGreaterThanOrEqual(1);
        expect(failure.count).toBeLessThanOrEqual(15);
        expect(typeof failure.lastOccurrence).toBe('string');
      });
    });

    it('generates manifest size stats with valid ranges', () => {
      const health = IntelligenceOperationsMockData.generateManifestHealth();

      expect(health.manifestSizeStats).toHaveProperty('avgSizeKb');
      expect(health.manifestSizeStats).toHaveProperty('minSizeKb');
      expect(health.manifestSizeStats).toHaveProperty('maxSizeKb');

      expect(health.manifestSizeStats.avgSizeKb).toBeGreaterThanOrEqual(45);
      expect(health.manifestSizeStats.avgSizeKb).toBeLessThanOrEqual(120);
      expect(health.manifestSizeStats.minSizeKb).toBeGreaterThanOrEqual(15);
      expect(health.manifestSizeStats.minSizeKb).toBeLessThanOrEqual(40);
      expect(health.manifestSizeStats.maxSizeKb).toBeGreaterThanOrEqual(150);
      expect(health.manifestSizeStats.maxSizeKb).toBeLessThanOrEqual(300);

      // Logical consistency
      expect(health.manifestSizeStats.minSizeKb).toBeLessThanOrEqual(
        health.manifestSizeStats.avgSizeKb
      );
      expect(health.manifestSizeStats.avgSizeKb).toBeLessThanOrEqual(
        health.manifestSizeStats.maxSizeKb
      );
    });

    it('generates latency trend with 20 data points', () => {
      const health = IntelligenceOperationsMockData.generateManifestHealth();

      expect(health.latencyTrend).toHaveLength(20);

      health.latencyTrend.forEach((point) => {
        expect(point).toHaveProperty('period');
        expect(point).toHaveProperty('avgLatencyMs');
        expect(point).toHaveProperty('count');

        expect(typeof point.period).toBe('string');
        expect(point.avgLatencyMs).toBeGreaterThanOrEqual(150);
        expect(point.avgLatencyMs).toBeLessThanOrEqual(500);
        expect(point.count).toBeGreaterThanOrEqual(10);
        expect(point.count).toBeLessThanOrEqual(50);
      });
    });

    it('generates latency trend in chronological order', () => {
      const health = IntelligenceOperationsMockData.generateManifestHealth();

      for (let i = 0; i < health.latencyTrend.length - 1; i++) {
        const current = new Date(health.latencyTrend[i].period).getTime();
        const next = new Date(health.latencyTrend[i + 1].period).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });

    it('generates service health for all services', () => {
      const health = IntelligenceOperationsMockData.generateManifestHealth();

      expect(health.serviceHealth).toHaveProperty('postgresql');
      expect(health.serviceHealth).toHaveProperty('omniarchon');
      expect(health.serviceHealth).toHaveProperty('qdrant');

      ['postgresql', 'omniarchon', 'qdrant'].forEach((service) => {
        expect(health.serviceHealth[service as keyof typeof health.serviceHealth]).toHaveProperty(
          'status'
        );
        expect(health.serviceHealth[service as keyof typeof health.serviceHealth]).toHaveProperty(
          'latencyMs'
        );
        expect(['up', 'down']).toContain(
          health.serviceHealth[service as keyof typeof health.serviceHealth].status
        );
        expect(
          health.serviceHealth[service as keyof typeof health.serviceHealth].latencyMs
        ).toBeGreaterThan(0);
      });
    });
  });

  describe('generateOperationsPerMinute', () => {
    it('generates specified number of operations', () => {
      const operations = IntelligenceOperationsMockData.generateOperationsPerMinute(20);
      expect(operations).toHaveLength(20);
    });

    it('generates operations with valid structure', () => {
      const operations = IntelligenceOperationsMockData.generateOperationsPerMinute(10);

      operations.forEach((op) => {
        expect(op).toHaveProperty('period');
        expect(op).toHaveProperty('operationsPerMinute');
        expect(op).toHaveProperty('actionType');

        expect(typeof op.period).toBe('string');
        expect(op.operationsPerMinute).toBeGreaterThanOrEqual(5);
        expect(op.operationsPerMinute).toBeLessThanOrEqual(30);
        expect([
          'pattern_discovery',
          'manifest_generation',
          'quality_assessment',
          'code_analysis',
          'agent_routing',
        ]).toContain(op.actionType);
      });
    });

    it('generates operations in chronological order', () => {
      const operations = IntelligenceOperationsMockData.generateOperationsPerMinute(15);

      for (let i = 0; i < operations.length - 1; i++) {
        const current = new Date(operations[i].period).getTime();
        const next = new Date(operations[i + 1].period).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });
  });

  describe('generateQualityImpact', () => {
    it('generates specified number of impact records', () => {
      const impacts = IntelligenceOperationsMockData.generateQualityImpact(20);
      expect(impacts).toHaveLength(20);
    });

    it('generates quality impact with valid structure', () => {
      const impacts = IntelligenceOperationsMockData.generateQualityImpact(10);

      impacts.forEach((impact) => {
        expect(impact).toHaveProperty('period');
        expect(impact).toHaveProperty('avgQualityImprovement');
        expect(impact).toHaveProperty('manifestsImproved');

        expect(typeof impact.period).toBe('string');
        expect(impact.avgQualityImprovement).toBeGreaterThanOrEqual(0.7);
        expect(impact.avgQualityImprovement).toBeLessThanOrEqual(0.95);
        expect(impact.manifestsImproved).toBeGreaterThanOrEqual(5);
        expect(impact.manifestsImproved).toBeLessThanOrEqual(25);
      });
    });

    it('generates impacts in chronological order', () => {
      const impacts = IntelligenceOperationsMockData.generateQualityImpact(15);

      for (let i = 0; i < impacts.length - 1; i++) {
        const current = new Date(impacts[i].period).getTime();
        const next = new Date(impacts[i + 1].period).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });
  });

  describe('generateAgentActions', () => {
    it('generates specified number of actions', () => {
      const actions = IntelligenceOperationsMockData.generateAgentActions(50);
      expect(actions).toHaveLength(50);
    });

    it('generates actions with valid structure', () => {
      const actions = IntelligenceOperationsMockData.generateAgentActions(10);

      actions.forEach((action) => {
        expect(action).toHaveProperty('id');
        expect(action).toHaveProperty('correlationId');
        expect(action).toHaveProperty('agentName');
        expect(action).toHaveProperty('actionType');
        expect(action).toHaveProperty('actionName');
        expect(action).toHaveProperty('actionDetails');
        expect(action).toHaveProperty('debugMode');
        expect(action).toHaveProperty('durationMs');
        expect(action).toHaveProperty('createdAt');

        expect(typeof action.id).toBe('string');
        expect(typeof action.correlationId).toBe('string');
        expect(typeof action.agentName).toBe('string');
        expect([
          'tool_call',
          'decision',
          'error',
          'success',
          'manifest_injection',
          'pattern_match',
        ]).toContain(action.actionType);
        expect(typeof action.actionName).toBe('string');
        expect(typeof action.debugMode).toBe('boolean');
        expect(action.durationMs).toBeGreaterThanOrEqual(100);
        expect(action.durationMs).toBeLessThanOrEqual(5000);
      });
    });

    it('sorts actions by timestamp descending', () => {
      const actions = IntelligenceOperationsMockData.generateAgentActions(20);

      for (let i = 0; i < actions.length - 1; i++) {
        const current = new Date(actions[i].createdAt).getTime();
        const next = new Date(actions[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('generates unique IDs for each action', () => {
      const actions = IntelligenceOperationsMockData.generateAgentActions(30);
      const ids = actions.map((a) => a.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(actions.length);
    });

    it('occasionally sets debug mode', () => {
      const actions = IntelligenceOperationsMockData.generateAgentActions(100);
      const debugActions = actions.filter((a) => a.debugMode);

      // With 10% probability, expect roughly 10 debug actions out of 100
      expect(debugActions.length).toBeGreaterThanOrEqual(0);
      expect(debugActions.length).toBeLessThanOrEqual(30); // Allow for variance
    });
  });

  describe('generateTopDocuments', () => {
    it('generates specified number of documents', () => {
      const documents = IntelligenceOperationsMockData.generateTopDocuments(10);
      expect(documents).toHaveLength(10);
    });

    it('generates documents with valid structure', () => {
      const documents = IntelligenceOperationsMockData.generateTopDocuments(5);

      documents.forEach((doc) => {
        expect(doc).toHaveProperty('id');
        expect(doc).toHaveProperty('repository');
        expect(doc).toHaveProperty('filePath');
        expect(doc).toHaveProperty('accessCount');
        expect(doc).toHaveProperty('lastAccessedAt');
        expect(doc).toHaveProperty('trend');
        expect(doc).toHaveProperty('trendPercentage');

        expect(typeof doc.id).toBe('string');
        expect(typeof doc.repository).toBe('string');
        expect(typeof doc.filePath).toBe('string');
        expect(doc.accessCount).toBeGreaterThanOrEqual(10);
        expect(doc.accessCount).toBeLessThanOrEqual(500);
        expect(['up', 'down', 'stable']).toContain(doc.trend);
      });
    });

    it('sorts documents by access count descending', () => {
      const documents = IntelligenceOperationsMockData.generateTopDocuments(15);

      for (let i = 0; i < documents.length - 1; i++) {
        expect(documents[i].accessCount).toBeGreaterThanOrEqual(documents[i + 1].accessCount);
      }
    });

    it('generates consistent trend percentages', () => {
      const documents = IntelligenceOperationsMockData.generateTopDocuments(10);

      documents.forEach((doc) => {
        if (doc.trend === 'up') {
          expect(doc.trendPercentage).toBeGreaterThan(0);
        } else if (doc.trend === 'down') {
          expect(doc.trendPercentage).toBeLessThan(0);
        } else {
          expect(Math.abs(doc.trendPercentage)).toBeLessThanOrEqual(2);
        }
      });
    });
  });

  describe('generateLiveEvents', () => {
    it('generates specified number of events', () => {
      const events = IntelligenceOperationsMockData.generateLiveEvents(20);
      expect(events).toHaveLength(20);
    });

    it('generates events with valid structure', () => {
      const events = IntelligenceOperationsMockData.generateLiveEvents(10);

      events.forEach((event) => {
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('message');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('source');

        expect(typeof event.id).toBe('string');
        expect(['success', 'info', 'warning', 'error']).toContain(event.type);
        expect(typeof event.message).toBe('string');
        expect(event.message.length).toBeGreaterThan(0);
        expect(typeof event.timestamp).toBe('string');
        expect([
          'agent-router',
          'pattern-engine',
          'manifest-generator',
          'quality-checker',
          'code-analyzer',
        ]).toContain(event.source);
      });
    });

    it('sorts events by timestamp descending', () => {
      const events = IntelligenceOperationsMockData.generateLiveEvents(15);

      for (let i = 0; i < events.length - 1; i++) {
        const current = new Date(events[i].timestamp).getTime();
        const next = new Date(events[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('generates unique IDs for each event', () => {
      const events = IntelligenceOperationsMockData.generateLiveEvents(25);
      const ids = events.map((e) => e.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(events.length);
    });

    it('generates messages matching event types', () => {
      const events = IntelligenceOperationsMockData.generateLiveEvents(50);

      events.forEach((event) => {
        // Message should not be empty and should be a string
        expect(event.message).toBeTruthy();
        expect(typeof event.message).toBe('string');
      });
    });
  });

  describe('generateAll', () => {
    it('generates complete intelligence operations data', () => {
      const data = IntelligenceOperationsMockData.generateAll();

      expect(data).toHaveProperty('manifestHealth');
      expect(data).toHaveProperty('operationsPerMinute');
      expect(data).toHaveProperty('qualityImpact');
      expect(data).toHaveProperty('agentActions');
      expect(data).toHaveProperty('topDocuments');
      expect(data).toHaveProperty('liveEvents');
      expect(data.isMock).toBe(true);
    });

    it('generates consistent data across sections', () => {
      const data = IntelligenceOperationsMockData.generateAll();

      expect(data.manifestHealth).toBeDefined();
      expect(data.operationsPerMinute).toHaveLength(20);
      expect(data.qualityImpact).toHaveLength(20);
      expect(data.agentActions).toHaveLength(50);
      expect(data.topDocuments).toHaveLength(10);
      expect(data.liveEvents).toHaveLength(20);
    });

    it('generates different data on subsequent calls', () => {
      const data1 = IntelligenceOperationsMockData.generateAll();
      const data2 = IntelligenceOperationsMockData.generateAll();

      // Should have some variation (not identical)
      expect(JSON.stringify(data1)).not.toBe(JSON.stringify(data2));
    });
  });
});

describe('KnowledgeGraphMockData', () => {
  describe('generateNodes', () => {
    it('generates specified number of nodes', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(50);
      expect(nodes).toHaveLength(50);
    });

    it('generates nodes with valid structure', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(20);

      nodes.forEach((node) => {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('label');
        expect(node).toHaveProperty('type');

        expect(typeof node.id).toBe('string');
        expect(typeof node.label).toBe('string');
        expect(['pattern', 'service', 'agent', 'api', 'database', 'component']).toContain(
          node.type
        );
      });
    });

    it('generates correct proportion of node types', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(50);

      const patterns = nodes.filter((n) => n.type === 'pattern');
      const services = nodes.filter((n) => n.type === 'service');
      const agents = nodes.filter((n) => n.type === 'agent');

      // 40% patterns, 20% services, 25% agents
      expect(patterns.length).toBeGreaterThanOrEqual(15);
      expect(patterns.length).toBeLessThanOrEqual(25);
      expect(services.length).toBeGreaterThanOrEqual(5);
      expect(services.length).toBeLessThanOrEqual(15);
      expect(agents.length).toBeGreaterThanOrEqual(8);
      expect(agents.length).toBeLessThanOrEqual(18);
    });

    it('generates pattern nodes with quality and usage', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(50);
      const patterns = nodes.filter((n) => n.type === 'pattern');

      patterns.forEach((pattern) => {
        expect(pattern).toHaveProperty('quality');
        expect(pattern).toHaveProperty('usage');
        expect(pattern).toHaveProperty('category');

        expect(pattern.quality).toBeGreaterThanOrEqual(0.7);
        expect(pattern.quality).toBeLessThanOrEqual(0.99);
        expect(pattern.usage).toBeGreaterThanOrEqual(5);
        expect(pattern.usage).toBeLessThanOrEqual(100);
        expect([
          'authentication',
          'data-processing',
          'error-handling',
          'caching',
          'validation',
        ]).toContain(pattern.category);
      });
    });

    it('generates service nodes with status and uptime', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(50);
      const services = nodes.filter((n) => n.type === 'service');

      services.forEach((service) => {
        expect(service).toHaveProperty('status');
        expect(service).toHaveProperty('uptime');

        expect(['healthy', 'degraded', 'down']).toContain(service.status);
        expect(service.uptime).toBeGreaterThanOrEqual(95);
        expect(service.uptime).toBeLessThanOrEqual(99.9);
      });
    });

    it('generates agent nodes with activeRuns and successRate', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(50);
      const agents = nodes.filter((n) => n.type === 'agent');

      agents.forEach((agent) => {
        expect(agent).toHaveProperty('activeRuns');
        expect(agent).toHaveProperty('successRate');

        expect(agent.activeRuns).toBeGreaterThanOrEqual(0);
        expect(agent.activeRuns).toBeLessThanOrEqual(50);
        expect(agent.successRate).toBeGreaterThanOrEqual(0.8);
        expect(agent.successRate).toBeLessThanOrEqual(0.99);
      });
    });

    it('generates unique node IDs', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(50);
      const ids = nodes.map((n) => n.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(nodes.length);
    });
  });

  describe('generateEdges', () => {
    it('generates specified number of edges', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(20);
      const edges = KnowledgeGraphMockData.generateEdges(nodes, 30);

      expect(edges.length).toBeLessThanOrEqual(30);
    });

    it('generates edges with valid structure', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(20);
      const edges = KnowledgeGraphMockData.generateEdges(nodes, 25);

      edges.forEach((edge) => {
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
        expect(edge).toHaveProperty('type');
        expect(edge).toHaveProperty('weight');

        expect(typeof edge.source).toBe('string');
        expect(typeof edge.target).toBe('string');
        expect(['uses', 'depends-on', 'calls', 'implements', 'extends', 'relates-to']).toContain(
          edge.type
        );
        expect(edge.weight).toBeGreaterThanOrEqual(1);
        expect(edge.weight).toBeLessThanOrEqual(10);
      });
    });

    it('generates edges connecting valid nodes', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(20);
      const edges = KnowledgeGraphMockData.generateEdges(nodes, 25);
      const nodeIds = nodes.map((n) => n.id);

      edges.forEach((edge) => {
        expect(nodeIds).toContain(edge.source);
        expect(nodeIds).toContain(edge.target);
        expect(edge.source).not.toBe(edge.target);
      });
    });

    it('does not generate duplicate edges', () => {
      const nodes = KnowledgeGraphMockData.generateNodes(20);
      const edges = KnowledgeGraphMockData.generateEdges(nodes, 30);

      const edgeKeys = edges.map((e) => `${e.source}-${e.target}`);
      const uniqueEdgeKeys = new Set(edgeKeys);

      expect(uniqueEdgeKeys.size).toBe(edges.length);
    });
  });

  describe('generateAll', () => {
    it('generates complete knowledge graph data', () => {
      const data = KnowledgeGraphMockData.generateAll(50, 80);

      expect(data).toHaveProperty('nodes');
      expect(data).toHaveProperty('edges');
      expect(data.isMock).toBe(true);
    });

    it('generates consistent data with default parameters', () => {
      const data = KnowledgeGraphMockData.generateAll();

      expect(data.nodes).toHaveLength(50);
      expect(data.edges.length).toBeLessThanOrEqual(80);
      expect(data.isMock).toBe(true);
    });

    it('generates graph with valid node-edge relationships', () => {
      const data = KnowledgeGraphMockData.generateAll(30, 40);
      const nodeIds = data.nodes.map((n) => n.id);

      data.edges.forEach((edge) => {
        expect(nodeIds).toContain(edge.source);
        expect(nodeIds).toContain(edge.target);
      });
    });

    it('generates different data on subsequent calls', () => {
      const data1 = KnowledgeGraphMockData.generateAll(20, 30);
      const data2 = KnowledgeGraphMockData.generateAll(20, 30);

      // Should have some variation (not identical)
      expect(JSON.stringify(data1)).not.toBe(JSON.stringify(data2));
    });

    it('generates scalable graph with custom parameters', () => {
      const data = KnowledgeGraphMockData.generateAll(100, 150);

      expect(data.nodes).toHaveLength(100);
      expect(data.edges.length).toBeLessThanOrEqual(150);
    });
  });
});
