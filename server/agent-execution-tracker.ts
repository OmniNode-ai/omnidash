import { z } from "zod";

// Schema for tracking agent executions
export const AgentExecutionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  query: z.string(),
  context: z.record(z.any()).optional(),
  status: z.enum(["pending", "executing", "completed", "failed", "cancelled"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  duration: z.number().optional(), // in seconds
  result: z.object({
    success: z.boolean(),
    output: z.string().optional(),
    qualityScore: z.number().optional(),
    metrics: z.object({
      tokensUsed: z.number().optional(),
      computeUnits: z.number().optional(),
      cost: z.number().optional(),
    }).optional(),
    error: z.string().optional(),
  }).optional(),
  routingDecision: z.object({
    confidence: z.number(),
    strategy: z.string(),
    alternatives: z.array(z.string()).optional(),
    routingTime: z.number().optional(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
});

export type AgentExecution = z.infer<typeof AgentExecutionSchema>;

// In-memory storage for demo purposes
// In production, this would be a database
const agentExecutions: AgentExecution[] = [];

export class AgentExecutionTracker {
  /**
   * Start tracking an agent execution
   */
  static startExecution(agentId: string, agentName: string, query: string, context?: any, routingDecision?: any): AgentExecution {
    const execution: AgentExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      agentName,
      query,
      context,
      status: "executing",
      startedAt: new Date().toISOString(),
      routingDecision,
    };

    agentExecutions.push(execution);
    console.log(`Started tracking agent execution: ${agentName} (${execution.id})`);
    
    return execution;
  }

  /**
   * Update execution status
   */
  static updateExecutionStatus(executionId: string, status: AgentExecution['status'], result?: any): AgentExecution | null {
    const execution = agentExecutions.find(exec => exec.id === executionId);
    if (!execution) {
      console.error(`Execution not found: ${executionId}`);
      return null;
    }

    execution.status = status;
    
    if (status === "completed" || status === "failed" || status === "cancelled") {
      execution.completedAt = new Date().toISOString();
      execution.duration = Math.floor((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000);
    }

    if (result) {
      execution.result = result;
    }

    console.log(`Updated execution status: ${executionId} -> ${status}`);
    return execution;
  }

  /**
   * Get execution by ID
   */
  static getExecution(executionId: string): AgentExecution | null {
    return agentExecutions.find(exec => exec.id === executionId) || null;
  }

  /**
   * Get executions for a specific agent
   */
  static getExecutionsForAgent(agentId: string, limit: number = 50): AgentExecution[] {
    return agentExecutions
      .filter(exec => exec.agentId === agentId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get recent executions
   */
  static getRecentExecutions(limit: number = 20): AgentExecution[] {
    return agentExecutions
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get execution statistics
   */
  static getExecutionStats(agentId?: string, timeRange?: { start: Date; end: Date }) {
    let executions = agentExecutions;
    
    if (agentId) {
      executions = executions.filter(exec => exec.agentId === agentId);
    }
    
    if (timeRange) {
      executions = executions.filter(exec => {
        const execDate = new Date(exec.startedAt);
        return execDate >= timeRange.start && execDate <= timeRange.end;
      });
    }

    const total = executions.length;
    const completed = executions.filter(exec => exec.status === "completed").length;
    const failed = executions.filter(exec => exec.status === "failed").length;
    const executing = executions.filter(exec => exec.status === "executing").length;
    
    const avgDuration = executions
      .filter(exec => exec.duration)
      .reduce((sum, exec) => sum + (exec.duration || 0), 0) / 
      executions.filter(exec => exec.duration).length || 0;

    const successRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      completed,
      failed,
      executing,
      successRate,
      avgDuration,
      recentExecutions: executions.slice(0, 10)
    };
  }

  /**
   * Get agent performance metrics
   */
  static getAgentPerformanceMetrics(agentId: string) {
    const executions = agentExecutions.filter(exec => exec.agentId === agentId);
    
    if (executions.length === 0) {
      return {
        totalRuns: 0,
        successRate: 0,
        avgExecutionTime: 0,
        avgQualityScore: 0,
        lastUsed: null,
        popularity: 0,
        efficiency: 0
      };
    }

    const completed = executions.filter(exec => exec.status === "completed");
    const successRate = (completed.length / executions.length) * 100;
    
    const avgExecutionTime = executions
      .filter(exec => exec.duration)
      .reduce((sum, exec) => sum + (exec.duration || 0), 0) / 
      executions.filter(exec => exec.duration).length || 0;

    const avgQualityScore = completed
      .filter(exec => exec.result?.qualityScore)
      .reduce((sum, exec) => sum + (exec.result?.qualityScore || 0), 0) / 
      completed.filter(exec => exec.result?.qualityScore).length || 0;

    const lastUsed = executions
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]?.startedAt;

    // Calculate popularity based on execution frequency
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentExecutions = executions.filter(exec => 
      new Date(exec.startedAt) >= last24Hours
    ).length;
    
    const popularity = Math.min(100, (recentExecutions / 10) * 100); // Scale to 0-100
    
    // Calculate efficiency based on success rate and execution time
    const efficiency = Math.max(0, Math.min(100, 
      (successRate * 0.7) + ((100 - Math.min(avgExecutionTime / 60, 100)) * 0.3)
    ));

    return {
      totalRuns: executions.length,
      successRate,
      avgExecutionTime,
      avgQualityScore,
      lastUsed,
      popularity,
      efficiency
    };
  }

  /**
   * Generate mock execution data for testing
   */
  static generateMockExecutions() {
    const agents = [
      "agent-api-architect",
      "agent-debug-intelligence", 
      "agent-frontend-developer",
      "agent-performance",
      "agent-testing",
      "agent-polymorphic-agent"
    ];

    const queries = [
      "optimize my API performance",
      "debug database connection issues",
      "create a React component",
      "write unit tests",
      "design microservices architecture",
      "analyze system performance",
      "implement authentication",
      "fix memory leaks",
      "create documentation",
      "setup monitoring"
    ];

    // Generate 100 mock executions over the last 7 days
    for (let i = 0; i < 100; i++) {
      const agentId = agents[Math.floor(Math.random() * agents.length)];
      const query = queries[Math.floor(Math.random() * queries.length)];
      const startedAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
      
      const execution: AgentExecution = {
        id: `mock_exec_${i}`,
        agentId,
        agentName: agentId.replace('agent-', '').replace('-', ' '),
        query,
        status: Math.random() > 0.1 ? "completed" : "failed",
        startedAt: startedAt.toISOString(),
        completedAt: new Date(startedAt.getTime() + (30 + Math.random() * 300) * 1000).toISOString(),
        duration: 30 + Math.random() * 300,
        result: {
          success: Math.random() > 0.1,
          output: `Mock execution result for ${query}`,
          qualityScore: 7 + Math.random() * 3,
          metrics: {
            tokensUsed: Math.floor(500 + Math.random() * 2000),
            computeUnits: 1 + Math.random() * 5,
            cost: 0.05 + Math.random() * 0.2
          }
        },
        routingDecision: {
          confidence: 0.7 + Math.random() * 0.3,
          strategy: "enhanced_fuzzy_matching",
          alternatives: agents.filter(a => a !== agentId).slice(0, 2)
        }
      };

      agentExecutions.push(execution);
    }

    console.log(`Generated ${agentExecutions.length} mock agent executions`);
  }

  /**
   * Clear all data (for testing)
   */
  static clearData() {
    agentExecutions.length = 0;
  }
}

// Initialize with mock data if no data exists
if (agentExecutions.length === 0) {
  AgentExecutionTracker.generateMockExecutions();
}
