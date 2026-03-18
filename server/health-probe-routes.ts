/**
 * Public Health Probe Endpoint (OMN-4515)
 *
 * GET /api/health-probe
 *
 * Returns a non-sensitive aggregate health status without requiring
 * authentication. Designed for:
 *   - k8s readiness/liveness probes that run unauthenticated
 *   - The frontend top-bar health indicator polling in production
 *
 * Response shape:
 * {
 *   status: "up" | "degraded" | "down",
 *   services: {
 *     eventConsumer: "up" | "down",
 *     eventBus: "up" | "down"
 *   },
 *   checkedAt: string
 * }
 *
 * Security: intentionally returns only non-sensitive aggregate signals.
 * Full detail is still available via authenticated /api/health/* endpoints.
 */

import { Router } from 'express';
import { eventConsumer } from './event-consumer';
import { getEventBusDataSource } from './event-bus-data-source';
import { checkSchemaParity } from './schema-health';

export interface HealthProbeResponse {
  status: 'up' | 'degraded' | 'down';
  services: {
    eventConsumer: 'up' | 'down';
    eventBus: 'up' | 'down';
    database: 'up' | 'down';
  };
  checkedAt: string;
}

const router = Router();

// Short TTL cache (10 s) — probes are called frequently by k8s and the top bar.
let cache: { response: HealthProbeResponse; expiresAt: number } | null = null;

/**
 * Clear probe cache — exported for tests.
 */
export function clearHealthProbeCache(): void {
  cache = null;
}

/**
 * GET /api/health-probe
 *
 * Public endpoint — no authentication required.
 * Returns aggregate health status without sensitive details.
 */
router.get('/', async (_req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.set('Cache-Control', 'no-store');
      res.json(cache.response);
      return;
    }

    // --- Event consumer probe ---
    let eventConsumerStatus: 'up' | 'down' = 'down';
    try {
      const health = eventConsumer.getHealthStatus();
      eventConsumerStatus = health.status === 'healthy' ? 'up' : 'down';
    } catch {
      // Leave as 'down'
    }

    // --- Event bus probe ---
    let eventBusStatus: 'up' | 'down' = 'down';
    try {
      const dataSource = getEventBusDataSource();
      if (dataSource?.isActive()) {
        eventBusStatus = 'up';
      }
    } catch {
      // Leave as 'down'
    }

    // --- Database + migration parity probe [OMN-5365] ---
    let databaseStatus: 'up' | 'down' = 'down';
    try {
      const schemaHealth = await checkSchemaParity();
      databaseStatus = schemaHealth.schema_ok ? 'up' : 'down';
    } catch {
      // Leave as 'down'
    }

    // Aggregate: "up" if all up, "degraded" if some up, "down" if all down
    const statuses = [eventConsumerStatus, eventBusStatus, databaseStatus];
    const allUp = statuses.every((s) => s === 'up');
    const allDown = statuses.every((s) => s === 'down');
    const aggregateStatus: 'up' | 'degraded' | 'down' = allUp
      ? 'up'
      : allDown
        ? 'down'
        : 'degraded';

    const response: HealthProbeResponse = {
      status: aggregateStatus,
      services: {
        eventConsumer: eventConsumerStatus,
        eventBus: eventBusStatus,
        database: databaseStatus,
      },
      checkedAt: new Date().toISOString(),
    };

    cache = { response, expiresAt: Date.now() + 10_000 };
    res.set('Cache-Control', 'no-store');
    res.json(response);
  } catch {
    res.set('Cache-Control', 'no-store');
    res.status(503).json({
      status: 'down',
      services: { eventConsumer: 'down', eventBus: 'down', database: 'down' },
      checkedAt: new Date().toISOString(),
    });
  }
});

export default router;
