// Agent Operations Data Source
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
  action: string;
  status: string;
  timestamp: string;
  duration?: number;
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
    try {
      const res = await fetch(`/api/intelligence/agents/summary?timeWindow=${timeRange}`);
      if (res.ok) {
        const agents = await res.json();
        if (Array.isArray(agents) && agents.length > 0) {
          const totalRuns = agents.reduce((sum, a) => sum + (a.totalRequests || 0), 0);
          const activeAgents = agents.filter(a => (a.totalRequests || 0) > 0).length;
          const totalRequestsForAvg = agents.reduce((sum, a) => sum + (a.totalRequests || 0), 0);
          // Calculate weighted average success rate (request volume weighted, not simple average)
          // Detect format: if any value > 1, assume percentage format, else decimal (0-1)
          // Check both successRate and avgConfidence for format detection
          const sampleAgent = agents.find(a => (a.successRate != null) || (a.avgConfidence != null));
          const sampleValue = sampleAgent?.successRate ?? sampleAgent?.avgConfidence;
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
          // Weighted average execution time based on request volume
          const avgExecutionTimeMs = totalRequestsForAvg > 0
            ? agents.reduce((sum, a) => {
                const weight = (a.totalRequests || 0) / totalRequestsForAvg;
                return sum + ((a.avgRoutingTime || 0) * weight);
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

    return {
      data: {
        totalAgents: 0,
        activeAgents: 0,
        totalRuns: 0,
        successRate: 0,
        avgExecutionTime: 0,
      },
      isMock: true,
    };
  }

  async fetchRecentActions(timeRange: string, limit: number = 100): Promise<{ data: RecentAction[]; isMock: boolean }> {
    try {
      const res = await fetch(`/api/intelligence/actions/recent?limit=${limit}&timeWindow=${timeRange}`);
      if (res.ok) {
        const data = await res.json();
        return { data: Array.isArray(data) ? data : [], isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch recent actions, using mock data', err);
    }

    return {
      data: [],
      isMock: true,
    };
  }

  async fetchHealth(): Promise<{ data: HealthStatus; isMock: boolean }> {
    try {
      const res = await fetch('/api/intelligence/health');
      if (res.ok) {
        const data = await res.json();
        return { data, isMock: false };
      }
    } catch (err) {
      console.warn('Failed to fetch health, using mock data', err);
    }

    return {
      data: {
        status: 'healthy',
        services: [
          { name: 'PostgreSQL', status: 'up' },
          { name: 'OmniArchon', status: 'up' },
          { name: 'Qdrant', status: 'up' },
        ]
      },
      isMock: true,
    };
  }

  async fetchOperationsData(timeRange: string): Promise<{ data: any[]; isMock: boolean }> {
    try {
      const res = await fetch(`/api/intelligence/metrics/operations-per-minute?timeWindow=${timeRange}`);
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
    operationsData.forEach(item => {
      const time = new Date(item.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const existing = aggregated.get(time) || 0;
      aggregated.set(time, existing + (item.operationsPerMinute || 0));
    });

    return Array.from(aggregated.entries())
      .map(([time, value]) => ({ time, value }))
      .reverse();
  }

  transformQualityForChart(qualityData: any[]): ChartDataPoint[] {
    if (!qualityData || qualityData.length === 0) return [];
    
    return qualityData
      .map(item => ({
        time: new Date(item.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        value: (item.avgQualityImprovement || 0) * 100,
      }))
      .reverse();
  }

  transformOperationsStatus(operationsData: any[]): OperationStatus[] {
    if (!operationsData || operationsData.length === 0) return [];
    
    const grouped = new Map<string, { name: string; count: number; totalOps: number }>();
    
    operationsData.forEach(item => {
      const name = (item.actionType || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const existing = grouped.get(item.actionType || '') || { name, count: 0, totalOps: 0 };
      existing.count += 1;
      existing.totalOps += (item.operationsPerMinute || 0);
      grouped.set(item.actionType || '', existing);
    });

    return Array.from(grouped.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      status: data.totalOps > 0 ? 'running' as const : 'idle' as const,
      count: Math.round(data.totalOps),
      avgTime: 'N/A',
    }));
  }

  async fetchAll(timeRange: string): Promise<AgentOperationsData> {
    const [summary, recentActions, health, operationsData, qualityData] = await Promise.all([
      this.fetchSummary(timeRange),
      this.fetchRecentActions(timeRange, 100),
      this.fetchHealth(),
      this.fetchOperationsData(timeRange),
      this.fetchQualityImpactData(timeRange),
    ]);

    // Transform data for charts and operations
    const chartData = this.transformOperationsForChart(operationsData.data);
    const qualityChartData = this.transformQualityForChart(qualityData.data);
    const operations = this.transformOperationsStatus(operationsData.data);
    
    const totalOperations = operations.length;
    const runningOperations = operations.filter(op => op.status === 'running').length;
    const totalOpsPerMinute = operationsData.data.reduce((sum: number, item: any) => sum + (item.operationsPerMinute || 0), 0);
    const avgQualityImprovement = qualityData.data.length > 0
      ? qualityData.data.reduce((sum: number, item: any) => sum + (item.avgQualityImprovement || 0), 0) / qualityData.data.length
      : 0;

    return {
      summary: summary.data,
      recentActions: recentActions.data,
      health: health.data,
      chartData,
      qualityChartData,
      operations,
      totalOperations,
      runningOperations,
      totalOpsPerMinute,
      avgQualityImprovement,
      isMock: summary.isMock || recentActions.isMock || health.isMock || operationsData.isMock || qualityData.isMock,
    };
  }
}

export const agentOperationsSource = new AgentOperationsSource();

