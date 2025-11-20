// Note: eventConsumer is server-side only, so we'll fetch via API
import { USE_MOCK_DATA, AgentManagementMockData } from '../mock-data';
import { fallbackChain, withFallback, ensureNumeric } from '../defensive-transform-logger';

export interface AgentSummary {
  totalAgents: number;
  activeAgents: number;
  totalRuns: number;
  successRate: number;
  avgExecutionTime: number;
  totalSavings: number;
}

export interface RoutingStats {
  totalDecisions: number;
  avgConfidence: number;
  avgRoutingTime: number;
  accuracy: number;
  strategyBreakdown: Record<string, number>;
  topAgents: Array<{
    agentId: string;
    agentName: string;
    usage: number;
    successRate: number;
  }>;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  agentName: string;
  query: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  result?: {
    success: boolean;
    output?: string;
    qualityScore?: number;
  };
}

export interface RoutingDecision {
  id: string;
  correlationId: string;
  userRequest: string;
  selectedAgent: string;
  confidenceScore: number; // 0.0-1.0
  routingStrategy: string;
  alternatives?: Array<{
    agent: string;
    confidence: number;
  }>;
  reasoning?: string;
  routingTimeMs: number;
  createdAt: string;
}

export interface AgentManagementData {
  summary: AgentSummary;
  routingStats: RoutingStats;
  recentExecutions: AgentExecution[];
  recentDecisions: RoutingDecision[];
  isMock: boolean;
}

