import { Router } from 'express';
import { z } from 'zod';
import { AgentRunTracker } from './agent-run-tracker';

const router = Router();

// Data schemas
const AgentRunSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  timestamp: z.string(),
  withIntelligence: z.boolean(),
  tokensUsed: z.number(),
  computeUnits: z.number(),
  duration: z.number(), // in seconds
  success: z.boolean(),
  cost: z.number(),
  metadata: z
    .object({
      model: z.string().optional(),
      provider: z.string().optional(),
      complexity: z.string().optional(),
      contextSize: z.number().optional(),
    })
    .optional(),
});

const SavingsMetricsSchema = z.object({
  totalSavings: z.number(),
  monthlySavings: z.number(),
  weeklySavings: z.number(),
  dailySavings: z.number(),
  intelligenceRuns: z.number(),
  baselineRuns: z.number(),
  avgTokensPerRun: z.number(),
  avgComputePerRun: z.number(),
  costPerToken: z.number(),
  costPerCompute: z.number(),
  efficiencyGain: z.number(),
  timeSaved: z.number(),
  dataAvailable: z.boolean().optional(), // Flag indicating if real data is available
});

// API Routes

// Get savings metrics
router.get('/metrics', (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;
    startDate.setDate(now.getDate() - days);

    const rawMetrics = AgentRunTracker.calculateSavingsMetrics(startDate, now);

    // AgentRunTracker already returns complete SavingsMetrics with all validations
    // Just ensure all values are properly typed (no additional transformations needed)
    const metrics = {
      totalSavings: rawMetrics.totalSavings,
      monthlySavings: rawMetrics.monthlySavings,
      weeklySavings: rawMetrics.weeklySavings,
      dailySavings: rawMetrics.dailySavings,
      intelligenceRuns: rawMetrics.intelligenceRuns,
      baselineRuns: rawMetrics.baselineRuns,
      avgTokensPerRun: rawMetrics.avgTokensPerRun,
      avgComputePerRun: rawMetrics.avgComputePerRun,
      costPerToken: rawMetrics.costPerToken,
      costPerCompute: rawMetrics.costPerCompute,
      efficiencyGain: rawMetrics.efficiencyGain,
      timeSaved: rawMetrics.timeSaved,
      dataAvailable: rawMetrics.dataAvailable, // Include data availability flag
    };

    // Validate response matches SavingsMetrics schema
    const validatedMetrics = SavingsMetricsSchema.parse(metrics);
    res.json(validatedMetrics);
  } catch (error) {
    console.error('Error calculating savings metrics:', error);
    res.status(500).json({ error: 'Failed to calculate savings metrics' });
  }
});

// Get agent comparisons
router.get('/agents', (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;
    startDate.setDate(now.getDate() - days);

    const agentIds = AgentRunTracker.getAgentIds();
    const comparisons = agentIds
      .map((agentId) => AgentRunTracker.getAgentComparison(agentId, startDate, now))
      .filter(Boolean);

    res.json(comparisons);
  } catch (error) {
    console.error('Error calculating agent comparisons:', error);
    res.status(500).json({ error: 'Failed to calculate agent comparisons' });
  }
});

