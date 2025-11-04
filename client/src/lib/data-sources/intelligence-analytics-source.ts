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
          // Use weighted average for routing time based on request volume (more accurate)
          const totalRequestsForAvg = agents.reduce((sum, a) => sum + (a.totalRequests || 0), 0);
          const avgRoutingTime = totalRequestsForAvg > 0
            ? agents.reduce((sum, a) => {
                const weight = (a.totalRequests || 0) / totalRequestsForAvg;
                return sum + ((a.avgRoutingTime || 0) * weight);
              }, 0)
            : 0;
          // Calculate weighted average success rate (based on request volume, not simple average)
          // Detect format: if any value > 1, assume percentage format, else decimal (0-1)
          // Check both successRate and avgConfidence for format detection
          const sampleRate = agents.find(a => (a.successRate != null) || (a.avgConfidence != null));
          const sampleValue = sampleRate?.successRate ?? sampleRate?.avgConfidence;
          const isDecimalFormat = sampleValue != null && sampleValue <= 1;
          
          const avgSuccessRate = totalRequestsForAvg > 0
            ? Math.max(0, Math.min(100, agents.reduce((sum, a) => {
                const weight = (a.totalRequests || 0) / totalRequestsForAvg;
                const rate = (a.successRate != null) ? a.successRate : (a.avgConfidence || 0);
                // Convert decimal to percentage if needed
                const rateAsPercentage = isDecimalFormat ? rate * 100 : rate;
                return sum + (rateAsPercentage * weight);
              }, 0)))
            : 0;
          
          return {
            data: {
              totalQueries: totalRequests,
              avgResponseTime: avgRoutingTime,
              successRate: avgSuccessRate, // Clamped to 0-100
              fallbackRate: Math.max(0, 100 - avgSuccessRate), // Ensure non-negative
              costPerQuery: 0.001,
              totalCost: totalRequests * 0.001,
              qualityScore: (avgSuccessRate / 100) * 10, // Convert back to 0-10 scale
              userSatisfaction: (avgSuccessRate / 100) * 10, // Convert back to 0-10 scale
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

  async fetchAgentPerformance(timeRange: string): Promise<{ data: AgentPerformance[]; isMock: boolean }> {
    try {
      const response = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (response.ok) {
        const agents = await response.json();
        if (Array.isArray(agents) && agents.length > 0) {
          // Detect format for success rate
          const sampleAgent = agents.find((a: any) => (a.successRate != null) || (a.avgConfidence != null));
          const sampleValue = sampleAgent?.successRate ?? sampleAgent?.avgConfidence;
          const isDecimalFormat = sampleValue != null && sampleValue <= 1;

          const performance: AgentPerformance[] = agents.map((agent: any) => {
            const rawSuccessRate = agent.successRate ?? agent.avgConfidence ?? 0;
            const successRate = isDecimalFormat ? rawSuccessRate * 100 : rawSuccessRate;
            const clampedSuccessRate = Math.max(0, Math.min(100, successRate));
            
            return {
              agentId: agent.agent || 'unknown',
              agentName: agent.agent?.replace('agent-', '').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Unknown Agent',
              totalRuns: agent.totalRequests || 0,
              avgResponseTime: agent.avgRoutingTime || 0,
              successRate: clampedSuccessRate,
              efficiency: clampedSuccessRate, // Use success rate as efficiency proxy
              avgQualityScore: (agent.avgConfidence || 0) * 10,
              popularity: agent.totalRequests || 0,
              costPerSuccess: 0.001 * (agent.avgTokens || 1000) / 1000, // Estimate
              p95Latency: (agent.avgRoutingTime || 0) * 1.5, // Estimate p95 as 1.5x avg
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
          successRate: 95.2,
          efficiency: 95.2,
          avgQualityScore: 8.9,
          popularity: 456,
          costPerSuccess: 0.045,
          p95Latency: 1450,
        },
        {
          agentId: 'code-reviewer',
          agentName: 'Code Reviewer',
          totalRuns: 234,
          avgResponseTime: 1800,
          successRate: 92.5,
          efficiency: 92.5,
          avgQualityScore: 8.5,
          popularity: 234,
          costPerSuccess: 0.062,
          p95Latency: 2100,
        },
        {
          agentId: 'test-generator',
          agentName: 'Test Generator',
          totalRuns: 189,
          avgResponseTime: 3200,
          successRate: 89.0,
          efficiency: 89.0,
          avgQualityScore: 8.2,
          popularity: 189,
          costPerSuccess: 0.051,
          p95Latency: 3800,
        },
      ],
      isMock: true,
    };
  }

  async fetchSavingsMetrics(timeRange: string): Promise<{ data: SavingsMetrics; isMock: boolean }> {
    // Try to fetch from API first
    try {
      const response = await fetch(`/api/savings/metrics?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object') {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch savings metrics, using mock data', err);
    }

    // Mock data fallback
    return {
      data: {
        totalSavings: 45000,
        monthlySavings: 15000,
        weeklySavings: 3750,
        dailySavings: 536,
        intelligenceRuns: 15420,
        baselineRuns: 23500,
        avgTokensPerRun: 3200,
        avgComputePerRun: 1.2,
        costPerToken: 0.000002,
        costPerCompute: 0.05,
        efficiencyGain: 34.0,
        timeSaved: 128,
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
  successRate: number;
  efficiency: number;
  avgQualityScore: number;
  popularity: number;
  costPerSuccess?: number;
  p95Latency?: number;
}

export type { SavingsMetrics } from './intelligence-savings-source';

export const intelligenceAnalyticsSource = new IntelligenceAnalyticsDataSource();