class AgentManagementDataSource {
  async fetchSummary(timeRange: string): Promise<{ data: AgentSummary; isMock: boolean }> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      const mockData = AgentManagementMockData.generateSummary();
      return { data: mockData, isMock: true };
    }

    // Use intelligence API first - it has real performance data from database
    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (response.ok) {
        const agents = await response.json();
        if (Array.isArray(agents) && agents.length > 0) {
          const totalRuns = agents.reduce(
            (sum: number, a: any) =>
              sum +
              ensureNumeric('totalRequests', a.totalRequests, 0, {
                id: a.agent,
                context: 'agent-summary-total-runs',
              }),
            0
          );
          const activeAgents = agents.filter(
            (a: any) =>
              ensureNumeric('totalRequests', a.totalRequests, 0, {
                id: a.agent,
                context: 'agent-summary-active-check',
              }) > 0
          );
          // Calculate success rate - API may return decimal (0-1) or percentage (0-100)
          // Detect format: if any value > 1, assume percentage format, else decimal
          const sampleAgent = agents.find((a: any) => a.successRate != null);
          const sampleRate = sampleAgent
            ? ensureNumeric('successRate', sampleAgent.successRate, 0, {
                id: sampleAgent.agent,
                context: 'format-detection',
              })
            : undefined;
          const isDecimalFormat = sampleRate != null && sampleRate <= 1;

          const avgSuccessRate = agents.length
            ? Math.max(
                0,
                Math.min(
                  100,
                  agents.reduce((sum: number, a: any) => {
                    const rate = ensureNumeric('successRate', a.successRate, 0, {
                      id: a.agent,
                      context: 'agent-summary-success-rate',
                    });
                    return sum + (isDecimalFormat ? rate * 100 : rate);
                  }, 0) / agents.length
                )
              )
            : 0;
          // avgRoutingTime is already in milliseconds from the API
          // Calculate weighted average based on request volume, then convert to seconds
          const totalRequestsForCalc = agents.reduce(
            (sum: number, a: any) =>
              sum +
              ensureNumeric('totalRequests', a.totalRequests, 0, {
                id: a.agent,
                context: 'agent-summary-weight-calc',
              }),
            0
          );
          const avgExecutionTimeMs =
            totalRequestsForCalc > 0
              ? agents.reduce((sum: number, a: any) => {
                  const weight =
                    ensureNumeric('totalRequests', a.totalRequests, 0, {
                      id: a.agent,
                      context: 'agent-summary-weight',
                    }) / totalRequestsForCalc;
                  const routingTime = ensureNumeric('avgRoutingTime', a.avgRoutingTime, 0, {
                    id: a.agent,
                    context: 'agent-summary-routing-time',
                  });
                  return sum + routingTime * weight;
                }, 0)
              : 0;
          // Convert milliseconds to seconds, but ensure we don't show impossibly small values
          const avgExecutionTime = avgExecutionTimeMs > 0 ? avgExecutionTimeMs / 1000 : 0;

          const summary: AgentSummary = {
            totalAgents: agents.length,
            activeAgents: activeAgents.length,
            totalRuns,
            successRate: avgSuccessRate,
            avgExecutionTime,
            totalSavings: 0,
          };
          return { data: summary, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch from intelligence API, trying registry API', err);
    }

    // Fallback to registry API (static agent definitions)
    try {
      const response = await fetch(`/api/agents/summary?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        // Only use if it has actual performance data
        if (data.totalRuns > 0 || data.activeAgents > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch agent summary from registry API', err);
    }

    // Mock data fallback
    return { data: AgentManagementMockData.generateSummary(), isMock: true };
  }

  async fetchRoutingStats(timeRange: string): Promise<{ data: RoutingStats; isMock: boolean }> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return { data: AgentManagementMockData.generateRoutingStats(), isMock: true };
    }

    try {
      const response = await fetch(`/api/agents/routing/stats?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch routing stats from API, using mock data', err);
    }

    // Try intelligence routing decisions via API
    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (response.ok) {
        const metrics = await response.json();
        if (Array.isArray(metrics) && metrics.length > 0) {
          const totalDecisions = metrics.reduce(
            (sum: number, m: any) =>
              sum +
              ensureNumeric('totalRequests', m.totalRequests, 0, {
                id: m.agent,
                context: 'routing-stats-decisions',
              }),
            0
          );
          const avgConfidence =
            metrics.reduce(
              (sum: number, m: any) =>
                sum +
                ensureNumeric('avgConfidence', m.avgConfidence, 0, {
                  id: m.agent,
                  context: 'routing-stats-confidence',
                }),
              0
            ) / metrics.length;
          const avgRoutingTime =
            metrics.reduce(
              (sum: number, m: any) =>
                sum +
                ensureNumeric('avgRoutingTime', m.avgRoutingTime, 0, {
                  id: m.agent,
                  context: 'routing-stats-time',
                }),
              0
            ) / metrics.length;

          const stats: RoutingStats = {
            totalDecisions,
            avgConfidence,
            avgRoutingTime,
            accuracy: avgConfidence * 100,
            strategyBreakdown: {},
            topAgents: metrics.slice(0, 5).map((m: any) => ({
              agentId: withFallback('agent', m.agent, 'unknown', {
                context: 'routing-stats-agent-id',
              }),
              agentName: withFallback('agent', m.agent, 'Unknown', {
                context: 'routing-stats-agent-name',
              }),
              usage: ensureNumeric('totalRequests', m.totalRequests, 0, {
                id: m.agent,
                context: 'routing-stats-usage',
              }),
              successRate: Math.max(
                0,
                Math.min(
                  100,
                  ensureNumeric('avgConfidence', m.avgConfidence, 0, {
                    id: m.agent,
                    context: 'routing-stats-success',
                  }) * 100
                )
              ),
            })),
          };
          return { data: stats, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch from intelligence API, using mock data', err);
    }

    // Mock data fallback
    return { data: AgentManagementMockData.generateRoutingStats(), isMock: true };
  }

  async fetchRecentExecutions(
    timeRange: string,
    limit: number = 10
  ): Promise<{ data: AgentExecution[]; isMock: boolean }> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return { data: AgentManagementMockData.generateRecentExecutions(limit), isMock: true };
    }

    try {
      const response = await fetch(`/api/agents/executions?timeRange=${timeRange}&limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch executions from API, using mock data', err);
    }

    // Try intelligence actions
    try {
      const response = await fetch(`/api/intelligence/actions/recent?limit=${limit}`);
      if (response.ok) {
        const actions = await response.json();
        if (Array.isArray(actions) && actions.length > 0) {
          const executions: AgentExecution[] = actions.map((action: any) => {
            const durationMs =
              action.durationMs !== undefined
                ? ensureNumeric('durationMs', action.durationMs, 0, {
                    id: action.id,
                    context: 'executions-duration',
                  })
                : undefined;

            return {
              id: fallbackChain('id', { context: 'executions' }, [
                { value: action.id, label: 'id field' },
                { value: action.correlationId, label: 'correlationId field', level: 'warn' },
                { value: '', label: 'empty string', level: 'error' },
              ]),
              agentId: withFallback('agentName', action.agentName, 'unknown', {
                id: action.id,
                context: 'executions-agent-id',
              }),
              agentName: withFallback('agentName', action.agentName, 'Unknown Agent', {
                id: action.id,
                context: 'executions-agent-name',
              }),
              query: fallbackChain('query', { id: action.id, context: 'executions' }, [
                { value: action.actionName, label: 'actionName field' },
                { value: action.actionType, label: 'actionType field', level: 'warn' },
                { value: 'Unknown action', label: 'default', level: 'error' },
              ]),
              status:
                action.actionType === 'error'
                  ? ('failed' as const)
                  : durationMs
                    ? ('completed' as const)
                    : ('executing' as const),
              startedAt: withFallback('createdAt', action.createdAt, new Date().toISOString(), {
                id: action.id,
                context: 'executions-timestamp',
              }),
              completedAt: durationMs ? action.createdAt : undefined,
              duration: durationMs ? durationMs / 1000 : undefined,
              result: {
                success: action.actionType !== 'error',
                qualityScore: 8.5,
              },
            };
          });
          return { data: executions, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch from intelligence API, using mock data', err);
    }

    // Mock data fallback
    return { data: AgentManagementMockData.generateRecentExecutions(limit), isMock: true };
  }

  async fetchRecentDecisions(
    limit: number = 10
  ): Promise<{ data: RoutingDecision[]; isMock: boolean }> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return { data: AgentManagementMockData.generateRecentDecisions(limit), isMock: true };
    }

    try {
      const response = await fetch(`/api/intelligence/routing/decisions?limit=${limit}`);
      if (response.ok) {
        const decisions = await response.json();
        if (Array.isArray(decisions) && decisions.length > 0) {
          return { data: decisions, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch routing decisions from API, using mock data', err);
    }

    // Mock data fallback
    return { data: AgentManagementMockData.generateRecentDecisions(limit), isMock: true };
  }

  async fetchAll(timeRange: string): Promise<AgentManagementData> {
    const [summary, routingStats, executions, decisions] = await Promise.all([
      this.fetchSummary(timeRange),
      this.fetchRoutingStats(timeRange),
      this.fetchRecentExecutions(timeRange, 10),
      this.fetchRecentDecisions(10),
    ]);

    return {
      summary: summary.data,
      routingStats: routingStats.data,
      recentExecutions: executions.data,
      recentDecisions: decisions.data,
      isMock: summary.isMock || routingStats.isMock || executions.isMock || decisions.isMock,
    };
  }
}

export const agentManagementSource = new AgentManagementDataSource();
