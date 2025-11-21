// Agent Operations Data Source
import { USE_MOCK_DATA, AgentOperationsMockData } from '../mock-data';
import { fallbackChain, withFallback, ensureNumeric } from '../defensive-transform-logger';
import {
  agentMetricsApiSchema,
  recentActionSchema,
  healthStatusSchema,
  parseArrayResponse,
  safeParseResponse,
} from '../schemas/api-response-schemas';

export interface AgentSummary {
  totalAgents: number;
  activeAgents: number;
  totalRuns: number;
  successRate: number;
  avgExecutionTime: number;
}

export interface RecentAction {
  id: string;
  agentId: string;
  agentName: string;
  correlationId?: string;
  action: string;
  status: string;
  timestamp: string;
  duration?: number;
  actionName?: string;
  actionType?: string;
  actionDetails?: any;
  debugMode?: boolean;
}

export interface HealthStatus {
  status: string;
  services: Array<{
    name: string;
    status: string;
    latency?: number;
  }>;
}

export interface ChartDataPoint {
  time: string;
  value: number;
}

export interface OperationStatus {
  id: string;
  name: string;
  status: 'running' | 'idle';
  count: number;
  avgTime: string;
}

interface AgentOperationsData {
  summary: AgentSummary;
  recentActions: RecentAction[];
  perAgentMetrics: any[];
  health: HealthStatus;
  chartData: ChartDataPoint[];
  qualityChartData: ChartDataPoint[];
  operations: OperationStatus[];
  totalOperations: number;
  runningOperations: number;
  totalOpsPerMinute: number;
  avgQualityImprovement: number;
  isMock: boolean;
}

class AgentOperationsSource {
  async fetchSummary(timeRange: string): Promise<{ data: AgentSummary; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      const mockData = AgentOperationsMockData.generateSummary();
      return { data: mockData, isMock: true };
    }

    try {
      const res = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (res.ok) {
        const rawAgents = await res.json();
        // Validate API response with Zod schema
        const agents = parseArrayResponse(agentMetricsApiSchema, rawAgents, 'agent-summary');
        if (agents.length > 0) {
          const totalRuns = agents.reduce(
            (sum, a) =>
              sum +
              ensureNumeric('totalRequests', a.totalRequests, 0, {
                id: a.agent,
                context: 'agent-summary-total-runs',
              }),
            0
          );
          const activeAgents = agents.filter(
            (a) =>
              ensureNumeric('totalRequests', a.totalRequests, 0, {
                id: a.agent,
                context: 'agent-summary-active-check',
              }) > 0
          ).length;
          const totalRequestsForAvg = agents.reduce(
            (sum, a) =>
              sum +
              ensureNumeric('totalRequests', a.totalRequests, 0, {
                id: a.agent,
                context: 'agent-summary-avg-calc',
              }),
            0
          );
          // Calculate weighted average success rate (request volume weighted, not simple average)
          // Detect format: if any value > 1, assume percentage format, else decimal (0-1)
          // Check both successRate and avgConfidence for format detection
          const sampleAgent = agents.find((a) => a.successRate != null || a.avgConfidence != null);
          const sampleValue = sampleAgent
            ? fallbackChain(
                'successRate',
                { id: sampleAgent.agent || 'unknown', context: 'agent-summary-format-detection' },
                [
                  { value: sampleAgent.successRate, label: 'successRate field' },
                  {
                    value: sampleAgent.avgConfidence,
                    label: 'avgConfidence field (legacy)',
                    level: 'warn',
                  },
                  { value: undefined, label: 'no format detection available', level: 'debug' },
                ]
              )
            : undefined;
          const isDecimalFormat = sampleValue != null && sampleValue <= 1;

          const avgSuccessRate =
            totalRequestsForAvg > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    agents.reduce((sum, a) => {
                      const weight =
                        ensureNumeric('totalRequests', a.totalRequests, 0, {
                          id: a.agent,
                          context: 'agent-summary-weight',
                        }) / totalRequestsForAvg;
                      const rate = fallbackChain(
                        'successRate',
                        { id: a.agent || 'unknown', context: 'agent-summary-rate' },
                        [
                          { value: a.successRate, label: 'successRate field' },
                          {
                            value: a.avgConfidence,
                            label: 'avgConfidence field (legacy)',
                            level: 'warn',
                          },
                          { value: 0, label: 'default zero', level: 'error' },
                        ]
                      );
                      // Convert decimal to percentage if needed
                      const rateAsPercentage = isDecimalFormat ? rate * 100 : rate;
                      return sum + rateAsPercentage * weight;
                    }, 0)
                  )
                )
              : 0;
          // Weighted average execution time based on request volume
          const avgExecutionTimeMs =
            totalRequestsForAvg > 0
              ? agents.reduce((sum, a) => {
                  const weight =
                    ensureNumeric('totalRequests', a.totalRequests, 0, {
                      id: a.agent,
                      context: 'agent-summary-exec-time-weight',
                    }) / totalRequestsForAvg;
                  const routingTime = ensureNumeric('avgRoutingTime', a.avgRoutingTime, 0, {
                    id: a.agent,
                    context: 'agent-summary-exec-time',
                  });
                  return sum + routingTime * weight;
                }, 0)
              : 0;
          const avgExecutionTime = avgExecutionTimeMs / 1000; // Convert to seconds

          return {
            data: {
              totalAgents: agents.length,
              activeAgents,
              totalRuns,
              successRate: avgSuccessRate,
              avgExecutionTime,
            },
            isMock: false,
          };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch agent summary, using mock data', err);
    }

