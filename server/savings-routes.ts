import { Router } from "express";
import { z } from "zod";
import { AgentRunTracker } from "./agent-run-tracker";

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
  metadata: z.object({
    model: z.string().optional(),
    provider: z.string().optional(),
    complexity: z.string().optional(),
    contextSize: z.number().optional(),
  }).optional(),
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

const AgentComparisonSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  withIntelligence: z.object({
    avgTokens: z.number(),
    avgCompute: z.number(),
    avgTime: z.number(),
    successRate: z.number(),
    cost: z.number(),
  }),
  withoutIntelligence: z.object({
    avgTokens: z.number(),
    avgCompute: z.number(),
    avgTime: z.number(),
    successRate: z.number(),
    cost: z.number(),
  }),
  savings: z.object({
    tokens: z.number(),
    compute: z.number(),
    time: z.number(),
    cost: z.number(),
    percentage: z.number(),
  }),
});

// Mock data - replace with real database queries
const mockAgentRuns = [
  {
    agentId: "agent-debug-intelligence",
    agentName: "Debug Intelligence Agent",
    timestamp: "2024-01-20T10:30:00Z",
    withIntelligence: true,
    tokensUsed: 850,
    computeUnits: 1.8,
    duration: 45,
    success: true,
    cost: 0.085,
    metadata: {
      model: "claude-3.5-sonnet",
      provider: "anthropic",
      complexity: "medium",
      contextSize: 150000,
    },
  },
  {
    agentId: "agent-debug-intelligence",
    agentName: "Debug Intelligence Agent",
    timestamp: "2024-01-20T09:15:00Z",
    withIntelligence: false,
    tokensUsed: 1450,
    computeUnits: 3.2,
    duration: 78,
    success: true,
    cost: 0.145,
    metadata: {
      model: "claude-3.5-sonnet",
      provider: "anthropic",
      complexity: "medium",
      contextSize: 150000,
    },
  },
  // Add more mock data...
];

// Calculate savings metrics
function calculateSavingsMetrics(runs: any[], timeRange: string = "30d") {
  const now = new Date();
  const cutoffDate = new Date();
  
  switch (timeRange) {
    case "7d":
      cutoffDate.setDate(now.getDate() - 7);
      break;
    case "30d":
      cutoffDate.setDate(now.getDate() - 30);
      break;
    case "90d":
      cutoffDate.setDate(now.getDate() - 90);
      break;
    default:
      cutoffDate.setDate(now.getDate() - 30);
  }

  const filteredRuns = runs.filter(run => new Date(run.timestamp) >= cutoffDate);
  const intelligenceRuns = filteredRuns.filter(run => run.withIntelligence);
  const baselineRuns = filteredRuns.filter(run => !run.withIntelligence);

  const intelligenceTokens = intelligenceRuns.reduce((sum, run) => sum + run.tokensUsed, 0);
  const baselineTokens = baselineRuns.reduce((sum, run) => sum + run.tokensUsed, 0);
  const intelligenceCompute = intelligenceRuns.reduce((sum, run) => sum + run.computeUnits, 0);
  const baselineCompute = baselineRuns.reduce((sum, run) => sum + run.computeUnits, 0);
  const intelligenceCost = intelligenceRuns.reduce((sum, run) => sum + run.cost, 0);
  const baselineCost = baselineRuns.reduce((sum, run) => sum + run.cost, 0);
  const intelligenceTime = intelligenceRuns.reduce((sum, run) => sum + run.duration, 0);
  const baselineTime = baselineRuns.reduce((sum, run) => sum + run.duration, 0);

  const tokenSavings = baselineTokens - intelligenceTokens;
  const computeSavings = baselineCompute - intelligenceCompute;
  const costSavings = baselineCost - intelligenceCost;
  const timeSavings = baselineTime - intelligenceTime;

  const efficiencyGain = baselineTokens > 0 ? (tokenSavings / baselineTokens) * 100 : 0;

  return {
    totalSavings: costSavings,
    monthlySavings: costSavings * (30 / (timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30)),
    weeklySavings: costSavings * (7 / (timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30)),
    dailySavings: costSavings / (timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30),
    intelligenceRuns: intelligenceRuns.length,
    baselineRuns: baselineRuns.length,
    avgTokensPerRun: intelligenceRuns.length > 0 ? intelligenceTokens / intelligenceRuns.length : 0,
    avgComputePerRun: intelligenceRuns.length > 0 ? intelligenceCompute / intelligenceRuns.length : 0,
    costPerToken: 0.0001,
    costPerCompute: 0.05,
    efficiencyGain,
    timeSaved: timeSavings / 3600, // Convert to hours
  };
}

