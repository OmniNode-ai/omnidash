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
  dataAvailable?: boolean; // Flag indicating if real baseline data is available
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
  dataAvailable?: boolean; // Flag indicating if baseline data was available for this day
}

export interface ProviderSavings {
  providerId: string;
  providerName: string;
  savingsAmount: number;
  tokensProcessed: number;
  tokensOffloaded: number;
  percentageOfTotal: number;
  avgCostPerToken: number;
  runsCount: number;
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

    // Mock data fallback - aligned with YC demo script ($45K savings, 34% token reduction)
    return {
      data: {
        totalSavings: 45000, // $45K from demo script
        monthlySavings: 15000,
        weeklySavings: 3750,
        dailySavings: 536,
        intelligenceRuns: 15420,
        baselineRuns: 23500,
        avgTokensPerRun: 3200,
        avgComputePerRun: 1.2,
        costPerToken: 0.000002,
        costPerCompute: 0.05,
        efficiencyGain: 34.0, // 34% token reduction from script
        timeSaved: 12.5, // 12.5 hours (matches API format: hours not seconds)
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

    // Mock data fallback - generate 30 days of data with guaranteed positive savings
    const data: TimeSeriesData[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const baseRuns = 400 + Math.floor(Math.random() * 100);
      const intelRuns = Math.floor(baseRuns * 0.65);
      const tokenMultiplier = 0.6 + Math.random() * 0.15;

      // Calculate costs
      const intelTokens = Math.floor(intelRuns * 3000 * tokenMultiplier);
      const intelCompute = parseFloat((intelRuns * 0.9 * tokenMultiplier).toFixed(2));
      const intelCost = parseFloat((intelRuns * 0.048).toFixed(2));

      const baseTokens = Math.floor(baseRuns * 4500);
      const baseCompute = parseFloat((baseRuns * 1.5).toFixed(2));
      const baseCost = parseFloat((baseRuns * 0.082).toFixed(2));

      // Calculate savings with validators to ensure positive values
      const tokenSavings = Math.max(0, baseTokens - intelTokens);
      const computeSavings = Math.max(0, parseFloat((baseCompute - intelCompute).toFixed(2)));
      const costSavings = Math.max(0, parseFloat((baseCost - intelCost).toFixed(2)));
      const percentageSavings = Math.max(0, Math.min(100, 35 + Math.random() * 10));

      data.push({
        date: dateStr,
        withIntelligence: {
          tokens: Math.max(0, intelTokens),
          compute: Math.max(0, intelCompute),
          cost: Math.max(0, intelCost),
          runs: Math.max(0, intelRuns),
        },
        withoutIntelligence: {
          tokens: Math.max(0, baseTokens),
          compute: Math.max(0, baseCompute),
          cost: Math.max(0, baseCost),
          runs: Math.max(0, baseRuns),
        },
        savings: {
          tokens: tokenSavings,
          compute: computeSavings,
          cost: costSavings,
          percentage: percentageSavings,
        },
      });
    }

    return { data, isMock: true };
  }

  async fetchProviderSavings(timeRange: string): Promise<{ data: ProviderSavings[]; isMock: boolean }> {
    try {
      const response = await fetch(`/api/savings/providers?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch provider savings, using mock data', err);
    }

    // Mock data fallback - realistic provider distribution
    // Total $45K savings from demo script, distributed across providers
    const providers: ProviderSavings[] = [
      {
        providerId: 'claude-sonnet-4.5',
        providerName: 'Claude Sonnet 4.5',
        savingsAmount: 18500, // Largest share - primary model
        tokensProcessed: 2800000,
        tokensOffloaded: 1200000,
        percentageOfTotal: 41.1,
        avgCostPerToken: 0.000015,
        runsCount: 4850,
      },
      {
        providerId: 'local-models',
        providerName: 'Local Models',
        savingsAmount: 12000, // Second largest - offloaded compute
        tokensProcessed: 1500000,
        tokensOffloaded: 800000,
        percentageOfTotal: 26.7,
        avgCostPerToken: 0.000008,
        runsCount: 6200,
      },
      {
        providerId: 'gpt-4-turbo',
        providerName: 'GPT-4 Turbo',
        savingsAmount: 8000,
        tokensProcessed: 950000,
        tokensOffloaded: 400000,
        percentageOfTotal: 17.8,
        avgCostPerToken: 0.00002,
        runsCount: 2100,
      },
      {
        providerId: 'claude-opus',
        providerName: 'Claude Opus',
        savingsAmount: 4200,
        tokensProcessed: 680000,
        tokensOffloaded: 280000,
        percentageOfTotal: 9.3,
        avgCostPerToken: 0.000075,
        runsCount: 980,
      },
      {
        providerId: 'gpt-4o',
        providerName: 'GPT-4o',
        savingsAmount: 1500,
        tokensProcessed: 420000,
        tokensOffloaded: 180000,
        percentageOfTotal: 3.3,
        avgCostPerToken: 0.00001,
        runsCount: 1420,
      },
      {
        providerId: 'claude-haiku',
        providerName: 'Claude Haiku',
        savingsAmount: 800,
        tokensProcessed: 320000,
        tokensOffloaded: 140000,
        percentageOfTotal: 1.8,
        avgCostPerToken: 0.000005,
        runsCount: 2870,
      },
    ];

    return { data: providers, isMock: true };
  }

  async fetchAll(timeRange: string) {
    const [metrics, agents, timeseries, providers] = await Promise.all([
      this.fetchMetrics(timeRange),
      this.fetchAgentComparisons(timeRange),
      this.fetchTimeSeries(timeRange),
      this.fetchProviderSavings(timeRange),
    ]);

    return {
      metrics: metrics.data,
      agentComparisons: agents.data,
      timeSeriesData: timeseries.data,
      providerSavings: providers.data,
      isMock: metrics.isMock || agents.isMock || timeseries.isMock || providers.isMock,
    };
  }
}

/**
 * Smart formatter for time saved values - switches between minutes and hours
 * based on magnitude for optimal readability
 * @param seconds - Time saved in seconds
 * @returns Formatted string with appropriate unit (e.g., "12.5h" or "45.0min")
 */
export function formatTimeSaved(seconds: number): string {
  const hours = seconds / 3600;
  return hours < 0.1
    ? `${(seconds / 60).toFixed(1)}min`
    : `${hours.toFixed(1)}h`;
}

export const intelligenceSavingsSource = new IntelligenceSavingsDataSource();