// Get time series data
router.get('/timeseries', (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;

    const timeSeriesData = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateStr = date.toISOString().split('T')[0];

      // Get start and end of this day
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      // Get runs for this day from AgentRunTracker
      const dayRuns = AgentRunTracker.getRunsInRange(dayStart, dayEnd);

      const intelligenceRuns = dayRuns.filter((run) => run.withIntelligence);
      const baselineRuns = dayRuns.filter((run) => !run.withIntelligence);

      // CRITICAL: Check if we have baseline data before calculating savings
      // Without baseline data, we CANNOT calculate realistic savings estimates
      if (baselineRuns.length === 0) {
        return {
          date: dateStr,
          withIntelligence: {
            tokens: 0,
            compute: 0,
            cost: 0,
            runs: intelligenceRuns.length,
          },
          withoutIntelligence: {
            tokens: 0,
            compute: 0,
            cost: 0,
            runs: 0,
          },
          savings: {
            tokens: 0,
            compute: 0,
            cost: 0,
            percentage: 0,
          },
          dataAvailable: false, // Flag indicating no baseline data for this day
        };
      }

      // Calculate actual intelligence metrics
      const intelligenceTokens = intelligenceRuns.reduce((sum, run) => sum + run.tokensUsed, 0);
      const intelligenceCompute = intelligenceRuns.reduce((sum, run) => sum + run.computeUnits, 0);
      const intelligenceCost = intelligenceRuns.reduce((sum, run) => sum + run.cost, 0);

      // Calculate baseline metrics (actual baseline runs - we confirmed baselineRuns.length > 0 above)
      const baselineTokens = baselineRuns.reduce((sum, run) => sum + run.tokensUsed, 0);
      const baselineCompute = baselineRuns.reduce((sum, run) => sum + run.computeUnits, 0);
      const baselineCost = baselineRuns.reduce((sum, run) => sum + run.cost, 0);

      // Calculate average baseline cost per run (for comparison)
      // No fallback needed - we already checked baselineRuns.length > 0
      const avgBaselineCostPerRun = baselineCost / baselineRuns.length;
      const avgBaselineTokensPerRun = baselineTokens / baselineRuns.length;
      const avgBaselineComputePerRun = baselineCompute / baselineRuns.length;

      // Calculate what the intelligence runs WOULD have cost without intelligence
      // (using average baseline cost as the reference)
      const estimatedCostWithoutIntelligence = avgBaselineCostPerRun * intelligenceRuns.length;
      const estimatedTokensWithoutIntelligence = Math.round(
        avgBaselineTokensPerRun * intelligenceRuns.length
      );
      const estimatedComputeWithoutIntelligence =
        avgBaselineComputePerRun * intelligenceRuns.length;

      // Calculate savings: what it would have cost - what it actually cost
      const costSavings = estimatedCostWithoutIntelligence - intelligenceCost;
      const tokenSavings = estimatedTokensWithoutIntelligence - intelligenceTokens;
      const computeSavings = estimatedComputeWithoutIntelligence - intelligenceCompute;

      return {
        date: dateStr,
        withIntelligence: {
          tokens: Math.round(intelligenceTokens),
          compute: parseFloat(intelligenceCompute.toFixed(2)),
          cost: parseFloat(intelligenceCost.toFixed(2)),
          runs: intelligenceRuns.length,
        },
        withoutIntelligence: {
          tokens: Math.round(estimatedTokensWithoutIntelligence),
          compute: parseFloat(estimatedComputeWithoutIntelligence.toFixed(2)),
          cost: parseFloat(estimatedCostWithoutIntelligence.toFixed(2)),
          runs: intelligenceRuns.length, // Same number of runs for fair comparison
        },
        savings: {
          tokens: Math.round(tokenSavings),
          compute: parseFloat(computeSavings.toFixed(2)),
          cost: parseFloat(costSavings.toFixed(2)),
          percentage:
            estimatedCostWithoutIntelligence > 0
              ? parseFloat(((costSavings / estimatedCostWithoutIntelligence) * 100).toFixed(2))
              : 0,
        },
        dataAvailable: true, // Flag indicating reliable data available
      };
    });

    res.json(timeSeriesData);
  } catch (error) {
    console.error('Error calculating time series data:', error);
    res.status(500).json({ error: 'Failed to calculate time series data' });
  }
});

