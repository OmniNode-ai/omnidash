import { describe, it, expect, beforeEach, vi } from 'vitest';
import { intelligenceSavingsSource } from '../intelligence-savings-source';
import type { SavingsMetrics, AgentComparison, TimeSeriesData } from '../intelligence-savings-source';
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

      setupFetchMock(
        new Map([
          ['/api/savings/metrics', createMockResponse(mockMetrics)],
          ['/api/savings/agents', createMockResponse(mockComparisons)],
          ['/api/savings/timeseries', createMockResponse(mockTimeSeries)],
        ])
      );

      const result = await intelligenceSavingsSource.fetchAll('24h');

      expect(result.metrics).toEqual(mockMetrics);
      expect(result.agentComparisons).toEqual(mockComparisons);
      expect(result.timeSeriesData).toEqual(mockTimeSeries);
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
});

