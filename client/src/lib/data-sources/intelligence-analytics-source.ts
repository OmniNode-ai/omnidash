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
    // Try intelligence summary endpoint
    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (response.ok) {
        const agents = await response.json();
        if (Array.isArray(agents) && agents.length > 0) {
          const totalRequests = agents.reduce((sum, a) => sum + (a.totalRequests || 0), 0);
          const avgRoutingTime = agents.reduce((sum, a) => sum + (a.avgRoutingTime || 0), 0) / agents.length;
          const avgConfidence = agents.reduce((sum, a) => sum + (a.avgConfidence || 0), 0) / agents.length;
          
          return {
            data: {
              totalQueries: totalRequests,
              avgResponseTime: avgRoutingTime,
              successRate: avgConfidence * 100,
              fallbackRate: (1 - avgConfidence) * 100,
              costPerQuery: 0.001,
              totalCost: totalRequests * 0.001,
              qualityScore: avgConfidence * 10,
              userSatisfaction: avgConfidence * 10,
            },
            isMock: false,
          };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch intelligence metrics, using mock data', err);
    }

    // Mock data fallback
    return {
      data: {
        totalQueries: 15420,
        avgResponseTime: 245,
        successRate: 94.2,
        fallbackRate: 5.8,
        costPerQuery: 0.0012,
        totalCost: 18.50,
        qualityScore: 8.7,
        userSatisfaction: 8.9,
      },
      isMock: true,
    };
  }

  async fetchRecentActivity(limit: number = 5): Promise<{ data: RecentActivity[]; isMock: boolean }> {
    // Try intelligence actions endpoint
    try {
      const response = await fetch(`/api/intelligence/actions/recent?limit=${limit}`);
      if (response.ok) {
        const actions = await response.json();
        if (Array.isArray(actions) && actions.length > 0) {
          const activities: RecentActivity[] = actions.map((action: any) => ({
            action: action.actionName || action.actionType || 'Unknown action',
            agent: action.agentName || 'unknown',
            time: this.formatTimeAgo(action.createdAt),
            status: action.actionType === 'error' ? 'failed' : 
                    action.durationMs ? 'completed' : 'executing',
            timestamp: action.createdAt,
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
            action: exec.query || exec.actionName || 'Task execution',
            agent: exec.agentName || exec.agentId || 'unknown',
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

export const intelligenceAnalyticsSource = new IntelligenceAnalyticsDataSource();