// Get provider savings
router.get('/providers', (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;
    startDate.setDate(now.getDate() - days);

    // Get all runs in range
    const runs = AgentRunTracker.getRunsInRange(startDate, now);

    // Group by provider
    const providerData: {
      [key: string]: {
        name: string;
        tokensProcessed: number;
        tokensOffloaded: number;
        costWith: number;
        costWithout: number;
        runs: number;
      };
    } = {};

    runs.forEach((run) => {
      const provider = run.metadata?.provider || 'unknown';
      const providerName =
        provider === 'anthropic'
          ? 'Claude'
          : provider === 'openai'
            ? 'OpenAI'
            : provider === 'together'
              ? 'Together AI'
              : provider === 'zai'
                ? 'Local Models'
                : provider;

      if (!providerData[provider]) {
        providerData[provider] = {
          name: providerName,
          tokensProcessed: 0,
          tokensOffloaded: 0,
          costWith: 0,
          costWithout: 0,
          runs: 0,
        };
      }

      providerData[provider].tokensProcessed += run.tokensUsed;
      providerData[provider].runs++;

      if (run.withIntelligence) {
        providerData[provider].costWith += run.cost;
        // Estimate what it would have cost without intelligence (roughly 60% more)
        const estimatedBaselineCost = run.cost / 0.6;
        providerData[provider].costWithout += estimatedBaselineCost;
        providerData[provider].tokensOffloaded += Math.round(run.tokensUsed * 0.4);
      } else {
        providerData[provider].costWithout += run.cost;
      }
    });

    // Calculate total for percentages
    const totalSavings = Object.values(providerData).reduce(
      (sum, p) => sum + (p.costWithout - p.costWith),
      0
    );

    // Transform to response format
    const providers = Object.entries(providerData)
      .map(([id, data]) => {
        const savings = data.costWithout - data.costWith;
        const avgCostPerToken = data.tokensProcessed > 0 ? data.costWith / data.tokensProcessed : 0;

        return {
          providerId: id,
          providerName: data.name,
          savingsAmount: parseFloat(savings.toFixed(2)),
          tokensProcessed: Math.round(data.tokensProcessed),
          tokensOffloaded: Math.round(data.tokensOffloaded),
          percentageOfTotal:
            totalSavings > 0 ? parseFloat(((savings / totalSavings) * 100).toFixed(2)) : 0,
          avgCostPerToken: parseFloat(avgCostPerToken.toFixed(8)),
          runsCount: data.runs,
        };
      })
      .sort((a, b) => b.savingsAmount - a.savingsAmount); // Sort by savings amount

    res.json(providers);
  } catch (error) {
    console.error('Error calculating provider savings:', error);
    res.status(500).json({ error: 'Failed to calculate provider savings' });
  }
});

// Get cost breakdown
router.get('/breakdown', (_req, res) => {
  try {
    // Mock breakdown data
    const breakdown = {
      tokenCosts: {
        withIntelligence: 450,
        withoutIntelligence: 720,
        saved: 270,
      },
      computeCosts: {
        withIntelligence: 225,
        withoutIntelligence: 360,
        saved: 135,
      },
      storageCosts: {
        withIntelligence: 156.25,
        withoutIntelligence: 202.0,
        saved: 45.75,
      },
      networkCosts: {
        withIntelligence: 89.5,
        withoutIntelligence: 112.75,
        saved: 23.25,
      },
      totalSavings: 474,
      roi: {
        intelligenceSystemCost: 450.0,
        totalSavings: 474,
        netBenefit: 24,
        roiPercentage: 5.3,
        paybackMonths: 28.5,
      },
    };

    res.json(breakdown);
  } catch (error) {
    console.error('Error calculating cost breakdown:', error);
    res.status(500).json({ error: 'Failed to calculate cost breakdown' });
  }
});

// Record agent run (for data collection)
router.post('/runs', (req, res) => {
  const result = AgentRunSchema.safeParse(req.body);

  if (!result.success) {
    console.error('Invalid agent run data:', result.error.format());
    return res.status(400).json({ error: 'Invalid agent run data' });
  }

  const runData = result.data;

  // Record the run in the tracker
  AgentRunTracker.recordRun(runData);

  // In a real implementation, this would save to database
  console.log('Recording agent run:', runData);

  res.json({ success: true, id: Date.now().toString() });
});

export default router;
