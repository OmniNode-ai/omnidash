/**
 * Injection Effectiveness API Routes (OMN-1891 / OMN-2325)
 *
 * REST endpoints for the effectiveness dashboard: summary, throttle status,
 * latency details, utilization analytics, and A/B comparison.
 * All data access goes through the EffectivenessMetricsProjection view
 * (projection-only read path). No direct DB imports.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 * @see OMN-2325 - Decouple dashboard routes from database schema
 */

import { Router } from 'express';
import type { EffectivenessSummary, ThrottleStatus } from '@shared/effectiveness-types';
import { projectionService } from './projection-bootstrap';
import type {
  EffectivenessMetricsProjection,
  EffectivenessMetricsPayload,
} from './projections/effectiveness-metrics-projection';

const router = Router();

// ============================================================================
// Helper: get projection view (with graceful degradation)
// ============================================================================

function getEffectivenessView(): EffectivenessMetricsProjection | undefined {
  return projectionService.getView<EffectivenessMetricsPayload>('effectiveness-metrics') as
    | EffectivenessMetricsProjection
    | undefined;
}

// ============================================================================
// GET /api/effectiveness/summary
// Executive summary metrics (R1)
// ============================================================================

router.get('/summary', async (_req, res) => {
  try {
    const view = getEffectivenessView();
    if (!view) {
      return res.json(emptySummary());
    }

    const result = await view.ensureFresh();
    res.json(result.summary);
  } catch (error) {
    console.error('[effectiveness] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get effectiveness summary' });
  }
});

// ============================================================================
// GET /api/effectiveness/throttle
// Auto-throttle status (R2)
// ============================================================================

router.get('/throttle', async (_req, res) => {
  try {
    const view = getEffectivenessView();
    if (!view) {
      return res.json({
        active: false,
        reason: null,
        latency_delta_p95_1h: null,
        median_utilization_1h: null,
        injected_sessions_1h: 0,
        window_start: null,
      } satisfies ThrottleStatus);
    }

    const result = await view.ensureFresh();
    res.json(result.throttle);
  } catch (error) {
    console.error('[effectiveness] Error getting throttle status:', error);
    res.status(500).json({ error: 'Failed to get throttle status' });
  }
});

// ============================================================================
// GET /api/effectiveness/latency
// Latency breakdown details (R3)
// ============================================================================

router.get('/latency', async (_req, res) => {
  try {
    const view = getEffectivenessView();
    if (!view) {
      return res.json({
        breakdowns: [],
        trend: [],
        cache: { hit_rate: 0, total_hits: 0, total_misses: 0 },
      });
    }

    const result = await view.ensureFresh();
    res.json(result.latency);
  } catch (error) {
    console.error('[effectiveness] Error getting latency details:', error);
    res.status(500).json({ error: 'Failed to get latency details' });
  }
});

// ============================================================================
// GET /api/effectiveness/utilization
// Utilization analytics (R4)
// ============================================================================

router.get('/utilization', async (_req, res) => {
  try {
    const view = getEffectivenessView();
    if (!view) {
      return res.json({
        histogram: [],
        by_method: [],
        pattern_rates: [],
        low_utilization_sessions: [],
      });
    }

    const result = await view.ensureFresh();
    res.json(result.utilization);
  } catch (error) {
    console.error('[effectiveness] Error getting utilization details:', error);
    res.status(500).json({ error: 'Failed to get utilization details' });
  }
});

// ============================================================================
// GET /api/effectiveness/ab
// A/B Comparison (R5)
// ============================================================================

router.get('/ab', async (_req, res) => {
  try {
    const view = getEffectivenessView();
    if (!view) {
      return res.json({ cohorts: [], total_sessions: 0 });
    }

    const result = await view.ensureFresh();
    res.json(result.ab);
  } catch (error) {
    console.error('[effectiveness] Error getting A/B comparison:', error);
    res.status(500).json({ error: 'Failed to get A/B comparison' });
  }
});

// ============================================================================
// GET /api/effectiveness/trend
// Multi-metric trend for summary chart
// ============================================================================

router.get('/trend', async (_req, res) => {
  try {
    const view = getEffectivenessView();
    if (!view) {
      return res.json([]);
    }

    const result = await view.ensureFresh();
    res.json(result.trend);
  } catch (error) {
    console.error('[effectiveness] Error getting trend:', error);
    res.status(500).json({ error: 'Failed to get trend' });
  }
});

// ============================================================================
// Helpers
// ============================================================================

function emptySummary(): EffectivenessSummary {
  return {
    injection_rate: 0,
    injection_rate_target: 0.8,
    median_utilization: 0,
    utilization_target: 0.6,
    mean_agent_accuracy: 0,
    accuracy_target: 0.8,
    latency_delta_p95_ms: 0,
    latency_delta_target_ms: 150,
    total_sessions: 0,
    treatment_sessions: 0,
    control_sessions: 0,
    throttle_active: false,
    throttle_reason: null,
  };
}

export default router;
