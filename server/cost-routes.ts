/**
 * Cost Trend API Routes (OMN-2300)
 *
 * REST endpoints for the LLM cost and token usage trend dashboard:
 * summary, trend, by-model, by-repo, by-pattern, token-usage, alerts.
 *
 * All data access goes through the CostMetricsProjection view
 * (projection-only read path). No direct DB imports.
 *
 * @see OMN-2300 - LLM cost Kafka consumer / read-model materialization
 * @see OMN-2242 - Cost trend dashboard UI
 */

import { Router } from 'express';
import type { CostTimeWindow } from '@shared/cost-types';
import { projectionService } from './projection-bootstrap';
import type {
  CostMetricsProjection,
  CostMetricsPayload,
} from './projections/cost-metrics-projection';

const router = Router();

// ============================================================================
// Helper: get projection view (with graceful degradation)
// ============================================================================

/**
 * Returns the registered CostMetricsProjection, or undefined if unavailable.
 *
 * Uses duck-typing on `ensureFreshForWindow` to verify the view is the
 * expected projection type without requiring a direct import of the class
 * (which would create a circular dependency through projection-bootstrap).
 */
function getCostView(): CostMetricsProjection | undefined {
  const view = projectionService.getView<CostMetricsPayload>('cost-metrics');
  if (view == null) return undefined;
  // Duck-type check: CostMetricsProjection extends DbBackedProjectionView and
  // exposes ensureFresh + ensureFreshForWindow. If these are present, the view
  // is a compatible CostMetricsProjection instance.
  if (typeof (view as CostMetricsProjection).ensureFresh !== 'function') return undefined;
  if (typeof (view as CostMetricsProjection).ensureFreshForWindow !== 'function') return undefined;
  return view as CostMetricsProjection;
}

/** Validate and normalize the time window query parameter. */
function parseWindow(raw: unknown): CostTimeWindow {
  if (raw === '24h' || raw === '7d' || raw === '30d') return raw;
  return '7d';
}

/**
 * Get payload for the requested window.
 * For the default 7d window, use the TTL-cached ensureFresh().
 * For non-default windows, delegate to the projection's own method (which
 * accesses the DB internally — no direct DB imports in this route file).
 */
async function getPayloadForWindow(
  view: CostMetricsProjection,
  window: CostTimeWindow
): Promise<CostMetricsPayload> {
  if (window === '7d') {
    // Default window — use cached snapshot
    return view.ensureFresh();
  }
  // Non-default window — the projection handles DB access internally
  return view.ensureFreshForWindow(window);
}

// ============================================================================
// GET /api/costs/summary?window=7d&includeEstimated=false
// ============================================================================

router.get('/summary', async (req, res) => {
  try {
    const timeWindow = parseWindow(req.query.window);
    // NOTE: `includeEstimated` query parameter is accepted but not yet
    // implemented. The response always includes estimated costs.
    // TODO(OMN-2242): honour includeEstimated to filter out estimated rows.

    const view = getCostView();
    if (!view) {
      return res.json({
        total_cost_usd: 0,
        reported_cost_usd: 0,
        estimated_cost_usd: 0,
        reported_coverage_pct: 0,
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        session_count: 0,
        model_count: 0,
        avg_cost_per_session: 0,
        cost_change_pct: 0,
        active_alerts: 0,
      });
    }

    const payload = await getPayloadForWindow(view, timeWindow);
    return res.json(payload.summary);
  } catch (error) {
    console.error('[costs] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

// ============================================================================
// GET /api/costs/trend?window=7d&includeEstimated=false
// ============================================================================

router.get('/trend', async (req, res) => {
  try {
    const timeWindow = parseWindow(req.query.window);
    // NOTE: `includeEstimated` query parameter is accepted but not yet
    // implemented. The response always includes estimated costs.
    // TODO(OMN-2242): honour includeEstimated to filter out estimated rows.

    const view = getCostView();
    if (!view) {
      return res.json([]);
    }

    const payload = await getPayloadForWindow(view, timeWindow);
    return res.json(payload.trend);
  } catch (error) {
    console.error('[costs] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch cost trend' });
  }
});

// ============================================================================
// GET /api/costs/by-model?includeEstimated=false
// ============================================================================
// NOTE: `includeEstimated` query parameter is accepted but not yet
// implemented. The response always includes estimated costs.
// TODO(OMN-2242): honour includeEstimated to filter out estimated rows.

router.get('/by-model', async (_req, res) => {
  try {
    const view = getCostView();
    if (!view) {
      return res.json([]);
    }

    const payload = await view.ensureFresh();
    return res.json(payload.byModel);
  } catch (error) {
    console.error('[costs] Error fetching by-model:', error);
    return res.status(500).json({ error: 'Failed to fetch cost by model' });
  }
});

// ============================================================================
// GET /api/costs/by-repo?includeEstimated=false
// ============================================================================
// NOTE: `includeEstimated` query parameter is accepted but not yet
// implemented. The response always includes estimated costs.
// TODO(OMN-2242): honour includeEstimated to filter out estimated rows.

router.get('/by-repo', async (_req, res) => {
  try {
    const view = getCostView();
    if (!view) {
      return res.json([]);
    }

    const payload = await view.ensureFresh();
    return res.json(payload.byRepo);
  } catch (error) {
    console.error('[costs] Error fetching by-repo:', error);
    return res.status(500).json({ error: 'Failed to fetch cost by repo' });
  }
});

// ============================================================================
// GET /api/costs/by-pattern?includeEstimated=false
// ============================================================================
// NOTE: `includeEstimated` query parameter is accepted but not yet
// implemented. The response always includes estimated costs.
// TODO(OMN-2242): honour includeEstimated to filter out estimated rows.

router.get('/by-pattern', async (_req, res) => {
  try {
    const view = getCostView();
    if (!view) {
      return res.json([]);
    }

    const payload = await view.ensureFresh();
    return res.json(payload.byPattern);
  } catch (error) {
    console.error('[costs] Error fetching by-pattern:', error);
    return res.status(500).json({ error: 'Failed to fetch cost by pattern' });
  }
});

// ============================================================================
// GET /api/costs/token-usage?window=7d&includeEstimated=false
// ============================================================================

router.get('/token-usage', async (req, res) => {
  try {
    const timeWindow = parseWindow(req.query.window);
    // NOTE: `includeEstimated` query parameter is accepted but not yet
    // implemented. The response always includes estimated costs.
    // TODO(OMN-2242): honour includeEstimated to filter out estimated rows.

    const view = getCostView();
    if (!view) {
      return res.json([]);
    }

    const payload = await getPayloadForWindow(view, timeWindow);
    return res.json(payload.tokenUsage);
  } catch (error) {
    console.error('[costs] Error fetching token-usage:', error);
    return res.status(500).json({ error: 'Failed to fetch token usage' });
  }
});

// ============================================================================
// GET /api/costs/alerts
// ============================================================================

router.get('/alerts', (_req, res) => {
  try {
    // Budget alerts table not yet implemented (tracked in OMN-2240).
    // Returns empty array so clients fall back to their graceful-degradation path.
    return res.json([]);
  } catch (error) {
    console.error('[costs] Error fetching alerts:', error);
    return res.status(500).json({ error: 'Failed to fetch budget alerts' });
  }
});

export default router;
