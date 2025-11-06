/**
 * Mock Data Generator for Agent Registry
 */

import { MockDataGenerator as Gen } from './config';

export interface RecentActivity {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: string;
  actionName: string;
  description: string;
  status: 'success' | 'error' | 'warning' | 'in_progress';
  timestamp: string;
  createdAt: string;
  duration: number;
  durationMs: number;
  target?: string;
  actionDetails?: any;
  debugMode?: boolean;
}

export class AgentRegistryMockData {
  /**
   * Agent names used across the system
   */
  private static agentNames = [
    'agent-api',
    'agent-frontend',
    'agent-database',
    'agent-test-intelligence',
    'agent-code-review',
    'agent-polymorphic',
    'agent-architecture',
    'agent-security',
    'agent-performance',
    'agent-documentation',
    'agent-refactor',
    'agent-qa',
    'agent-deploy',
    'agent-analytics',
    'agent-integration',
  ];

  /**
   * Action types and their corresponding action names
   */
  private static actionTypes = [
    { type: 'tool_call', names: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'] },
    { type: 'decision', names: ['Route Selection', 'Strategy Choice', 'Validation', 'Approval'] },
    { type: 'execution', names: ['Code Generation', 'Test Execution', 'Deployment', 'Analysis'] },
    { type: 'error', names: ['Timeout', 'Parse Error', 'Connection Failed', 'Invalid Input'] },
    { type: 'success', names: ['Task Complete', 'Validation Passed', 'Tests Passed', 'Deploy Success'] },
  ];

  /**
   * Generate action descriptions based on type
   */
  private static generateDescription(actionType: string, actionName: string, target?: string): string {
    const descriptions: Record<string, string[]> = {
      Read: [
        `Read file ${target || 'source file'}`,
        `Analyzed ${target || 'configuration'}`,
        `Scanned ${target || 'codebase'} for patterns`,
      ],
      Write: [
        `Created new file ${target || 'output.ts'}`,
        `Generated ${target || 'component'}`,
        `Wrote configuration to ${target || 'config.json'}`,
      ],
      Edit: [
        `Modified ${target || 'source file'}`,
        `Updated ${target || 'component'} logic`,
        `Refactored ${target || 'module'}`,
      ],
      Bash: [
        `Executed command: ${target || 'npm test'}`,
        `Ran build process`,
        `Deployed to ${target || 'staging'}`,
      ],
      Grep: [
        `Searched for pattern "${target || 'TODO'}"`,
        `Found ${Gen.randomInt(5, 30)} matches in codebase`,
        `Analyzed code patterns`,
      ],
      Glob: [
        `Located ${Gen.randomInt(10, 100)} files matching pattern`,
        `Indexed project files`,
        `Scanned directory structure`,
      ],
      'Route Selection': [
        'Selected optimal agent for task',
        'Evaluated routing strategies',
        'Determined execution path',
      ],
      'Strategy Choice': [
        'Chose enhanced fuzzy matching strategy',
        'Applied capability alignment algorithm',
        'Selected best execution approach',
      ],
      Validation: [
        'Validated input parameters',
        'Checked code quality gates',
        'Verified test coverage',
      ],
      'Code Generation': [
        `Generated ${Gen.randomInt(50, 500)} lines of code`,
        'Created component structure',
        'Built API endpoints',
      ],
      'Test Execution': [
        `Ran ${Gen.randomInt(10, 50)} test suites`,
        'Executed integration tests',
        'Validated unit test coverage',
      ],
      Analysis: [
        'Analyzed code complexity',
        'Evaluated performance metrics',
        'Assessed security vulnerabilities',
      ],
    };

    const options = descriptions[actionName] || [`Performed ${actionName.toLowerCase()}`];
    return Gen.randomItem(options);
  }

  /**
   * Generate realistic file targets
   */
  private static generateTarget(actionName: string): string | undefined {
    if (['Read', 'Write', 'Edit'].includes(actionName)) {
      return Gen.filePath();
    }
    if (actionName === 'Bash') {
      const commands = ['npm test', 'npm run build', 'git status', 'docker compose up', 'pnpm install'];
      return Gen.randomItem(commands);
    }
    if (actionName === 'Grep') {
      const patterns = ['TODO', 'FIXME', 'import.*React', 'async.*function', 'interface.*Props'];
      return Gen.randomItem(patterns);
    }
    return undefined;
  }

  /**
   * Generate mock recent activities
   */
  static generateRecentActivities(count: number = 20): RecentActivity[] {
    const activities: RecentActivity[] = [];

    for (let i = 0; i < count; i++) {
      const agentName = Gen.randomItem(this.agentNames);
      const actionTypeObj = Gen.randomItem(this.actionTypes);
      const actionType = actionTypeObj.type;
      const actionName = Gen.randomItem(actionTypeObj.names);
      const target = this.generateTarget(actionName);
      const description = this.generateDescription(actionType, actionName, target);

      // More successes than errors
      let status: 'success' | 'error' | 'warning' | 'in_progress';
      const rand = Math.random();
      if (rand < 0.75) status = 'success';
      else if (rand < 0.85) status = 'warning';
      else if (rand < 0.95) status = 'error';
      else status = 'in_progress';

      const durationMs = status === 'in_progress'
        ? 0
        : Gen.randomInt(
            actionType === 'tool_call' ? 50 : 100,
            actionType === 'execution' ? 5000 : 2000
          );

      const timestamp = Gen.pastTimestamp(24 * 60); // Within last 24 hours
      const createdAt = timestamp;

      const actionDetails = actionType === 'tool_call' ? {
        tool: actionName,
        target: target || 'N/A',
      } : {
        action: actionName,
      };

      activities.push({
        id: Gen.uuid(),
        correlationId: Gen.uuid(),
        agentName,
        actionType,
        actionName,
        description,
        status,
        timestamp,
        createdAt,
        duration: durationMs,
        durationMs,
        target,
        actionDetails,
        debugMode: Math.random() < 0.2, // 20% of actions in debug mode
      });
    }

    // Sort by timestamp (most recent first)
    return activities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Generate a single recent activity
   */
  static generateSingleActivity(): RecentActivity {
    return this.generateRecentActivities(1)[0];
  }

  /**
   * Get activities for a specific agent
   */
  static generateActivitiesForAgent(agentName: string, count: number = 10): RecentActivity[] {
    const activities = this.generateRecentActivities(count * 2); // Generate more to filter
    return activities
      .filter(a => a.agentName === agentName)
      .slice(0, count);
  }

  /**
   * Get activities by status
   */
  static generateActivitiesByStatus(
    status: 'success' | 'error' | 'warning' | 'in_progress',
    count: number = 10
  ): RecentActivity[] {
    const activities = this.generateRecentActivities(count * 3); // Generate more to filter
    return activities
      .filter(a => a.status === status)
      .slice(0, count);
  }
}
