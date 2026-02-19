/**
 * Context Enrichment API Routes (OMN-2280)
 *
 * REST endpoints for the context enrichment dashboard:
 * summary, by-channel, latency-distribution, token-savings,
 * similarity-quality, inflation-alerts.
 *
 * Returns empty/placeholder responses so the client falls back to mock data.
 * When the upstream enrichment service populates the
 * `context_enrichment_events` table via the read-model consumer projection,
 * replace with real queries following the same pattern as baselines-routes.ts.
 *
 * TODO(OMN-2280): Validate window against EnrichmentTimeWindow before passing to queries; return 400 for invalid values to avoid unvalidated input reaching DB.
 *
 * NOTE: Per OMN-2325 architectural rule, route files must not import DB
 * accessors directly. Use projectionService views for data access once
 * the enrichment projection is wired (future ticket).
 */

import { Router } from 'express';
import type {
  EnrichmentSummary,
  EnrichmentByChannel,
  LatencyDistributionPoint,
  TokenSavingsTrendPoint,
  SimilarityQualityPoint,
  InflationAlert,
} from '@shared/enrichment-types';

const router = Router();

// ============================================================================
// GET /api/enrichment/summary?window=7d
// ============================================================================

router.get('/summary', (req, res) => {
  try {
    const window = req.query.window as string | undefined;
    if (window !== undefined && !['24h', '7d', '30d'].includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2280-followup): Replace with projectionService.getView('enrichment').getSnapshot()
    // once the enrichment projection is implemented. Use req.query.window to scope the query.
    const empty: EnrichmentSummary = {
      total_enrichments: 0,
      hit_rate: 0,
      net_tokens_saved: 0,
      p50_latency_ms: 0,
      p95_latency_ms: 0,
      avg_similarity_score: 0,
      inflation_alert_count: 0,
      error_rate: 0,
      counts: { hits: 0, misses: 0, errors: 0, inflated: 0 },
    };
    return res.json(empty);
  } catch (error) {
    console.error('[enrichment] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch enrichment summary' });
  }
});

// ============================================================================
// GET /api/enrichment/by-channel?window=7d
// ============================================================================

router.get('/by-channel', (req, res) => {
  try {
    const window = req.query.window as string | undefined;
    if (window !== undefined && !['24h', '7d', '30d'].includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2280-followup): Replace with projection view query scoped to req.query.window.
    const data: EnrichmentByChannel[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enrichment] Error fetching by-channel:', error);
    return res.status(500).json({ error: 'Failed to fetch enrichment by channel' });
  }
});

// ============================================================================
// GET /api/enrichment/latency-distribution?window=7d
// ============================================================================

router.get('/latency-distribution', (req, res) => {
  try {
    const window = req.query.window as string | undefined;
    if (window !== undefined && !['24h', '7d', '30d'].includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2280-followup): Replace with projection view query scoped to req.query.window.
    const data: LatencyDistributionPoint[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enrichment] Error fetching latency-distribution:', error);
    return res.status(500).json({ error: 'Failed to fetch latency distribution' });
  }
});

// ============================================================================
// GET /api/enrichment/token-savings?window=7d
// ============================================================================

router.get('/token-savings', (req, res) => {
  try {
    const window = req.query.window as string | undefined;
    if (window !== undefined && !['24h', '7d', '30d'].includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2280-followup): Replace with projection view query scoped to req.query.window.
    const data: TokenSavingsTrendPoint[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enrichment] Error fetching token-savings:', error);
    return res.status(500).json({ error: 'Failed to fetch token savings trend' });
  }
});

// ============================================================================
// GET /api/enrichment/similarity-quality?window=7d
// ============================================================================

router.get('/similarity-quality', (req, res) => {
  try {
    const window = req.query.window as string | undefined;
    if (window !== undefined && !['24h', '7d', '30d'].includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2280-followup): Replace with projection view query scoped to req.query.window.
    const data: SimilarityQualityPoint[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enrichment] Error fetching similarity-quality:', error);
    return res.status(500).json({ error: 'Failed to fetch similarity quality' });
  }
});

// ============================================================================
// GET /api/enrichment/inflation-alerts?window=7d
// ============================================================================

router.get('/inflation-alerts', (req, res) => {
  try {
    const window = req.query.window as string | undefined;
    if (window !== undefined && !['24h', '7d', '30d'].includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2280-followup): Replace with projection view query scoped to req.query.window.
    const data: InflationAlert[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enrichment] Error fetching inflation-alerts:', error);
    return res.status(500).json({ error: 'Failed to fetch inflation alerts' });
  }
});

export default router;
