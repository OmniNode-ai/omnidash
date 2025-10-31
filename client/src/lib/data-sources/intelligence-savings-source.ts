export interface SavingsMetrics {
  totalSavings: number;
  monthlySavings: number;
  weeklySavings: number;
  dailySavings: number;
  intelligenceRuns: number;
  baselineRuns: number;
  avgTokensPerRun: number;
  avgComputePerRun: number;
  costPerToken: number;
  costPerCompute: number;
  efficiencyGain: number;
  timeSaved: number;
}

export interface AgentComparison {
  agentId: string;
  agentName: string;
  withIntelligence: {
    avgTokens: number;
    avgCompute: number;
    avgTime: number;
    successRate: number;
    cost: number;
  };
  withoutIntelligence: {
    avgTokens: number;
    avgCompute: number;
    avgTime: number;
    successRate: number;
    cost: number;
  };
  savings: {
    tokens: number;
    compute: number;
    time: number;
    cost: number;
    percentage: number;
  };
}

export interface TimeSeriesData {
  date: string;
  withIntelligence: {
    tokens: number;
    compute: number;
    cost: number;
    runs: number;
  };
  withoutIntelligence: {
    tokens: number;
    compute: number;
    cost: number;
    runs: number;
  };
  savings: {
    tokens: number;
    compute: number;
    cost: number;
    percentage: number;
  };
}

class IntelligenceSavingsDataSource {
  async fetchMetrics(timeRange: string): Promise<{ data: SavingsMetrics; isMock: boolean }> {
    try {
      const response = await fetch(`/api/savings/metrics?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        return { data, isMock: false };
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
        efficiencyGain: 34.4,
        timeSaved: 128,
      },
      isMock: true,
    };
  }

  async fetchAgentComparisons(timeRange: string): Promise<{ data: AgentComparison[]; isMock: boolean }> {
    try {
      const response = await fetch(`/api/savings/agents?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch agent comparisons, using mock data', err);
    }

    // Mock data fallback
    return {
      data: [
        {
          agentId: "polymorphic-agent",
          agentName: "Polymorphic Agent",
          withIntelligence: { avgTokens: 2500, avgCompute: 0.8, avgTime: 1.2, successRate: 95, cost: 0.045 },
          withoutIntelligence: { avgTokens: 4500, avgCompute: 1.5, avgTime: 2.5, successRate: 88, cost: 0.082 },
          savings: { tokens: 2000, compute: 0.7, time: 1.3, cost: 0.037, percentage: 45.1 }
        },
        {
          agentId: "code-reviewer",
          agentName: "Code Reviewer",
          withIntelligence: { avgTokens: 3200, avgCompute: 1.1, avgTime: 2.1, successRate: 92, cost: 0.062 },
          withoutIntelligence: { avgTokens: 5100, avgCompute: 1.8, avgTime: 3.8, successRate: 85, cost: 0.098 },
          savings: { tokens: 1900, compute: 0.7, time: 1.7, cost: 0.036, percentage: 36.7 }
        },
        {
          agentId: "test-generator",
          agentName: "Test Generator",
          withIntelligence: { avgTokens: 2800, avgCompute: 0.9, avgTime: 3.2, successRate: 89, cost: 0.051 },
          withoutIntelligence: { avgTokens: 4200, avgCompute: 1.4, avgTime: 5.5, successRate: 82, cost: 0.079 },
          savings: { tokens: 1400, compute: 0.5, time: 2.3, cost: 0.028, percentage: 35.4 }
        },
      ],
      isMock: true,
    };
  }

  async fetchTimeSeries(timeRange: string): Promise<{ data: TimeSeriesData[]; isMock: boolean }> {
    try {
      const response = await fetch(`/api/savings/timeseries?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch time series data, using mock data', err);
    }

    // Mock data fallback - generate 30 days of data
    const data: TimeSeriesData[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const baseRuns = 400 + Math.floor(Math.random() * 100);
      const intelRuns = Math.floor(baseRuns * 0.65);
      const tokenMultiplier = 0.6 + Math.random() * 0.15;
      
      data.push({
        date: dateStr,
        withIntelligence: {
          tokens: Math.floor(intelRuns * 3000 * tokenMultiplier),
          compute: parseFloat((intelRuns * 0.9 * tokenMultiplier).toFixed(2)),
          cost: parseFloat((intelRuns * 0.048).toFixed(2)),
          runs: intelRuns,
        },
        withoutIntelligence: {
          tokens: Math.floor(baseRuns * 4500),
          compute: parseFloat((baseRuns * 1.5).toFixed(2)),
          cost: parseFloat((baseRuns * 0.082).toFixed(2)),
          runs: baseRuns,
        },
        savings: {
          tokens: Math.floor(baseRuns * 4500 - intelRuns * 3000 * tokenMultiplier),
          compute: parseFloat((baseRuns * 1.5 - intelRuns * 0.9 * tokenMultiplier).toFixed(2)),
          cost: parseFloat((baseRuns * 0.082 - intelRuns * 0.048).toFixed(2)),
          percentage: 35 + Math.random() * 10,
        },
      });
    }
    
    return { data, isMock: true };
  }

  async fetchAll(timeRange: string) {
    const [metrics, agents, timeseries] = await Promise.all([
      this.fetchMetrics(timeRange),
      this.fetchAgentComparisons(timeRange),
      this.fetchTimeSeries(timeRange),
    ]);

    return {
      metrics: metrics.data,
      agentComparisons: agents.data,
      timeSeriesData: timeseries.data,
      isMock: metrics.isMock || agents.isMock || timeseries.isMock,
    };
  }
}

export const intelligenceSavingsSource = new IntelligenceSavingsDataSource();

