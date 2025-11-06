import { describe, it, expect } from 'vitest';
import { AgentOperationsMockData } from '../agent-operations-mock';
import { PatternLearningMockData } from '../pattern-learning-mock';
import { EventFlowMockData } from '../event-flow-mock';
import { CodeIntelligenceMockData } from '../code-intelligence-mock';
import { DeveloperExperienceMockData } from '../developer-experience-mock';
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
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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