// Calculate agent comparisons
function calculateAgentComparisons(runs: any[]) {
  const agentGroups = runs.reduce((groups, run) => {
    if (!groups[run.agentId]) {
      groups[run.agentId] = {
        agentId: run.agentId,
        agentName: run.agentName,
        withIntelligence: [],
        withoutIntelligence: [],
      };
    }
    
    if (run.withIntelligence) {
      groups[run.agentId].withIntelligence.push(run);
    } else {
      groups[run.agentId].withoutIntelligence.push(run);
    }
    
    return groups;
  }, {});

  return Object.values(agentGroups).map((group: any) => {
    const withIntelligence = group.withIntelligence;
    const withoutIntelligence = group.withoutIntelligence;

    if (withIntelligence.length === 0 || withoutIntelligence.length === 0) {
      return null; // Skip agents without both types of runs
    }

    const withIntelligenceAvg = {
      avgTokens: withIntelligence.reduce((sum: number, run: any) => sum + run.tokensUsed, 0) / withIntelligence.length,
      avgCompute: withIntelligence.reduce((sum: number, run: any) => sum + run.computeUnits, 0) / withIntelligence.length,
      avgTime: withIntelligence.reduce((sum: number, run: any) => sum + run.duration, 0) / withIntelligence.length,
      successRate: (withIntelligence.filter((run: any) => run.success).length / withIntelligence.length) * 100,
      cost: withIntelligence.reduce((sum: number, run: any) => sum + run.cost, 0) / withIntelligence.length,
    };

    const withoutIntelligenceAvg = {
      avgTokens: withoutIntelligence.reduce((sum: number, run: any) => sum + run.tokensUsed, 0) / withoutIntelligence.length,
      avgCompute: withoutIntelligence.reduce((sum: number, run: any) => sum + run.computeUnits, 0) / withoutIntelligence.length,
      avgTime: withoutIntelligence.reduce((sum: number, run: any) => sum + run.duration, 0) / withoutIntelligence.length,
      successRate: (withoutIntelligence.filter((run: any) => run.success).length / withoutIntelligence.length) * 100,
      cost: withoutIntelligence.reduce((sum: number, run: any) => sum + run.cost, 0) / withoutIntelligence.length,
    };

    const savings = {
      tokens: withoutIntelligenceAvg.avgTokens - withIntelligenceAvg.avgTokens,
      compute: withoutIntelligenceAvg.avgCompute - withIntelligenceAvg.avgCompute,
      time: withoutIntelligenceAvg.avgTime - withIntelligenceAvg.avgTime,
      cost: withoutIntelligenceAvg.cost - withIntelligenceAvg.cost,
      percentage: withoutIntelligenceAvg.cost > 0 ? ((withoutIntelligenceAvg.cost - withIntelligenceAvg.cost) / withoutIntelligenceAvg.cost) * 100 : 0,
    };

    return {
      agentId: group.agentId,
      agentName: group.agentName,
      withIntelligence: withIntelligenceAvg,
      withoutIntelligence: withoutIntelligenceAvg,
      savings,
    };
  }).filter(Boolean);
}

// API Routes

// Get savings metrics
router.get("/metrics", (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    const days = timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30;
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
    console.error("Error calculating savings metrics:", error);
    res.status(500).json({ error: "Failed to calculate savings metrics" });
  }
});

// Get agent comparisons
router.get("/agents", (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    const days = timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30;
    startDate.setDate(now.getDate() - days);
    
    const agentIds = AgentRunTracker.getAgentIds();
    const comparisons = agentIds
      .map(agentId => AgentRunTracker.getAgentComparison(agentId, startDate, now))
      .filter(Boolean);
    
    res.json(comparisons);
  } catch (error) {
    console.error("Error calculating agent comparisons:", error);
    res.status(500).json({ error: "Failed to calculate agent comparisons" });
  }
});

// Get time series data
router.get("/timeseries", (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;
    const days = timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30;

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

      const intelligenceRuns = dayRuns.filter(run => run.withIntelligence);
      const baselineRuns = dayRuns.filter(run => !run.withIntelligence);

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
      const estimatedTokensWithoutIntelligence = Math.round(avgBaselineTokensPerRun * intelligenceRuns.length);
      const estimatedComputeWithoutIntelligence = avgBaselineComputePerRun * intelligenceRuns.length;

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
          percentage: estimatedCostWithoutIntelligence > 0
            ? parseFloat((costSavings / estimatedCostWithoutIntelligence * 100).toFixed(2))
            : 0,
        },
        dataAvailable: true, // Flag indicating reliable data available
      };
    });

    res.json(timeSeriesData);
  } catch (error) {
    console.error("Error calculating time series data:", error);
    res.status(500).json({ error: "Failed to calculate time series data" });
  }
});

