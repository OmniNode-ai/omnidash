import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { intelligenceDb } from './storage';
import { agentActions } from '../shared/intelligence-schema';
import {
  getErrorRate,
  getManifestInjectionSuccessRate,
  getAvgResponseTime,
  getSuccessRate,
} from './alert-helpers';

export const alertRouter = Router();

/**
 * GET /api/intelligence/alerts/active
 * Returns active critical and warning alerts based on system health checks
 *
 * Alert Conditions:
 *
 * CRITICAL (Red):
 * - Intelligence service unreachable (Omniarchon down)
 * - Database connection failed
 * - Error rate > 10% (last 10 minutes)
 * - Manifest injection success rate < 90% (last hour)
 *
 * WARNING (Yellow):
 * - High response time (avg > 2000ms last 10 min)
 * - Error rate > 5% (last 10 minutes)
 * - Manifest injection success rate < 95% (last hour)
 * - Low success rate < 85%
 *
 * Response format:
 * {
 *   alerts: [
 *     {
 *       level: "critical" | "warning",
 *       message: "Description of the alert",
 *       timestamp: "2025-10-28T12:00:00Z"
 *     }
 *   ]
 * }
 */
alertRouter.get('/active', async (req, res) => {
  try {
    const alerts: Array<{
      level: 'critical' | 'warning';
      message: string;
      timestamp: string;
    }> = [];

    // Check Omniarchon health (critical if down)
    const omniarchonUrl = process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:8053';
    try {
      const healthResponse = await fetch(`${omniarchonUrl}/health`, {
        signal: AbortSignal.timeout(2000)
      });

      if (!healthResponse.ok) {
        alerts.push({
          level: 'critical',
          message: `Omniarchon intelligence service returned ${healthResponse.status}`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (omniarchonError) {
      alerts.push({
        level: 'critical',
        message: 'Omniarchon intelligence service unreachable',
        timestamp: new Date().toISOString()
      });
    }

    // Check database connection (critical if failed)
    try {
      await intelligenceDb
        .select({ check: sql<number>`1::int` })
        .from(agentActions)
        .limit(1);
    } catch (dbError) {
      alerts.push({
        level: 'critical',
        message: 'Database connection failed',
        timestamp: new Date().toISOString()
      });
    }

    // Check error rate (last 10 minutes)
    const errorRate = await getErrorRate('10 minutes');
    if (errorRate > 0.10) {
      alerts.push({
        level: 'critical',
        message: `Error rate at ${(errorRate * 100).toFixed(1)}% (threshold: 10%)`,
        timestamp: new Date().toISOString()
      });
    } else if (errorRate > 0.05) {
      alerts.push({
        level: 'warning',
        message: `Error rate at ${(errorRate * 100).toFixed(1)}% (threshold: 5%)`,
        timestamp: new Date().toISOString()
      });
    }

    // Check manifest injection success rate (last hour)
    const injectionSuccessRate = await getManifestInjectionSuccessRate('1 hour');
    if (injectionSuccessRate < 0.90) {
      alerts.push({
        level: 'critical',
        message: `Manifest injection success rate at ${(injectionSuccessRate * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString()
      });
    } else if (injectionSuccessRate < 0.95) {
      alerts.push({
        level: 'warning',
        message: `Manifest injection success rate at ${(injectionSuccessRate * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString()
      });
    }

    // Check average response time (last 10 minutes)
    const avgResponseTime = await getAvgResponseTime('10 minutes');
    if (avgResponseTime > 2000) {
      alerts.push({
        level: 'warning',
        message: `High response time: ${avgResponseTime}ms (threshold: 2000ms)`,
        timestamp: new Date().toISOString()
      });
    }

    // Check overall success rate (last hour)
    const successRate = await getSuccessRate('1 hour');
    if (successRate < 0.85) {
      alerts.push({
        level: 'warning',
        message: `Low success rate: ${(successRate * 100).toFixed(1)}% (threshold: 85%)`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ alerts });
  } catch (error) {
    console.error('Error fetching active alerts:', error);
    res.status(500).json({
      error: 'Failed to fetch active alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
