import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getIntelligenceDb } from './storage';
import { patternLineageNodes } from '../shared/intelligence-schema';
import { getAllAlertMetrics } from './alert-helpers';
import { getOmniarchonUrl } from './utils/service-urls';

export const alertRouter = Router();

/**
 * Health Check Cache
 * Caches health check results for 30 seconds to reduce latency
 */
interface HealthCheckCache {
  omniarchonStatus: 'ok' | 'error' | number; // 'ok', 'error', or HTTP status code
  databaseStatus: 'ok' | 'error';
  timestamp: number;
}

let healthCheckCache: HealthCheckCache | null = null;
const HEALTH_CHECK_CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Check if health check cache is valid
 */
function isHealthCheckCacheValid(): boolean {
  if (!healthCheckCache) return false;
  return Date.now() - healthCheckCache.timestamp < HEALTH_CHECK_CACHE_TTL_MS;
}

/**
 * Get cached or fresh health check results
 */
async function getHealthCheckStatus(): Promise<HealthCheckCache> {
  // Return cached data if still valid
  if (isHealthCheckCacheValid() && healthCheckCache) {
    return healthCheckCache;
  }

  // Execute health checks in parallel
  const [omniarchonResult, dbResult] = await Promise.allSettled([
    // Check Omniarchon health with short timeout
    (async () => {
      const omniarchonUrl = getOmniarchonUrl();
      try {
        const healthResponse = await fetch(`${omniarchonUrl}/health`, {
          signal: AbortSignal.timeout(500),
        });
        return healthResponse.ok ? ('ok' as const) : healthResponse.status;
      } catch {
        return 'error' as const;
      }
    })(),

    // Check database connection
    (async () => {
      try {
        await getIntelligenceDb()
          .select({ check: sql<number>`1::int` })
          .from(patternLineageNodes)
          .limit(1);
        return 'ok' as const;
      } catch {
        return 'error' as const;
      }
    })(),
  ]);

  // Cache the results
  healthCheckCache = {
    omniarchonStatus: omniarchonResult.status === 'fulfilled' ? omniarchonResult.value : 'error',
    databaseStatus: dbResult.status === 'fulfilled' ? dbResult.value : 'error',
    timestamp: Date.now(),
  };

  return healthCheckCache;
}

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
 *       id: "unique-uuid",
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
      id: string;
      level: 'critical' | 'warning';
      message: string;
      timestamp: string;
    }> = [];

    const timestamp = new Date().toISOString();

    // Fetch all data in parallel (all cached for 30 seconds)
    const [healthCheck, metrics] = await Promise.all([
      getHealthCheckStatus(),
      getAllAlertMetrics(),
    ]);

    // Process Omniarchon health check result
    if (healthCheck.omniarchonStatus === 'error') {
      alerts.push({
        id: randomUUID(),
        level: 'critical',
        message: 'Omniarchon intelligence service unreachable',
        timestamp,
      });
    } else if (typeof healthCheck.omniarchonStatus === 'number') {
      alerts.push({
        id: randomUUID(),
        level: 'critical',
        message: `Omniarchon intelligence service returned ${healthCheck.omniarchonStatus}`,
        timestamp,
      });
    }

    // Process database health check result
    if (healthCheck.databaseStatus === 'error') {
      alerts.push({
        id: randomUUID(),
        level: 'critical',
        message: 'Database connection failed',
        timestamp,
      });
    }

    // Process metrics results
    const { errorRate, injectionSuccessRate, avgResponseTime, successRate } = metrics;

    // Check error rate (last 10 minutes)
    if (errorRate > 0.1) {
      alerts.push({
        id: randomUUID(),
        level: 'critical',
        message: `Error rate at ${(errorRate * 100).toFixed(1)}% (threshold: 10%)`,
        timestamp,
      });
    } else if (errorRate > 0.05) {
      alerts.push({
        id: randomUUID(),
        level: 'warning',
        message: `Error rate at ${(errorRate * 100).toFixed(1)}% (threshold: 5%)`,
        timestamp,
      });
    }

    // Check manifest injection success rate (last hour)
    if (injectionSuccessRate < 0.9) {
      alerts.push({
        id: randomUUID(),
        level: 'critical',
        message: `Manifest injection success rate at ${(injectionSuccessRate * 100).toFixed(1)}%`,
        timestamp,
      });
    } else if (injectionSuccessRate < 0.95) {
      alerts.push({
        id: randomUUID(),
        level: 'warning',
        message: `Manifest injection success rate at ${(injectionSuccessRate * 100).toFixed(1)}%`,
        timestamp,
      });
    }

    // Check average response time (last 10 minutes)
    if (avgResponseTime > 2000) {
      alerts.push({
        id: randomUUID(),
        level: 'warning',
        message: `High response time: ${avgResponseTime}ms (threshold: 2000ms)`,
        timestamp,
      });
    }

    // Check overall success rate (last hour)
    if (successRate < 0.85) {
      alerts.push({
        id: randomUUID(),
        level: 'warning',
        message: `Low success rate: ${(successRate * 100).toFixed(1)}% (threshold: 85%)`,
        timestamp,
      });
    }

    res.json({ alerts });
  } catch (error) {
    console.error('Error fetching active alerts:', error);
    res.status(500).json({
      error: 'Failed to fetch active alerts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