// Get provider savings
router.get("/providers", (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    const days = timeRange === "7d" ? 7 : timeRange === "90d" ? 90 : 30;
    startDate.setDate(now.getDate() - days);

    // Get all runs in range
    const runs = AgentRunTracker.getRunsInRange(startDate, now);

    // Group by provider
    const providerData: { [key: string]: {
      name: string;
      tokensProcessed: number;
      tokensOffloaded: number;
      costWith: number;
      costWithout: number;
      runs: number;
    } } = {};

    runs.forEach(run => {
      const provider = run.metadata?.provider || 'unknown';
      const providerName = provider === 'anthropic' ? 'Claude' :
                          provider === 'openai' ? 'OpenAI' :
                          provider === 'together' ? 'Together AI' :
                          provider === 'zai' ? 'Local Models' : provider;

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
    const totalSavings = Object.values(providerData).reduce((sum, p) =>
      sum + (p.costWithout - p.costWith), 0
    );

    // Transform to response format
    const providers = Object.entries(providerData).map(([id, data]) => {
      const savings = data.costWithout - data.costWith;
      const avgCostPerToken = data.tokensProcessed > 0 ? data.costWith / data.tokensProcessed : 0;

      return {
        providerId: id,
        providerName: data.name,
        savingsAmount: parseFloat(savings.toFixed(2)),
        tokensProcessed: Math.round(data.tokensProcessed),
        tokensOffloaded: Math.round(data.tokensOffloaded),
        percentageOfTotal: totalSavings > 0 ? parseFloat((savings / totalSavings * 100).toFixed(2)) : 0,
        avgCostPerToken: parseFloat(avgCostPerToken.toFixed(8)),
        runsCount: data.runs,
      };
    }).sort((a, b) => b.savingsAmount - a.savingsAmount); // Sort by savings amount

    res.json(providers);
  } catch (error) {
    console.error("Error calculating provider savings:", error);
    res.status(500).json({ error: "Failed to calculate provider savings" });
  }
});

// Get cost breakdown
router.get("/breakdown", (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;
    const metrics = calculateSavingsMetrics(mockAgentRuns, timeRange as string);
    
    // Mock breakdown data
    const breakdown = {
      tokenCosts: {
        withIntelligence: metrics.avgTokensPerRun * metrics.intelligenceRuns * metrics.costPerToken,
        withoutIntelligence: metrics.avgTokensPerRun * 1.6 * metrics.baselineRuns * metrics.costPerToken,
        saved: (metrics.avgTokensPerRun * 1.6 * metrics.baselineRuns * metrics.costPerToken) - 
               (metrics.avgTokensPerRun * metrics.intelligenceRuns * metrics.costPerToken),
      },
      computeCosts: {
        withIntelligence: metrics.avgComputePerRun * metrics.intelligenceRuns * metrics.costPerCompute,
        withoutIntelligence: metrics.avgComputePerRun * 1.6 * metrics.baselineRuns * metrics.costPerCompute,
        saved: (metrics.avgComputePerRun * 1.6 * metrics.baselineRuns * metrics.costPerCompute) - 
               (metrics.avgComputePerRun * metrics.intelligenceRuns * metrics.costPerCompute),
      },
      storageCosts: {
        withIntelligence: 156.25,
        withoutIntelligence: 202.00,
        saved: 45.75,
      },
      networkCosts: {
        withIntelligence: 89.50,
        withoutIntelligence: 112.75,
        saved: 23.25,
      },
      totalSavings: metrics.totalSavings,
      roi: {
        intelligenceSystemCost: 450.00,
        totalSavings: metrics.totalSavings,
        netBenefit: metrics.totalSavings - 450.00,
        roiPercentage: ((metrics.totalSavings - 450.00) / 450.00) * 100,
        paybackMonths: 450.00 / (metrics.totalSavings / 30), // Assuming monthly savings
      },
    };
    
    res.json(breakdown);
  } catch (error) {
    console.error("Error calculating cost breakdown:", error);
    res.status(500).json({ error: "Failed to calculate cost breakdown" });
  }
});

// Record agent run (for data collection)
router.post("/runs", (req, res) => {
  try {
    const runData = AgentRunSchema.parse(req.body);
    
    // In a real implementation, this would save to database
    console.log("Recording agent run:", runData);
    
    res.json({ success: true, id: Date.now().toString() });
  } catch (error) {
    console.error("Error recording agent run:", error);
    res.status(400).json({ error: "Invalid agent run data" });
  }
});

export default router;
