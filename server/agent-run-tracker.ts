import { z } from "zod";

// Schema for tracking agent runs
export const AgentRunSchema = z.object({
  id: z.string(),
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
    intelligenceFeatures: z.array(z.string()).optional(),
    patternsUsed: z.array(z.string()).optional(),
  }).optional(),
});

export type AgentRun = z.infer<typeof AgentRunSchema>;

// In-memory storage for demo purposes
// In production, this would be a database
const agentRuns: AgentRun[] = [];

export class AgentRunTracker {
  /**
   * Record an agent run with detailed metrics
   */
  static recordRun(runData: Omit<AgentRun, 'id' | 'timestamp'>): AgentRun {
    const run: AgentRun = {
      id: `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...runData,
    };

    agentRuns.push(run);
    console.log(`Recorded agent run: ${run.agentId} (${run.withIntelligence ? 'with' : 'without'} intelligence)`);
    
    return run;
  }

  /**
   * Get all agent runs within a time range
   */
  static getRunsInRange(startDate: Date, endDate: Date): AgentRun[] {
    return agentRuns.filter(run => {
      const runDate = new Date(run.timestamp);
      return runDate >= startDate && runDate <= endDate;
    });
  }

  /**
   * Get runs for a specific agent
   */
  static getRunsForAgent(agentId: string, withIntelligence?: boolean): AgentRun[] {
    return agentRuns.filter(run => {
      if (withIntelligence !== undefined) {
        return run.agentId === agentId && run.withIntelligence === withIntelligence;
      }
      return run.agentId === agentId;
    });
  }

  /**
   * Calculate savings metrics for a time period
   */
  static calculateSavingsMetrics(startDate: Date, endDate: Date) {
    const runs = this.getRunsInRange(startDate, endDate);
    const intelligenceRuns = runs.filter(run => run.withIntelligence);
    const baselineRuns = runs.filter(run => !run.withIntelligence);

    if (intelligenceRuns.length === 0 || baselineRuns.length === 0) {
      return {
        totalSavings: 0,
        tokenSavings: 0,
        computeSavings: 0,
        timeSavings: 0,
        efficiencyGain: 0,
        intelligenceRuns: intelligenceRuns.length,
        baselineRuns: baselineRuns.length,
      };
    }

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
      tokenSavings,
      computeSavings,
      timeSavings: timeSavings / 3600, // Convert to hours
      efficiencyGain,
      intelligenceRuns: intelligenceRuns.length,
      baselineRuns: baselineRuns.length,
      avgTokensPerIntelligenceRun: intelligenceTokens / intelligenceRuns.length,
      avgTokensPerBaselineRun: baselineTokens / baselineRuns.length,
      avgComputePerIntelligenceRun: intelligenceCompute / intelligenceRuns.length,
      avgComputePerBaselineRun: baselineCompute / baselineRuns.length,
    };
  }

  /**
   * Get agent performance comparison
   */
  static getAgentComparison(agentId: string, startDate: Date, endDate: Date) {
    const intelligenceRuns = this.getRunsForAgent(agentId, true).filter(run => {
      const runDate = new Date(run.timestamp);
      return runDate >= startDate && runDate <= endDate;
    });

    const baselineRuns = this.getRunsForAgent(agentId, false).filter(run => {
      const runDate = new Date(run.timestamp);
      return runDate >= startDate && runDate <= endDate;
    });

    if (intelligenceRuns.length === 0 || baselineRuns.length === 0) {
      return null;
    }

    const intelligenceAvg = {
      avgTokens: intelligenceRuns.reduce((sum, run) => sum + run.tokensUsed, 0) / intelligenceRuns.length,
      avgCompute: intelligenceRuns.reduce((sum, run) => sum + run.computeUnits, 0) / intelligenceRuns.length,
      avgTime: intelligenceRuns.reduce((sum, run) => sum + run.duration, 0) / intelligenceRuns.length,
      successRate: (intelligenceRuns.filter(run => run.success).length / intelligenceRuns.length) * 100,
      avgCost: intelligenceRuns.reduce((sum, run) => sum + run.cost, 0) / intelligenceRuns.length,
    };

    const baselineAvg = {
      avgTokens: baselineRuns.reduce((sum, run) => sum + run.tokensUsed, 0) / baselineRuns.length,
      avgCompute: baselineRuns.reduce((sum, run) => sum + run.computeUnits, 0) / baselineRuns.length,
      avgTime: baselineRuns.reduce((sum, run) => sum + run.duration, 0) / baselineRuns.length,
      successRate: (baselineRuns.filter(run => run.success).length / baselineRuns.length) * 100,
      avgCost: baselineRuns.reduce((sum, run) => sum + run.cost, 0) / baselineRuns.length,
    };

    const savings = {
      tokens: baselineAvg.avgTokens - intelligenceAvg.avgTokens,
      compute: baselineAvg.avgCompute - intelligenceAvg.avgCompute,
      time: baselineAvg.avgTime - intelligenceAvg.avgTime,
      cost: baselineAvg.avgCost - intelligenceAvg.avgCost,
      percentage: baselineAvg.avgCost > 0 ? ((baselineAvg.avgCost - intelligenceAvg.avgCost) / baselineAvg.avgCost) * 100 : 0,
    };

    return {
      agentId,
      agentName: intelligenceRuns[0]?.agentName || baselineRuns[0]?.agentName || 'Unknown',
      withIntelligence: intelligenceAvg,
      withoutIntelligence: baselineAvg,
      savings,
    };
  }

  /**
   * Get all unique agent IDs
   */
  static getAgentIds(): string[] {
    return [...new Set(agentRuns.map(run => run.agentId))];
  }

  /**
   * Generate mock data for testing
   */
  static generateMockData() {
    const agents = [
      { id: "agent-debug-intelligence", name: "Debug Intelligence Agent" },
      { id: "agent-code-quality-analyzer", name: "Code Quality Analyzer" },
      { id: "agent-architect", name: "Architecture Agent" },
      { id: "agent-performance", name: "Performance Agent" },
      { id: "agent-testing", name: "Testing Agent" },
      { id: "agent-refactoring", name: "Refactoring Agent" },
    ];

    const models = ["claude-3.5-sonnet", "claude-3.5-haiku", "gpt-4", "gpt-3.5-turbo"];
    const providers = ["anthropic", "openai", "together", "zai"];
    const complexities = ["low", "medium", "high"];

    // Generate 1000 mock runs over the last 30 days
    for (let i = 0; i < 1000; i++) {
      const agent = agents[Math.floor(Math.random() * agents.length)];
      const withIntelligence = Math.random() > 0.3; // 70% with intelligence
      const baseTokens = 800 + Math.random() * 1200;
      const baseCompute = 1.5 + Math.random() * 2.5;
      const baseDuration = 30 + Math.random() * 90;
      
      // Intelligence system reduces tokens and compute by 30-50%
      const intelligenceFactor = withIntelligence ? 0.5 + Math.random() * 0.3 : 1.0;
      
      const run: AgentRun = {
        id: `mock_run_${i}`,
        agentId: agent.id,
        agentName: agent.name,
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        withIntelligence,
        tokensUsed: Math.round(baseTokens * intelligenceFactor),
        computeUnits: baseCompute * intelligenceFactor,
        duration: Math.round(baseDuration * intelligenceFactor),
        success: Math.random() > 0.1, // 90% success rate
        cost: (baseTokens * intelligenceFactor * 0.0001) + (baseCompute * intelligenceFactor * 0.05),
        metadata: {
          model: models[Math.floor(Math.random() * models.length)],
          provider: providers[Math.floor(Math.random() * providers.length)],
          complexity: complexities[Math.floor(Math.random() * complexities.length)],
          contextSize: Math.floor(100000 + Math.random() * 200000),
          intelligenceFeatures: withIntelligence ? [
            "pattern_matching",
            "context_optimization",
            "smart_caching",
            "predictive_analysis"
          ] : [],
          patternsUsed: withIntelligence ? [
            "debug_pattern_001",
            "quality_pattern_002",
            "arch_pattern_003"
          ] : [],
        },
      };

      agentRuns.push(run);
    }

    console.log(`Generated ${agentRuns.length} mock agent runs`);
  }

  /**
   * Clear all data (for testing)
   */
  static clearData() {
    agentRuns.length = 0;
  }
}

// Initialize with mock data if no data exists
if (agentRuns.length === 0) {
  AgentRunTracker.generateMockData();
}