    return { data: AgentOperationsMockData.generateSummary(), isMock: true };
  }

  async fetchPerAgentMetrics(timeRange: string): Promise<{ data: any[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return { data: AgentOperationsMockData.generatePerAgentMetrics(), isMock: true };
    }

    try {
      const res = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (res.ok) {
        const rawAgents = await res.json();
        // Validate API response with Zod schema
        const agents = parseArrayResponse(agentMetricsApiSchema, rawAgents, 'per-agent-metrics');
        if (agents.length > 0) {
          return { data: agents, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch per-agent metrics, using mock data', err);
    }

    return { data: AgentOperationsMockData.generatePerAgentMetrics(), isMock: true };
  }

  async fetchRecentActions(
    timeRange: string,
    limit: number = 100
  ): Promise<{ data: RecentAction[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return { data: AgentOperationsMockData.generateRecentActions(limit), isMock: true };
    }

    try {
      const res = await fetch(
        `/api/intelligence/actions/recent?limit=${limit}&timeWindow=${timeRange}`
      );
      if (res.ok) {
        const rawData = await res.json();
        // Validate API response with Zod schema
        const data = parseArrayResponse(recentActionSchema, rawData, 'recent-actions');
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch recent actions, using mock data', err);
    }

    return { data: AgentOperationsMockData.generateRecentActions(limit), isMock: true };
  }

  async fetchHealth(): Promise<{ data: HealthStatus; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return { data: AgentOperationsMockData.generateHealth(), isMock: true };
    }

    try {
      const res = await fetch('/api/intelligence/health');
      if (res.ok) {
        const rawData = await res.json();
        // Validate API response with Zod schema
        const data = safeParseResponse(healthStatusSchema, rawData, 'health-status');
        if (data) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch health, using mock data', err);
    }

    return { data: AgentOperationsMockData.generateHealth(), isMock: true };
  }

  async fetchOperationsData(timeRange: string): Promise<{ data: any[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      // Generate mock operations data in the format expected by the chart
      const mockOperations = AgentOperationsMockData.generateOperations(8);
      return {
        data: mockOperations.map((op) => ({
          actionType: op.id,
          operationsPerMinute: op.count / 60,
          period: new Date().toISOString(),
        })),
        isMock: true,
      };
    }

    try {
      const res = await fetch(
        `/api/intelligence/metrics/operations-per-minute?timeWindow=${timeRange}`
      );
      if (res.ok) {
        const data = await res.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch operations data, using mock data', err);
    }
    return { data: [], isMock: true };
  }

  async fetchQualityImpactData(timeRange: string): Promise<{ data: any[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      const chartData = AgentOperationsMockData.generateQualityChart(20);
      return {
        data: chartData.map((point) => ({
          period: new Date().toISOString(),
          avgQualityImprovement: point.value / 100,
        })),
        isMock: true,
      };
    }

    try {
      const res = await fetch(`/api/intelligence/metrics/quality-impact?timeWindow=${timeRange}`);
      if (res.ok) {
        const data = await res.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch quality impact data, using mock data', err);
    }
    return { data: [], isMock: true };
  }

  transformOperationsForChart(operationsData: any[]): ChartDataPoint[] {
    if (!operationsData || operationsData.length === 0) return [];

    const aggregated = new Map<string, number>();
    operationsData.forEach((item) => {
      const time = new Date(item.period).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const existing = aggregated.get(time) || 0;
      const opsPerMinute = ensureNumeric('operationsPerMinute', item.operationsPerMinute, 0, {
        context: 'operations-chart-transform',
      });
      aggregated.set(time, existing + opsPerMinute);
    });

    return [
      ...Array.from(aggregated.entries()).map(([time, value]) => ({ time, value })),
    ].reverse();
  }

  transformQualityForChart(qualityData: any[]): ChartDataPoint[] {
    if (!qualityData || qualityData.length === 0) return [];

    return [
      ...qualityData.map((item) => ({
        time: new Date(item.period).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        value:
          ensureNumeric('avgQualityImprovement', item.avgQualityImprovement, 0, {
            context: 'quality-chart-transform',
          }) * 100,
      })),
    ].reverse();
  }

  transformOperationsStatus(operationsData: any[]): OperationStatus[] {
    if (!operationsData || operationsData.length === 0) return [];

    const grouped = new Map<string, { name: string; count: number; totalOps: number }>();

    operationsData.forEach((item) => {
      const actionType = withFallback('actionType', item.actionType, 'unknown', {
        context: 'operations-status-transform',
      });
      const name = actionType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const existing = grouped.get(actionType) || { name, count: 0, totalOps: 0 };
      existing.count += 1;
      const opsPerMinute = ensureNumeric('operationsPerMinute', item.operationsPerMinute, 0, {
        context: 'operations-status-transform',
      });
      existing.totalOps += opsPerMinute;
      grouped.set(actionType, existing);
    });

    return Array.from(grouped.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      status: data.totalOps > 0 ? ('running' as const) : ('idle' as const),
      count: Math.round(data.totalOps),
      avgTime: 'N/A',
    }));
  }

  async fetchAll(timeRange: string): Promise<AgentOperationsData> {
    const [summary, recentActions, perAgentMetrics, health, operationsData, qualityData] =
      await Promise.all([
        this.fetchSummary(timeRange),
        this.fetchRecentActions(timeRange, 100),
        this.fetchPerAgentMetrics(timeRange),
        this.fetchHealth(),
        this.fetchOperationsData(timeRange),
        this.fetchQualityImpactData(timeRange),
      ]);

    // Transform data for charts and operations
    const chartData = this.transformOperationsForChart(operationsData.data);
    const qualityChartData = this.transformQualityForChart(qualityData.data);
    const operations = this.transformOperationsStatus(operationsData.data);

    const totalOperations = operations.length;
    const runningOperations = operations.filter((op) => op.status === 'running').length;
    const totalOpsPerMinute = operationsData.data.reduce(
      (sum: number, item: any) =>
        sum +
        ensureNumeric('operationsPerMinute', item.operationsPerMinute, 0, {
          context: 'operations-summary-total',
        }),
      0
    );
    const avgQualityImprovement =
      qualityData.data.length > 0
        ? qualityData.data.reduce(
            (sum: number, item: any) =>
              sum +
              ensureNumeric('avgQualityImprovement', item.avgQualityImprovement, 0, {
                context: 'quality-summary-avg',
              }),
            0
          ) / qualityData.data.length
        : 0;

    return {
      summary: summary.data,
      recentActions: recentActions.data,
      perAgentMetrics: perAgentMetrics.data,
      health: health.data,
      chartData,
      qualityChartData,
      operations,
      totalOperations,
      runningOperations,
      totalOpsPerMinute,
      avgQualityImprovement,
      isMock:
        summary.isMock ||
        recentActions.isMock ||
        perAgentMetrics.isMock ||
        health.isMock ||
        operationsData.isMock ||
        qualityData.isMock,
    };
  }
}

export const agentOperationsSource = new AgentOperationsSource();
