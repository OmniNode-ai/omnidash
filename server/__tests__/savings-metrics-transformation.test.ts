import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRunTracker } from '../agent-run-tracker';

/**
 * Test the actual transformation logic in AgentRunTracker.calculateSavingsMetrics()
 */
describe('Savings Metrics Transformation', () => {
  beforeEach(() => {
    // Clear data before each test
    AgentRunTracker.clearData();
  });

  it('should calculate savings metrics correctly with real data', () => {
    // Record baseline runs (without intelligence) - higher cost
    // Note: recordRun() auto-generates timestamps as current time
    for (let i = 0; i < 200; i++) {
      AgentRunTracker.recordRun({
        agentId: 'test-agent',
        agentName: 'Test Agent',
        withIntelligence: false,
        tokensUsed: 4800,
        computeUnits: 1.8,
        duration: 120, // seconds
        success: true,
        cost: 0.58, // (4800 * 0.0001) + (1.8 * 0.05)
        metadata: {
          model: 'claude-3.5-sonnet',
          provider: 'anthropic',
        },
      });
    }

    // Record intelligence runs (with intelligence) - lower cost
    for (let i = 0; i < 150; i++) {
      AgentRunTracker.recordRun({
        agentId: 'test-agent',
        agentName: 'Test Agent',
        withIntelligence: true,
        tokensUsed: 3200,
        computeUnits: 1.2,
        duration: 80, // seconds
        success: true,
        cost: 0.38, // (3200 * 0.0001) + (1.2 * 0.05)
        metadata: {
          model: 'claude-3.5-sonnet',
          provider: 'anthropic',
        },
      });
    }

    // Use a wide date range that includes the just-created runs
    // All runs were created with current timestamps
    const now = new Date();
    const startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

    // Call the actual transformation function
    const metrics = AgentRunTracker.calculateSavingsMetrics(startDate, now);

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
    expect(metrics).toHaveProperty('dataAvailable');

    // Verify run counts
    expect(metrics.intelligenceRuns).toBe(150);
    expect(metrics.baselineRuns).toBe(200);

    // Verify savings are positive (intelligence should be cheaper)
    expect(metrics.totalSavings).toBeGreaterThan(0);
    expect(metrics.monthlySavings).toBeGreaterThan(0);
    expect(metrics.weeklySavings).toBeGreaterThan(0);
    expect(metrics.dailySavings).toBeGreaterThan(0);

    // Verify efficiency gain is positive
    expect(metrics.efficiencyGain).toBeGreaterThan(0);

    // Verify all values are non-negative
    Object.values(metrics).forEach(value => {
      if (typeof value === 'number') {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('should handle edge case with no runs', () => {
    // Edge case: no intelligence or baseline runs
    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Don't record any runs - test with empty data
    const metrics = AgentRunTracker.calculateSavingsMetrics(startDate, now);

    // When there's no data, AgentRunTracker returns fallback demo values
    // Verify all fields are present
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

    // Run counts should be 0 (no data)
    expect(metrics.intelligenceRuns).toBe(0);
    expect(metrics.baselineRuns).toBe(0);

    // AgentRunTracker returns zeros when no data exists (no fabricated data)
    expect(metrics.totalSavings).toBe(0);
    expect(metrics.monthlySavings).toBe(0);
    expect(metrics.weeklySavings).toBe(0);
    expect(metrics.dailySavings).toBe(0);
    expect(metrics.efficiencyGain).toBe(0);
    expect(metrics.timeSaved).toBe(0);

    // Check for dataAvailable flag
    expect(metrics.dataAvailable).toBe(false);

    // Verify all values are non-negative
    Object.values(metrics).forEach(value => {
      if (typeof value === 'number') {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('should ensure no negative values', () => {
    // Test case: Intelligence runs are MORE expensive than baseline
    // This should result in 0 savings (clamped to non-negative)

    // Record baseline runs (cheaper in this scenario)
    for (let i = 0; i < 50; i++) {
      AgentRunTracker.recordRun({
        agentId: 'test-agent',
        agentName: 'Test Agent',
        withIntelligence: false,
        tokensUsed: 3000,
        computeUnits: 1.0,
        duration: 60,
        success: true,
        cost: 0.35, // (3000 * 0.0001) + (1.0 * 0.05)
        metadata: {
          model: 'gpt-3.5-turbo',
          provider: 'openai',
        },
      });
    }

    // Record intelligence runs (MORE expensive - unusual scenario)
    for (let i = 0; i < 100; i++) {
      AgentRunTracker.recordRun({
        agentId: 'test-agent',
        agentName: 'Test Agent',
        withIntelligence: true,
        tokensUsed: 4000,
        computeUnits: 1.5,
        duration: 90,
        success: true,
        cost: 0.475, // (4000 * 0.0001) + (1.5 * 0.05)
        metadata: {
          model: 'claude-3.5-sonnet',
          provider: 'anthropic',
        },
      });
    }

    // Use a wide date range that includes the just-created runs
    const now = new Date();
    const startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

    const metrics = AgentRunTracker.calculateSavingsMetrics(startDate, now);

    // Verify all negative values are clamped to 0 by Math.max() in the actual function
    expect(metrics.totalSavings).toBeGreaterThanOrEqual(0);
    expect(metrics.monthlySavings).toBeGreaterThanOrEqual(0);
    expect(metrics.weeklySavings).toBeGreaterThanOrEqual(0);
    expect(metrics.dailySavings).toBeGreaterThanOrEqual(0);
    expect(metrics.efficiencyGain).toBeGreaterThanOrEqual(0);
    expect(metrics.timeSaved).toBeGreaterThanOrEqual(0);

    // Verify all values are non-negative
    Object.values(metrics).forEach(value => {
      if (typeof value === 'number') {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
