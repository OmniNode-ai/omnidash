/**
 * Extraction Pipeline API Routes (OMN-1804 / OMN-2325)
 *
 * REST endpoints for querying pattern extraction pipeline metrics.
 * All data access goes through the ExtractionMetricsProjection view
 * (projection-only read path). No direct DB imports.
 *
 * @see OMN-1804 - OBS-002: Pattern extraction metrics and dashboard
 * @see OMN-2325 - Decouple dashboard routes from database schema
 */

import { Router } from 'express';
import type {
  ExtractionSummary,
  PipelineHealthResponse,
  LatencyHeatmapResponse,
  PatternVolumeResponse,
  ErrorRatesSummaryResponse,
} from '@shared/extraction-types';
import { projectionService } from './projection-bootstrap';
import type {
  ExtractionMetricsProjection,
  ExtractionMetricsPayload,
} from './projections/extraction-metrics-projection';

const router = Router();

// ============================================================================
// Helper: get projection view (with graceful degradation)
// ============================================================================

function getExtractionView(): ExtractionMetricsProjection | undefined {
  return projectionService.getView<ExtractionMetricsPayload>('extraction-metrics') as
    | ExtractionMetricsProjection
    | undefined;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/extraction/summary
 * High-level stats for the metric cards row.
 */
router.get('/summary', async (_req, res) => {
  try {
    const view = getExtractionView();
    if (!view) {
      const empty: ExtractionSummary = {
        total_injections: 0,
        total_patterns_matched: 0,
        avg_utilization_score: null,
        avg_latency_ms: null,
        success_rate: null,
        last_event_at: null,
      };
      return res.json(empty);
    }

    const result = await view.ensureFresh();
    res.json(result.summary);
  } catch (error) {
    console.error('[extraction] Error getting summary:', error);
    res.status(500).json({ error: 'Failed to get extraction summary' });
  }
});

/**
 * GET /api/extraction/health/pipeline
 * Pipeline health grouped by cohort.
 */
router.get('/health/pipeline', async (_req, res) => {
  try {
    const view = getExtractionView();
    if (!view) {
      return res.json({ cohorts: [] } satisfies PipelineHealthResponse);
    }

    const result = await view.ensureFresh();
    res.json(result.pipelineHealth);
  } catch (error) {
    console.error('[extraction] Error getting pipeline health:', error);
    res.status(500).json({ error: 'Failed to get pipeline health' });
  }
});

/**
 * GET /api/extraction/latency/heatmap?window=24h
 * Latency percentiles by time bucket.
 */
router.get('/latency/heatmap', async (req, res) => {
  try {
    const view = getExtractionView();
    const windowParam = typeof req.query.window === 'string' ? req.query.window : '24h';

    if (!view) {
      return res.json({ buckets: [], window: windowParam } satisfies LatencyHeatmapResponse);
    }

    // Custom window parameters bypass the cached snapshot
    const result = await view.getLatencyHeatmap(windowParam);
    res.json(result);
  } catch (error) {
    console.error('[extraction] Error getting latency heatmap:', error);
    res.status(500).json({ error: 'Failed to get latency heatmap' });
  }
});

/**
 * GET /api/extraction/patterns/volume?window=24h
 * Pattern matches and injections over time.
 */
router.get('/patterns/volume', async (req, res) => {
  try {
    const view = getExtractionView();
    const windowParam = typeof req.query.window === 'string' ? req.query.window : '24h';

    if (!view) {
      return res.json({ points: [], window: windowParam } satisfies PatternVolumeResponse);
    }

    const result = await view.getPatternVolume(windowParam);
    res.json(result);
  } catch (error) {
    console.error('[extraction] Error getting pattern volume:', error);
    res.status(500).json({ error: 'Failed to get pattern volume' });
  }
});

/**
 * GET /api/extraction/errors/summary
 * Error rates by cohort with recent error samples.
 */
router.get('/errors/summary', async (_req, res) => {
  try {
    const view = getExtractionView();
    if (!view) {
      const empty: ErrorRatesSummaryResponse = {
        entries: [],
        total_errors: 0,
        overall_error_rate: null,
      };
      return res.json(empty);
    }

    const result = await view.ensureFresh();
    res.json(result.errorsSummary);
  } catch (error) {
    console.error('[extraction] Error getting error rates:', error);
    res.status(500).json({ error: 'Failed to get error rates' });
  }
});

export default router;
