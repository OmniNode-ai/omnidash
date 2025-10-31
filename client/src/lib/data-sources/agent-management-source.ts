// Note: eventConsumer is server-side only, so we'll fetch via API

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
  status: "pending" | "executing" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  duration?: number;
  result?: {
    success: boolean;
    output?: string;
    qualityScore?: number;
  };
}

export interface AgentManagementData {
  summary: AgentSummary;
  routingStats: RoutingStats;
  recentExecutions: AgentExecution[];
  isMock: boolean;
}

class AgentManagementDataSource {
  async fetchSummary(timeRange: string): Promise<{ data: AgentSummary; isMock: boolean }> {
    try {
      const response = await fetch(`/api/agents/summary?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch agent summary from API, using mock data', err);
    }

    // Fallback to intelligence API
    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (response.ok) {
        const agents = await response.json();
        const summary: AgentSummary = {
          totalAgents: agents.length || 0,
          activeAgents: agents.filter((a: any) => a.totalRequests > 0).length || 0,
          totalRuns: agents.reduce((sum: number, a: any) => sum + (a.totalRequests || 0), 0),
          successRate: agents.length 
            ? agents.reduce((sum: number, a: any) => sum + (a.avgConfidence || 0), 0) / agents.length * 100
            : 0,
          avgExecutionTime: agents.length
            ? agents.reduce((sum: number, a: any) => sum + (a.avgRoutingTime || 0), 0) / agents.length / 1000
            : 0,
          totalSavings: 0,
        };
        return { data: summary, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch from intelligence API, using mock data', err);
    }

    // Mock data fallback
    return {
      data: {
        totalAgents: 15,
        activeAgents: 12,
        totalRuns: 1250,
        successRate: 94.5,
        avgExecutionTime: 2.3,
        totalSavings: 45000,
      },
      isMock: true,
    };
  }

  async fetchRoutingStats(timeRange: string): Promise<{ data: RoutingStats; isMock: boolean }> {
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
          const totalDecisions = metrics.reduce((sum: number, m: any) => sum + (m.totalRequests || 0), 0);
          const avgConfidence = metrics.reduce((sum: number, m: any) => sum + (m.avgConfidence || 0), 0) / metrics.length;
          const avgRoutingTime = metrics.reduce((sum: number, m: any) => sum + (m.avgRoutingTime || 0), 0) / metrics.length;
          
          const stats: RoutingStats = {
            totalDecisions,
            avgConfidence,
            avgRoutingTime,
            accuracy: avgConfidence * 100,
            strategyBreakdown: {},
            topAgents: metrics.slice(0, 5).map((m: any) => ({
              agentId: m.agent || 'unknown',
              agentName: m.agent || 'Unknown',
              usage: m.totalRequests || 0,
              successRate: (m.avgConfidence || 0) * 100,
            })),
          };
          return { data: stats, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch from intelligence API, using mock data', err);
    }

    // Mock data fallback
    return {
      data: {
        totalDecisions: 15420,
        avgConfidence: 0.942,
        avgRoutingTime: 45,
        accuracy: 94.2,
        strategyBreakdown: {
          enhanced_fuzzy_matching: 850,
          exact_match: 100,
          fallback: 50,
        },
        topAgents: [
          { agentId: 'polymorphic-agent', agentName: 'Polymorphic Agent', usage: 456, successRate: 95.2 },
          { agentId: 'code-reviewer', agentName: 'Code Reviewer', usage: 234, successRate: 92.5 },
        ],
      },
      isMock: true,
    };
  }

  async fetchRecentExecutions(timeRange: string, limit: number = 10): Promise<{ data: AgentExecution[]; isMock: boolean }> {
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
          const executions: AgentExecution[] = actions.map((action: any) => ({
            id: action.id || action.correlationId || '',
            agentId: action.agentName || 'unknown',
            agentName: action.agentName || 'Unknown Agent',
            query: action.actionName || action.actionType || 'Unknown action',
            status: action.actionType === 'error' ? 'failed' : 
                    action.durationMs ? 'completed' : 'executing',
            startedAt: action.createdAt || new Date().toISOString(),
            completedAt: action.durationMs ? action.createdAt : undefined,
            duration: action.durationMs ? action.durationMs / 1000 : undefined,
            result: {
              success: action.actionType !== 'error',
              qualityScore: 8.5,
            },
          }));
          return { data: executions, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch from intelligence API, using mock data', err);
    }

    // Mock data fallback
    return {
      data: [],
      isMock: true,
    };
  }

  async fetchAll(timeRange: string): Promise<AgentManagementData> {
    const [summary, routingStats, executions] = await Promise.all([
      this.fetchSummary(timeRange),
      this.fetchRoutingStats(timeRange),
      this.fetchRecentExecutions(timeRange, 10),
    ]);

    return {
      summary: summary.data,
      routingStats: routingStats.data,
      recentExecutions: executions.data,
      isMock: summary.isMock || routingStats.isMock || executions.isMock,
    };
  }
}

export const agentManagementSource = new AgentManagementDataSource();

