import { sql } from 'drizzle-orm';
import { intelligenceDb } from './storage';
import {
  agentActions,
  agentManifestInjections,
  agentRoutingDecisions,
} from '../shared/intelligence-schema';

/**
 * Helper function to calculate error rate over a time window
 * Returns ratio of failed executions to total executions
 */
export async function getErrorRate(timeWindow: string): Promise<number> {
  try {
    const interval = timeWindow === '1 hour' ? '1 hour' :
                     timeWindow === '10 minutes' ? '10 minutes' :
                     timeWindow === '24 hours' ? '24 hours' : '10 minutes';

    // Count total actions and error actions in time window
    const [result] = await intelligenceDb
      .select({
        totalActions: sql<number>`COUNT(*)::int`,
        errorActions: sql<number>`
          COUNT(*) FILTER (
            WHERE ${agentActions.actionType} = 'error'
          )::int
        `,
      })
      .from(agentActions)
      .where(sql`${agentActions.createdAt} > NOW() - INTERVAL '${sql.raw(interval)}'`);

    if (!result || result.totalActions === 0) {
      return 0;
    }

    return result.errorActions / result.totalActions;
  } catch (error) {
    console.error('Error calculating error rate:', error);
    return 0;
  }
}

/**
 * Helper function to calculate manifest injection success rate
 * Returns ratio of successful injections to total injections
 */
export async function getManifestInjectionSuccessRate(timeWindow: string): Promise<number> {
  try {
    const interval = timeWindow === '1 hour' ? '1 hour' :
                     timeWindow === '24 hours' ? '24 hours' : '1 hour';

    const [result] = await intelligenceDb
      .select({
        totalInjections: sql<number>`COUNT(*)::int`,
        successfulInjections: sql<number>`
          COUNT(*) FILTER (
            WHERE ${agentManifestInjections.agentExecutionSuccess} = TRUE
          )::int
        `,
      })
      .from(agentManifestInjections)
      .where(sql`${agentManifestInjections.createdAt} > NOW() - INTERVAL '${sql.raw(interval)}'`);

    if (!result || result.totalInjections === 0) {
      // If no data, assume healthy (no failures yet)
      return 1.0;
    }

    return result.successfulInjections / result.totalInjections;
  } catch (error) {
    console.error('Error calculating manifest injection success rate:', error);
    return 1.0; // Assume healthy on error
  }
}

/**
 * Helper function to calculate average response time
 * Returns average routing time in milliseconds
 */
export async function getAvgResponseTime(timeWindow: string): Promise<number> {
  try {
    const interval = timeWindow === '10 minutes' ? '10 minutes' :
                     timeWindow === '1 hour' ? '1 hour' :
                     timeWindow === '24 hours' ? '24 hours' : '10 minutes';

    const [result] = await intelligenceDb
      .select({
        avgTimeMs: sql<number>`ROUND(AVG(${agentRoutingDecisions.routingTimeMs}))::int`,
      })
      .from(agentRoutingDecisions)
      .where(sql`${agentRoutingDecisions.createdAt} > NOW() - INTERVAL '${sql.raw(interval)}'`);

    if (!result || !result.avgTimeMs) {
      return 0;
    }

    return result.avgTimeMs;
  } catch (error) {
    console.error('Error calculating average response time:', error);
    return 0;
  }
}

/**
 * Helper function to calculate overall success rate
 * Returns ratio of successful routing decisions to total decisions
 */
export async function getSuccessRate(timeWindow: string): Promise<number> {
  try {
    const interval = timeWindow === '1 hour' ? '1 hour' :
                     timeWindow === '24 hours' ? '24 hours' : '1 hour';

    const [result] = await intelligenceDb
      .select({
        totalDecisions: sql<number>`COUNT(*)::int`,
        successfulDecisions: sql<number>`
          COUNT(*) FILTER (
            WHERE ${agentRoutingDecisions.actualSuccess} = TRUE
          )::int
        `,
      })
      .from(agentRoutingDecisions)
      .where(sql`${agentRoutingDecisions.createdAt} > NOW() - INTERVAL '${sql.raw(interval)}'`);

    if (!result || result.totalDecisions === 0) {
      // If no data, assume healthy
      return 1.0;
    }

    return result.successfulDecisions / result.totalDecisions;
  } catch (error) {
    console.error('Error calculating success rate:', error);
    return 1.0; // Assume healthy on error
  }
}
