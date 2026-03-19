/**
 * Savings Estimation Data Source (OMN-5554)
 *
 * Fetches savings estimation data from the /api/savings endpoints.
 * API-first with graceful fallback to mock data when unavailable.
 *
 * Consumed by the IntelligenceSavings page.
 */

import { buildApiUrl } from './api-base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  dataAvailable?: boolean;
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
  dataAvailable?: boolean;
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

export interface SavingsAllResponse {
  metrics: SavingsMetrics;
  agentComparisons: AgentComparison[];
  timeSeriesData: TimeSeriesData[];
  providerSavings: ProviderSavings[];
  isMock: boolean;
}

// ---------------------------------------------------------------------------
// Mock data generators (fallback when API unavailable)
// ---------------------------------------------------------------------------

function getMockMetrics(): SavingsMetrics {
  return {
    totalSavings: 0,
    monthlySavings: 0,
    weeklySavings: 0,
    dailySavings: 0,
    intelligenceRuns: 0,
    baselineRuns: 0,
    avgTokensPerRun: 0,
    avgComputePerRun: 0,
    costPerToken: 0,
    costPerCompute: 0,
    efficiencyGain: 0,
    timeSaved: 0,
    dataAvailable: false,
  };
}

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------

class SavingsSource {
  private baseUrl = buildApiUrl('/api/savings');
  private _usingMock = false;

  get isUsingMockData(): boolean {
    return this._usingMock;
  }

  async fetchMetrics(timeRange: string): Promise<SavingsMetrics> {
    try {
      const response = await fetch(`${this.baseUrl}/metrics?timeRange=${timeRange}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._usingMock = false;
      return data;
    } catch {
      console.warn('[SavingsSource] API unavailable for metrics, returning empty');
      this._usingMock = true;
      return getMockMetrics();
    }
  }

  async fetchAgentComparisons(timeRange: string): Promise<AgentComparison[]> {
    try {
      const response = await fetch(`${this.baseUrl}/agents?timeRange=${timeRange}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        this._usingMock = false;
        return data;
      }
      this._usingMock = true;
      return [];
    } catch {
      console.warn('[SavingsSource] API unavailable for agent comparisons');
      this._usingMock = true;
      return [];
    }
  }

  async fetchTimeSeries(timeRange: string): Promise<TimeSeriesData[]> {
    try {
      const response = await fetch(`${this.baseUrl}/timeseries?timeRange=${timeRange}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        this._usingMock = false;
        return data;
      }
      this._usingMock = true;
      return [];
    } catch {
      console.warn('[SavingsSource] API unavailable for time series');
      this._usingMock = true;
      return [];
    }
  }

  async fetchProviderSavings(timeRange: string): Promise<ProviderSavings[]> {
    try {
      const response = await fetch(`${this.baseUrl}/providers?timeRange=${timeRange}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        this._usingMock = false;
        return data;
      }
      this._usingMock = true;
      return [];
    } catch {
      console.warn('[SavingsSource] API unavailable for provider savings');
      this._usingMock = true;
      return [];
    }
  }

  async fetchAll(timeRange: string): Promise<SavingsAllResponse> {
    const [metrics, agents, timeseries, providers] = await Promise.all([
      this.fetchMetrics(timeRange),
      this.fetchAgentComparisons(timeRange),
      this.fetchTimeSeries(timeRange),
      this.fetchProviderSavings(timeRange),
    ]);

    return {
      metrics,
      agentComparisons: agents,
      timeSeriesData: timeseries,
      providerSavings: providers,
      isMock: this._usingMock,
    };
  }
}

export const savingsSource = new SavingsSource();
