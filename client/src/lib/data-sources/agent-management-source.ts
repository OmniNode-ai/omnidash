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
    // Use intelligence API first - it has real performance data from database
    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (response.ok) {
        const agents = await response.json();
        if (Array.isArray(agents) && agents.length > 0) {
          const totalRuns = agents.reduce((sum: number, a: any) => sum + (a.totalRequests || 0), 0);
          const activeAgents = agents.filter((a: any) => (a.totalRequests || 0) > 0);
          // Calculate success rate - API may return decimal (0-1) or percentage (0-100)
          // Detect format: if any value > 1, assume percentage format, else decimal
          const sampleRate = agents.find((a: any) => a.successRate != null)?.successRate;
          const isDecimalFormat = sampleRate != null && sampleRate <= 1;
          
          const avgSuccessRate = agents.length 
            ? Math.max(0, Math.min(100, agents.reduce((sum: number, a: any) => {
                const rate = a.successRate || 0;
                return sum + (isDecimalFormat ? rate * 100 : rate);
              }, 0) / agents.length))
            : 0;
          // avgRoutingTime is already in milliseconds from the API
          // Calculate weighted average based on request volume, then convert to seconds
          const totalRequestsForCalc = agents.reduce((sum: number, a: any) => sum + (a.totalRequests || 0), 0);
          const avgExecutionTimeMs = totalRequestsForCalc > 0
            ? agents.reduce((sum: number, a: any) => {
                const weight = (a.totalRequests || 0) / totalRequestsForCalc;
                return sum + ((a.avgRoutingTime || 0) * weight);
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

    // Mock data fallback - aligned with YC demo script metrics
    return {
      data: {
        totalAgents: 15,
        activeAgents: 12,
        totalRuns: 1200, // ~1200 requests/day for demo
        successRate: 94.0, // 94% success rate from script
        avgExecutionTime: 1.2, // 1.2s avg response time from script
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
              successRate: Math.max(0, Math.min(100, (m.avgConfidence || 0) * 100)),
            })),
          };
          return { data: stats, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch from intelligence API, using mock data', err);
    }

    // Mock data fallback - aligned with YC demo script
    return {
      data: {
        totalDecisions: 15420,
        avgConfidence: 0.942,
        avgRoutingTime: 45, // 45ms from demo script
        accuracy: 94.2, // 94.2% from demo script
        strategyBreakdown: {
          enhanced_fuzzy_matching: 10000,
          exact_match: 3500,
          capability_alignment: 1200,
          fallback: 720,
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

  async fetchRecentDecisions(limit: number = 10): Promise<{ data: RoutingDecision[]; isMock: boolean }> {
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
    return {
      data: [],
      isMock: true,
    };
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

