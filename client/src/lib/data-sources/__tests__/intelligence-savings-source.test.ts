import { describe, it, expect, beforeEach, vi } from 'vitest';
import { intelligenceSavingsSource, formatTimeSaved } from '../intelligence-savings-source';
import type { SavingsMetrics, AgentComparison, TimeSeriesData, ProviderSavings } from '../intelligence-savings-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('IntelligenceSavingsSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchMetrics', () => {
    it('should return real savings metrics', async () => {
      const mockMetrics: SavingsMetrics = {
        totalSavings: 5000,
        monthlySavings: 15000,
        efficiencyGain: 35,
        timeSaved: 120,
        avgTokensPerRun: 5000,
        baselineRuns: 10000,
        costPerToken: 0.000001,
        avgComputePerRun: 10,
        costPerCompute: 0.01,
        intelligenceRuns: 8500,
      };

      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(mockMetrics)],
        ])
      );

      const result = await intelligenceSavingsSource.fetchMetrics('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockMetrics);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceSavingsSource.fetchMetrics('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.totalSavings).toBeGreaterThan(0);
    });

    it('should handle network error in fetchMetrics', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/metrics', new Error('Network connection failed')],
        ])
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await intelligenceSavingsSource.fetchMetrics('7d');

      expect(result.isMock).toBe(true);
      expect(result.data.totalSavings).toBe(45000);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch savings metrics, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchTimeSeries', () => {
    it('should return time series data with dataAvailable flag', async () => {
      const mockTimeSeries: TimeSeriesData[] = [
        {
          date: '2024-01-01',
          withIntelligence: { tokens: 50000, compute: 100, cost: 50, runs: 10 },
          withoutIntelligence: { tokens: 75000, compute: 150, cost: 75, runs: 10 },
          savings: { tokens: 25000, compute: 50, cost: 25, percentage: 33.3 },
          dataAvailable: true, // Has baseline data
        },
        {
          date: '2024-01-02',
          withIntelligence: { tokens: 0, compute: 0, cost: 0, runs: 5 },
          withoutIntelligence: { tokens: 0, compute: 0, cost: 0, runs: 0 },
          savings: { tokens: 0, compute: 0, cost: 0, percentage: 0 },
          dataAvailable: false, // Missing baseline data
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/savings/timeseries', createMockResponse(mockTimeSeries)],
        ])
      );

      const result = await intelligenceSavingsSource.fetchTimeSeries('7d');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockTimeSeries);
      expect(result.data[0].dataAvailable).toBe(true);
      expect(result.data[1].dataAvailable).toBe(false);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/timeseries', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceSavingsSource.fetchTimeSeries('7d');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle network error in fetchTimeSeries', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/timeseries', new Error('Connection timeout')],
        ])
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await intelligenceSavingsSource.fetchTimeSeries('30d');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBe(30);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch time series data, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fetchAgentComparisons', () => {
    it('should return agent comparisons from API', async () => {
      const mockComparisons: AgentComparison[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent 1',
          withIntelligence: {
            avgTokens: 5000,
            avgCompute: 10,
            avgTime: 1.2,
            successRate: 95,
            cost: 5,
          },
          withoutIntelligence: {
            avgTokens: 7500,
            avgCompute: 15,
            avgTime: 2.0,
            successRate: 85,
            cost: 7.5,
          },
          savings: {
            tokens: 2500,
            compute: 5,
            time: 0.8,
            cost: 2.5,
            percentage: 33.3,
          },
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/savings/agents', createMockResponse(mockComparisons)],
        ])
      );

      const result = await intelligenceSavingsSource.fetchAgentComparisons('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockComparisons);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/agents', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceSavingsSource.fetchAgentComparisons('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle network error in fetchAgentComparisons', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/agents', new Error('API unreachable')],
        ])
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await intelligenceSavingsSource.fetchAgentComparisons('7d');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBe(3);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch agent comparisons, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });


  describe('fetchAll', () => {
    it('should combine all savings data sources', async () => {
      const mockMetrics: SavingsMetrics = {
        totalSavings: 5000,
        monthlySavings: 15000,
        weeklySavings: 3750,
        dailySavings: 536,
        efficiencyGain: 35,
        timeSaved: 120,
        avgTokensPerRun: 5000,
        baselineRuns: 10000,
        costPerToken: 0.000001,
        avgComputePerRun: 10,
        costPerCompute: 0.01,
        intelligenceRuns: 8500,
      };
      // Use non-empty array to avoid fallback to mock data
      const mockComparisons: AgentComparison[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent 1',
          withIntelligence: {
            avgTokens: 5000,
            avgCompute: 10,
            avgTime: 1.2,
            successRate: 95,
            cost: 5,
          },
          withoutIntelligence: {
            avgTokens: 7500,
            avgCompute: 15,
            avgTime: 2.0,
            successRate: 85,
            cost: 7.5,
          },
          savings: {
            tokens: 2500,
            compute: 5,
            time: 0.8,
            cost: 2.5,
            percentage: 33.3,
          },
        },
      ];
      // Use non-empty array for timeSeries to avoid mock fallback
      const mockTimeSeries: TimeSeriesData[] = [
        {
          date: '2024-01-01',
          withIntelligence: { tokens: 50000, compute: 100, cost: 50, runs: 10 },
          withoutIntelligence: { tokens: 75000, compute: 150, cost: 75, runs: 10 },
          savings: { tokens: 25000, compute: 50, cost: 25, percentage: 33.3 },
        },
      ];
      // Mock providers data
      const mockProviders = [
        {
          providerId: 'provider-1',
          providerName: 'Provider 1',
          savingsAmount: 1000,
          tokensProcessed: 100000,
          tokensOffloaded: 50000,
          percentageOfTotal: 50,
          avgCostPerToken: 0.00001,
          runsCount: 100,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(mockMetrics)],
          ['/api/savings/agents', createMockResponse(mockComparisons)],
          ['/api/savings/timeseries', createMockResponse(mockTimeSeries)],
          ['/api/savings/providers', createMockResponse(mockProviders)],
        ])
      );

      const result = await intelligenceSavingsSource.fetchAll('24h');

      expect(result.metrics).toEqual(mockMetrics);
      expect(result.agentComparisons).toEqual(mockComparisons);
      expect(result.timeSeriesData).toEqual(mockTimeSeries);
      expect(result.providerSavings).toEqual(mockProviders);
      expect(result.isMock).toBe(false);
    });

    it('should mark as mock if any source fails', async () => {
      const mockMetrics: SavingsMetrics = {
        totalSavings: 5000,
        monthlySavings: 15000,
        efficiencyGain: 35,
        timeSaved: 120,
        avgTokensPerRun: 5000,
        baselineRuns: 10000,
        costPerToken: 0.000001,
        avgComputePerRun: 10,
        costPerCompute: 0.01,
        intelligenceRuns: 8500,
      };

      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(mockMetrics)],
          ['/api/savings/agents', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceSavingsSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
    });
  });

  describe('fetchProviderSavings', () => {
    it('should return provider savings from API', async () => {
      const mockProviders: ProviderSavings[] = [
        {
          providerId: 'claude-sonnet-4.5',
          providerName: 'Claude Sonnet 4.5',
          savingsAmount: 18500,
          tokensProcessed: 2800000,
          tokensOffloaded: 1200000,
          percentageOfTotal: 41.1,
          avgCostPerToken: 0.000015,
          runsCount: 4850,
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
      ];

      setupFetchMock(
        new Map([
          ['/api/savings/providers', createMockResponse(mockProviders)],
        ])
      );

      const result = await intelligenceSavingsSource.fetchProviderSavings('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockProviders);
      expect(result.data.length).toBe(2);
      expect(result.data[0].providerId).toBe('claude-sonnet-4.5');
      expect(result.data[1].avgCostPerToken).toBe(0.00002);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/providers', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await intelligenceSavingsSource.fetchProviderSavings('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty('providerId');
      expect(result.data[0]).toHaveProperty('savingsAmount');
    });

    it('should return mock data when API returns empty array', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/providers', createMockResponse([])],
        ])
      );

      const result = await intelligenceSavingsSource.fetchProviderSavings('7d');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle network errors gracefully', async () => {
      setupFetchMock(
        new Map([
          ['/api/savings/providers', new Error('Network error')],
        ])
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await intelligenceSavingsSource.fetchProviderSavings('30d');

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch provider savings, using mock data',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should pass correct timeRange parameter to API', async () => {
      const mockProviders: ProviderSavings[] = [{
        providerId: 'test-provider',
        providerName: 'Test Provider',
        savingsAmount: 5000,
        tokensProcessed: 100000,
        tokensOffloaded: 50000,
        percentageOfTotal: 20,
        avgCostPerToken: 0.00001,
        runsCount: 1000,
      }];

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('timeRange=7d')) {
          return createMockResponse(mockProviders);
        }
        return createMockResponse(null, { status: 404 });
      });

      global.fetch = mockFetch as any;

      await intelligenceSavingsSource.fetchProviderSavings('7d');

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/savings/providers?timeRange=7d'));
    });
  });

  describe('formatTimeSaved', () => {
    it('should format time less than 0.1 hours as minutes', () => {
      // 300 seconds = 5 minutes = 0.083 hours (< 0.1)
      expect(formatTimeSaved(300)).toBe('5.0min');
    });

    it('should format time greater than or equal to 0.1 hours as hours', () => {
      // 360 seconds = 6 minutes = 0.1 hours (= 0.1)
      expect(formatTimeSaved(360)).toBe('0.1h');

      // 3600 seconds = 1 hour
      expect(formatTimeSaved(3600)).toBe('1.0h');

      // 7200 seconds = 2 hours
      expect(formatTimeSaved(7200)).toBe('2.0h');
    });

    it('should format fractional hours correctly', () => {
      // 4500 seconds = 1.25 hours (rounds to 1.3 with toFixed(1))
      expect(formatTimeSaved(4500)).toBe('1.3h');

      // 12600 seconds = 3.5 hours
      expect(formatTimeSaved(12600)).toBe('3.5h');
    });

    it('should format small time values as minutes', () => {
      // 60 seconds = 1 minute
      expect(formatTimeSaved(60)).toBe('1.0min');

      // 120 seconds = 2 minutes
      expect(formatTimeSaved(120)).toBe('2.0min');

      // 45 seconds = 0.75 minutes
      expect(formatTimeSaved(45)).toBe('0.8min');
    });

    it('should handle zero seconds', () => {
      expect(formatTimeSaved(0)).toBe('0.0min');
    });

    it('should handle edge case at 360 seconds (exactly 0.1 hours)', () => {
      // This is the boundary case - should be formatted as hours
      expect(formatTimeSaved(360)).toBe('0.1h');
    });

    it('should handle edge case just below 360 seconds', () => {
      // 359 seconds = 0.0997 hours (< 0.1) - should be formatted as minutes
      expect(formatTimeSaved(359)).toBe('6.0min');
    });
  });
});

