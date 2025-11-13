import { MockDataGenerator as Gen, USE_MOCK_DATA } from '../mock-data/config';
import type { SavingsMetrics } from './intelligence-savings-source';
import { fallbackChain, withFallback, ensureNumeric, ensureString } from '../defensive-transform-logger';
import {
  agentMetricsApiSchema,
  recentActionSchema,
  savingsMetricsSchema,
  parseArrayResponse,
  safeParseResponse,
} from '../schemas/api-response-schemas';

// Re-export for external consumers
export type { SavingsMetrics };

export interface IntelligenceMetrics {
  totalQueries: number;
  avgResponseTime: number;
  successRate: number;
  fallbackRate: number;
  costPerQuery: number;
  totalCost: number;
  qualityScore: number;
  userSatisfaction: number;
}

export interface RecentActivity {
  action: string;
  agent: string;
  time: string;
  status: "completed" | "executing" | "failed" | "pending";
  timestamp: string;
}

class IntelligenceAnalyticsDataSource {
  async fetchMetrics(timeRange: string): Promise<{ data: IntelligenceMetrics; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: {
          totalQueries: 15420,
          avgResponseTime: 1200,
          successRate: 94.0,
          fallbackRate: 6.0,
          costPerQuery: 0.0012,
          totalCost: 18.50,
          qualityScore: 8.7,
          userSatisfaction: 8.9,
        },
        isMock: true,
      };
    }

    // Try intelligence summary endpoint
    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (response.ok) {
        const rawAgents = await response.json();
        // Validate API response with Zod schema
        const agents = parseArrayResponse(agentMetricsApiSchema, rawAgents, 'intelligence-metrics');
        if (agents.length > 0) {
          const totalRequests = agents.reduce((sum, a) =>
            sum + ensureNumeric('totalRequests', a.totalRequests, 0, { id: a.agent, context: 'intelligence-metrics-total' }), 0
          );
          // Use weighted average for routing time based on request volume (more accurate)
          const totalRequestsForAvg = agents.reduce((sum, a) =>
            sum + ensureNumeric('totalRequests', a.totalRequests, 0, { id: a.agent, context: 'intelligence-metrics-avg' }), 0
          );
          const avgRoutingTime = totalRequestsForAvg > 0
            ? agents.reduce((sum, a) => {
                const weight = ensureNumeric('totalRequests', a.totalRequests, 0, { id: a.agent, context: 'intelligence-metrics-weight' }) / totalRequestsForAvg;
                const routingTime = ensureNumeric('avgRoutingTime', a.avgRoutingTime, 0, { id: a.agent, context: 'intelligence-metrics-routing-time' });
                return sum + (routingTime * weight);
              }, 0)
            : 0;
          // Calculate weighted average success rate (based on request volume, not simple average)
          // Detect format: check all non-zero samples to determine if values are decimal (0-1) or percentage (0-100)
          // Ignore zeros as they don't indicate format (0% = 0.0 in both formats)
          const nonZeroSamples = agents
            .map(a => {
              const rate = fallbackChain(
                'successRate',
                { id: a.agent || 'unknown', context: 'intelligence-metrics-format-detection' },
                [
                  { value: a.successRate, label: 'successRate field' },
                  { value: a.avgConfidence, label: 'avgConfidence field (legacy)', level: 'warn' },
                  { value: undefined, label: 'no sample available', level: 'debug' }
                ]
              );
              return rate != null ? rate : undefined;
            })
            .filter((v): v is number => v != null && v > 0);
          
          // If we have non-zero samples, check if all are <= 1 (decimal format)
          // If any sample > 1, assume percentage format
          // Default to percentage format if no samples available
          const isDecimalFormat = nonZeroSamples.length > 0
            ? nonZeroSamples.every(v => v <= 1)
            : false;
          
          const avgSuccessRate = totalRequestsForAvg > 0
            ? Math.max(0, Math.min(100, agents.reduce((sum, a) => {
                const weight = ensureNumeric('totalRequests', a.totalRequests, 0, { id: a.agent, context: 'intelligence-success-rate-weight' }) / totalRequestsForAvg;
                const rate = fallbackChain(
                  'successRate',
                  { id: a.agent || 'unknown', context: 'intelligence-success-rate' },
                  [
                    { value: a.successRate, label: 'successRate field' },
                    { value: a.avgConfidence, label: 'avgConfidence field (legacy)', level: 'warn' },
                    { value: 0, label: 'default zero', level: 'error' }
                  ]
                );
                // Convert decimal to percentage if needed
                const rateAsPercentage = isDecimalFormat ? rate * 100 : rate;
                return sum + (rateAsPercentage * weight);
              }, 0)))
            : 0;
          
          return {
            data: {
              totalQueries: Math.max(0, totalRequests),
              avgResponseTime: Math.max(0, avgRoutingTime),
              successRate: avgSuccessRate, // Clamped to 0-100
              fallbackRate: Math.max(0, 100 - avgSuccessRate), // Ensure non-negative
              costPerQuery: 0.001,
              totalCost: Math.max(0, totalRequests * 0.001),
              qualityScore: Math.max(0, Math.min(10, (avgSuccessRate / 100) * 10)), // Clamp 0-10
              userSatisfaction: Math.max(0, Math.min(10, (avgSuccessRate / 100) * 10)), // Clamp 0-10
            },
            isMock: false,
          };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch intelligence metrics, using mock data', err);
    }

    // Mock data fallback - aligned with YC demo script
    return {
      data: {
        totalQueries: 15420,
        avgResponseTime: 1200, // 1.2s = 1200ms from script
        successRate: 94.0, // 94% from script
        fallbackRate: 6.0,
        costPerQuery: 0.0012,
        totalCost: 18.50,
        qualityScore: 8.7,
        userSatisfaction: 8.9,
      },
      isMock: true,
    };
  }

  async fetchRecentActivity(limit: number = 5): Promise<{ data: RecentActivity[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: [
          { action: "API optimization query", agent: "agent-performance", time: "2m ago", status: "completed", timestamp: new Date(Date.now() - 120000).toISOString() },
          { action: "Debug database connection", agent: "agent-debug-intelligence", time: "5m ago", status: "completed", timestamp: new Date(Date.now() - 300000).toISOString() },
          { action: "Create React component", agent: "agent-frontend-developer", time: "8m ago", status: "executing", timestamp: new Date(Date.now() - 480000).toISOString() },
          { action: "Write unit tests", agent: "agent-testing", time: "12m ago", status: "completed", timestamp: new Date(Date.now() - 720000).toISOString() },
          { action: "Design microservices", agent: "agent-api-architect", time: "15m ago", status: "completed", timestamp: new Date(Date.now() - 900000).toISOString() },
        ],
        isMock: true,
      };
    }

    // Try intelligence actions endpoint
    try {
      const response = await fetch(`/api/intelligence/actions/recent?limit=${limit}`);
      if (response.ok) {
        const rawActions = await response.json();
        // Validate API response with Zod schema
        const actions = parseArrayResponse(recentActionSchema, rawActions, 'recent-activity-actions');
        if (actions.length > 0) {
          const activities: RecentActivity[] = actions.map((action: any) => ({
            action: withFallback('action', action.action, 'Unknown action', { id: action.id, context: 'recent-activity-action' }),
            agent: withFallback('agentName', action.agentName, 'unknown', { id: action.id, context: 'recent-activity-agent' }),
            time: this.formatTimeAgo(action.timestamp),
            status: action.status as RecentActivity['status'],
            timestamp: action.timestamp,
          }));
          return { data: activities, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch recent activity, using mock data', err);
    }

    // Try agent executions
    try {
      const response = await fetch(`/api/agents/executions?limit=${limit}`);
      if (response.ok) {
        const executions = await response.json();
        if (Array.isArray(executions) && executions.length > 0) {
          const activities: RecentActivity[] = executions.map((exec: any) => ({
            action: fallbackChain(
              'query',
              { id: exec.id, context: 'executions-action' },
              [
                { value: exec.query, label: 'query field' },
                { value: exec.actionName, label: 'actionName field (fallback)', level: 'warn' },
                { value: 'Task execution', label: 'default task execution', level: 'error' }
              ]
            ),
            agent: fallbackChain(
              'agentName',
              { id: exec.id, context: 'executions-agent' },
              [
                { value: exec.agentName, label: 'agentName field' },
                { value: exec.agentId, label: 'agentId field (fallback)', level: 'warn' },
                { value: 'unknown', label: 'default unknown', level: 'error' }
              ]
            ),
            time: this.formatTimeAgo(exec.startedAt),
            status: exec.status,
            timestamp: exec.startedAt,
          }));
          return { data: activities, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch executions, using mock data', err);
    }

    // Mock data fallback
    return {
      data: [
        { action: "API optimization query", agent: "agent-performance", time: "2m ago", status: "completed", timestamp: new Date(Date.now() - 120000).toISOString() },
        { action: "Debug database connection", agent: "agent-debug-intelligence", time: "5m ago", status: "completed", timestamp: new Date(Date.now() - 300000).toISOString() },
        { action: "Create React component", agent: "agent-frontend-developer", time: "8m ago", status: "executing", timestamp: new Date(Date.now() - 480000).toISOString() },
        { action: "Write unit tests", agent: "agent-testing", time: "12m ago", status: "completed", timestamp: new Date(Date.now() - 720000).toISOString() },
        { action: "Design microservices", agent: "agent-api-architect", time: "15m ago", status: "completed", timestamp: new Date(Date.now() - 900000).toISOString() },
      ],
      isMock: true,
    };
  }

  async fetchAgentPerformance(timeRange: string): Promise<{ data: AgentPerformance[]; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: [
          {
            agentId: 'polymorphic-agent',
            agentName: 'Polymorphic Agent',
            totalRuns: 456,
            avgResponseTime: 1200,
            avgExecutionTime: 1200,
            successRate: 95.2,
            efficiency: 95.2,
            avgQualityScore: 8.9,
            popularity: 456,
            costPerSuccess: 0.045,
            p95Latency: 1450,
            lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
          {
            agentId: 'code-reviewer',
            agentName: 'Code Reviewer',
            totalRuns: 234,
            avgResponseTime: 1800,
            avgExecutionTime: 1800,
            successRate: 92.5,
            efficiency: 92.5,
            avgQualityScore: 8.5,
            popularity: 234,
            costPerSuccess: 0.062,
            p95Latency: 2100,
            lastUsed: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          },
          {
            agentId: 'test-generator',
            agentName: 'Test Generator',
            totalRuns: 189,
            avgResponseTime: 3200,
            avgExecutionTime: 3200,
            successRate: 89.0,
            efficiency: 89.0,
            avgQualityScore: 8.2,
            popularity: 189,
            costPerSuccess: 0.051,
            p95Latency: 3800,
            lastUsed: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
          },
        ],
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (response.ok) {
        const rawAgents = await response.json();
        // Validate API response with Zod schema
        const agents = parseArrayResponse(agentMetricsApiSchema, rawAgents, 'agent-performance');
        if (agents.length > 0) {
          // Detect format for success rate: check all non-zero samples to determine if values are decimal (0-1) or percentage (0-100)
          // Ignore zeros as they don't indicate format (0% = 0.0 in both formats)
          const nonZeroSamples = agents
            .map((a: any) => {
              const rate = fallbackChain(
                'successRate',
                { id: a.agent || 'unknown', context: 'agent-performance-format-detection' },
                [
                  { value: a.successRate, label: 'successRate field' },
                  { value: a.avgConfidence, label: 'avgConfidence field (legacy)', level: 'warn' },
                  { value: undefined, label: 'no sample available', level: 'debug' }
                ]
              );
              return rate != null ? rate : undefined;
            })
            .filter((v): v is number => v != null && v > 0);
          
          // If we have non-zero samples, check if all are <= 1 (decimal format)
          // If any sample > 1, assume percentage format
          // Default to percentage format if no samples available
          const isDecimalFormat = nonZeroSamples.length > 0
            ? nonZeroSamples.every(v => v <= 1)
            : false;

          const performance: AgentPerformance[] = agents.map((agent: any) => {
            const rawSuccessRate = fallbackChain(
              'successRate',
              { id: agent.agent || 'unknown', context: 'agent-performance-success-rate' },
              [
                { value: agent.successRate, label: 'successRate field' },
                { value: agent.avgConfidence, label: 'avgConfidence field (legacy)', level: 'warn' },
                { value: 0, label: 'default zero', level: 'error' }
              ]
            );
            const successRate = isDecimalFormat ? rawSuccessRate * 100 : rawSuccessRate;
            const clampedSuccessRate = Math.max(0, Math.min(100, successRate));

            return {
              agentId: withFallback('agent', agent.agent, 'unknown', { context: 'agent-performance-id' }),
              agentName: agent.agent?.replace('agent-', '').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Unknown Agent',
              totalRuns: Math.max(0, ensureNumeric('totalRequests', agent.totalRequests, 0, { id: agent.agent, context: 'agent-performance-total-runs' })),
              avgResponseTime: Math.max(0, ensureNumeric('avgRoutingTime', agent.avgRoutingTime, 0, { id: agent.agent, context: 'agent-performance-response-time' })),
              avgExecutionTime: Math.max(0, ensureNumeric('avgRoutingTime', agent.avgRoutingTime, 0, { id: agent.agent, context: 'agent-performance-exec-time' })),
              successRate: clampedSuccessRate,
              efficiency: clampedSuccessRate, // Use success rate as efficiency proxy
              avgQualityScore: Math.max(0, Math.min(10, ensureNumeric('avgConfidence', agent.avgConfidence, 0, { id: agent.agent, context: 'agent-performance-quality' }) * 10)),
              popularity: Math.max(0, ensureNumeric('totalRequests', agent.totalRequests, 0, { id: agent.agent, context: 'agent-performance-popularity' })),
              costPerSuccess: Math.max(0, 0.001 * ensureNumeric('avgTokens', agent.avgTokens, 1000, { id: agent.agent, context: 'agent-performance-tokens' }) / 1000), // Ensure positive
              p95Latency: Math.max(0, ensureNumeric('avgRoutingTime', agent.avgRoutingTime, 0, { id: agent.agent, context: 'agent-performance-latency' }) * 1.5), // Ensure positive
              lastUsed: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
            };
          });

          return { data: performance, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch agent performance, using mock data', err);
    }

    // Mock data fallback
    return {
      data: [
        {
          agentId: 'polymorphic-agent',
          agentName: 'Polymorphic Agent',
          totalRuns: 456,
          avgResponseTime: 1200,
          avgExecutionTime: 1200,
          successRate: 95.2,
          efficiency: 95.2,
          avgQualityScore: 8.9,
          popularity: 456,
          costPerSuccess: 0.045,
          p95Latency: 1450,
          lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          agentId: 'code-reviewer',
          agentName: 'Code Reviewer',
          totalRuns: 234,
          avgResponseTime: 1800,
          avgExecutionTime: 1800,
          successRate: 92.5,
          efficiency: 92.5,
          avgQualityScore: 8.5,
          popularity: 234,
          costPerSuccess: 0.062,
          p95Latency: 2100,
          lastUsed: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        },
        {
          agentId: 'test-generator',
          agentName: 'Test Generator',
          totalRuns: 189,
          avgResponseTime: 3200,
          avgExecutionTime: 3200,
          successRate: 89.0,
          efficiency: 89.0,
          avgQualityScore: 8.2,
          popularity: 189,
          costPerSuccess: 0.051,
          p95Latency: 3800,
          lastUsed: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        },
      ],
      isMock: true,
    };
  }

  async fetchSavingsMetrics(timeRange: string): Promise<{ data: SavingsMetrics; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      const dailySavings = Math.max(1, Gen.currency(10, 50, 2));
      const weeklySavings = Math.max(dailySavings * 7, Gen.currency(100, 500, 2));
      const monthlySavings = Math.max(weeklySavings * 4, Gen.currency(5000, 50000, 2));
      const totalSavings = Math.max(monthlySavings * 1.5, Gen.currency(10000, 100000, 2));
      const efficiencyGain = Math.max(15, Math.min(45, Gen.randomFloat(25, 45, 1)));
      const timeSaved = Math.max(10, Gen.randomFloat(50, 250, 1));

      return {
        data: {
          totalSavings: Math.max(0, totalSavings),
          monthlySavings: Math.max(0, monthlySavings),
          weeklySavings: Math.max(0, weeklySavings),
          dailySavings: Math.max(0, dailySavings),
          intelligenceRuns: 15420,
          baselineRuns: 23500,
          avgTokensPerRun: 3200,
          avgComputePerRun: 1.2,
          costPerToken: 0.000002,
          costPerCompute: 0.05,
          efficiencyGain: Math.max(0, efficiencyGain),
          timeSaved: Math.max(1, timeSaved),
        },
        isMock: true,
      };
    }

    // Try to fetch from API first
    try {
      const response = await fetch(`/api/savings/metrics?timeRange=${timeRange}`);
      if (response.ok) {
        const rawData = await response.json();
        // Validate API response with Zod schema
        const data = safeParseResponse(savingsMetricsSchema, rawData, 'savings-metrics');
        if (data) {
          return { data, isMock: false };
        } else {
          console.warn('Savings metrics validation failed, using mock data');
        }
      }
    } catch (err) {
      console.warn('Failed to fetch savings metrics, using mock data', err);
    }

    // Mock data fallback - always generates positive values for demonstration
    // Note: Real API data can be negative to indicate performance regressions
    // Generate values that maintain logical relationships: daily < weekly < monthly < total
    const dailySavings = Math.max(1, Gen.currency(10, 50, 2)); // At least $1, typically $10-50/day
    const weeklySavings = Math.max(dailySavings * 7, Gen.currency(100, 500, 2)); // At least 7x daily
    const monthlySavings = Math.max(weeklySavings * 4, Gen.currency(5000, 50000, 2)); // At least 4x weekly
    const totalSavings = Math.max(monthlySavings * 1.5, Gen.currency(10000, 100000, 2)); // At least 1.5x monthly
    const efficiencyGain = Math.max(15, Math.min(45, Gen.randomFloat(25, 45, 1))); // 15-45%, realistic range
    const timeSaved = Math.max(10, Gen.randomFloat(50, 250, 1)); // At least 10h, typically 50-250 hours (matches API format: hours not seconds)

    return {
      data: {
        totalSavings,
        monthlySavings,
        weeklySavings,
        dailySavings,
        intelligenceRuns: 15420,
        baselineRuns: 23500,
        avgTokensPerRun: 3200,
        avgComputePerRun: 1.2,
        costPerToken: 0.000002,
        costPerCompute: 0.05,
        efficiencyGain,
        timeSaved,
      },
      isMock: true,
    };
  }

  private formatTimeAgo(timestamp: string): string {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalRuns: number;
  avgResponseTime: number;
  avgExecutionTime: number;
  successRate: number;
  efficiency: number;
  avgQualityScore: number;
  popularity: number;
  costPerSuccess?: number;
  p95Latency?: number;
  lastUsed: string;
}

export const intelligenceAnalyticsSource = new IntelligenceAnalyticsDataSource();

