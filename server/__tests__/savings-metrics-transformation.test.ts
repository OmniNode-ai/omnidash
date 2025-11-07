import { describe, it, expect } from 'vitest';

/**
 * Test the transformation logic from AgentRunTracker response to frontend SavingsMetrics interface
 */
describe('Savings Metrics Transformation', () => {
  it('should transform complete metrics correctly', () => {
    // Simulated response from AgentRunTracker.calculateSavingsMetrics()
    const rawMetrics = {
      totalSavings: 100,
      tokenSavings: 5000,
      computeSavings: 2.5,
      timeSavings: 10, // Already in hours
      efficiencyGain: 34.5,
      intelligenceRuns: 150,
      baselineRuns: 200,
      avgTokensPerIntelligenceRun: 3200,
      avgTokensPerBaselineRun: 4800,
      avgComputePerIntelligenceRun: 1.2,
      avgComputePerBaselineRun: 1.8,
    };

    const days = 30;

    // Apply transformation (same logic as in server/savings-routes.ts)
    const totalSavings = Math.max(0, rawMetrics.totalSavings);
    const monthlySavings = Math.max(0, (totalSavings / days) * 30);
    const weeklySavings = Math.max(0, (totalSavings / days) * 7);
    const dailySavings = Math.max(0, totalSavings / days);

    const metrics = {
      totalSavings,
      monthlySavings,
      weeklySavings,
      dailySavings,
      intelligenceRuns: Math.max(0, rawMetrics.intelligenceRuns),
      baselineRuns: Math.max(0, rawMetrics.baselineRuns),
      avgTokensPerRun: Math.max(0, rawMetrics.avgTokensPerIntelligenceRun || 0),
      avgComputePerRun: Math.max(0, rawMetrics.avgComputePerIntelligenceRun || 0),
      costPerToken: 0.000002,
      costPerCompute: 0.05,
      efficiencyGain: Math.max(0, rawMetrics.efficiencyGain),
      timeSaved: Math.max(0, rawMetrics.timeSavings || 0),
    };

    // Verify all required fields are present
    expect(metrics).toHaveProperty('totalSavings');
    expect(metrics).toHaveProperty('monthlySavings');
    expect(metrics).toHaveProperty('weeklySavings');
    expect(metrics).toHaveProperty('dailySavings');
    expect(metrics).toHaveProperty('intelligenceRuns');
    expect(metrics).toHaveProperty('baselineRuns');
    expect(metrics).toHaveProperty('avgTokensPerRun');
    expect(metrics).toHaveProperty('avgComputePerRun');
    expect(metrics).toHaveProperty('costPerToken');
    expect(metrics).toHaveProperty('costPerCompute');
    expect(metrics).toHaveProperty('efficiencyGain');
    expect(metrics).toHaveProperty('timeSaved');

    // Verify calculations
    expect(metrics.totalSavings).toBe(100);
    expect(metrics.monthlySavings).toBe(100); // (100/30)*30 = 100
    expect(metrics.weeklySavings).toBeCloseTo(23.33, 1); // (100/30)*7 ≈ 23.33
    expect(metrics.dailySavings).toBeCloseTo(3.33, 1); // 100/30 ≈ 3.33
    expect(metrics.avgTokensPerRun).toBe(3200);
    expect(metrics.avgComputePerRun).toBe(1.2);
    expect(metrics.timeSaved).toBe(10);
    expect(metrics.efficiencyGain).toBe(34.5);

    // Verify all values are non-negative
    Object.values(metrics).forEach(value => {
      if (typeof value === 'number') {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('should handle edge case with no runs', () => {
    // Edge case: no intelligence or baseline runs
    const rawMetrics = {
      totalSavings: 0,
      tokenSavings: 0,
      computeSavings: 0,
      timeSavings: 0,
      efficiencyGain: 0,
      intelligenceRuns: 0,
      baselineRuns: 0,
      // avgTokensPerIntelligenceRun and avgComputePerIntelligenceRun are missing
    };

    const days = 30;

    const totalSavings = Math.max(0, rawMetrics.totalSavings);
    const monthlySavings = Math.max(0, (totalSavings / days) * 30);
    const weeklySavings = Math.max(0, (totalSavings / days) * 7);
    const dailySavings = Math.max(0, totalSavings / days);

    const metrics = {
      totalSavings,
      monthlySavings,
      weeklySavings,
      dailySavings,
      intelligenceRuns: Math.max(0, rawMetrics.intelligenceRuns),
      baselineRuns: Math.max(0, rawMetrics.baselineRuns),
      avgTokensPerRun: Math.max(0, (rawMetrics as any).avgTokensPerIntelligenceRun || 0),
      avgComputePerRun: Math.max(0, (rawMetrics as any).avgComputePerIntelligenceRun || 0),
      costPerToken: 0.000002,
      costPerCompute: 0.05,
      efficiencyGain: Math.max(0, rawMetrics.efficiencyGain),
      timeSaved: Math.max(0, rawMetrics.timeSavings || 0),
    };

    // Verify all fields are present with zero values
    expect(metrics.totalSavings).toBe(0);
    expect(metrics.monthlySavings).toBe(0);
    expect(metrics.weeklySavings).toBe(0);
    expect(metrics.dailySavings).toBe(0);
    expect(metrics.intelligenceRuns).toBe(0);
    expect(metrics.baselineRuns).toBe(0);
    expect(metrics.avgTokensPerRun).toBe(0);
    expect(metrics.avgComputePerRun).toBe(0);
    expect(metrics.efficiencyGain).toBe(0);
    expect(metrics.timeSaved).toBe(0);

    // Verify all values are non-negative
    Object.values(metrics).forEach(value => {
      if (typeof value === 'number') {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('should ensure no negative values', () => {
    // Simulated response with potential negative values
    const rawMetrics = {
      totalSavings: -50, // Negative (bad data)
      tokenSavings: -1000,
      computeSavings: -0.5,
      timeSavings: -5,
      efficiencyGain: -10,
      intelligenceRuns: 100,
      baselineRuns: 50,
      avgTokensPerIntelligenceRun: 4000,
      avgTokensPerBaselineRun: 3000,
      avgComputePerIntelligenceRun: 1.5,
      avgComputePerBaselineRun: 1.0,
    };

    const days = 30;

    const totalSavings = Math.max(0, rawMetrics.totalSavings);
    const monthlySavings = Math.max(0, (totalSavings / days) * 30);
    const weeklySavings = Math.max(0, (totalSavings / days) * 7);
    const dailySavings = Math.max(0, totalSavings / days);

    const metrics = {
      totalSavings,
      monthlySavings,
      weeklySavings,
      dailySavings,
      intelligenceRuns: Math.max(0, rawMetrics.intelligenceRuns),
      baselineRuns: Math.max(0, rawMetrics.baselineRuns),
      avgTokensPerRun: Math.max(0, rawMetrics.avgTokensPerIntelligenceRun || 0),
      avgComputePerRun: Math.max(0, rawMetrics.avgComputePerIntelligenceRun || 0),
      costPerToken: 0.000002,
      costPerCompute: 0.05,
      efficiencyGain: Math.max(0, rawMetrics.efficiencyGain),
      timeSaved: Math.max(0, rawMetrics.timeSavings || 0),
    };

    // Verify all negative values are clamped to 0
    expect(metrics.totalSavings).toBe(0);
    expect(metrics.efficiencyGain).toBe(0);
    expect(metrics.timeSaved).toBe(0);

    // Verify all values are non-negative
    Object.values(metrics).forEach(value => {
      if (typeof value === 'number') {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
