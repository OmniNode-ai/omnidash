/**
 * Pattern Enforcement API Routes (OMN-2275)
 *
 * REST endpoints for the pattern enforcement dashboard:
 * summary, by-language, by-domain, violated-patterns, trend.
 *
 * Returns empty/placeholder responses so the client falls back to mock data.
 * When the upstream enforcement service (OMN-2270) populates the
 * `pattern_enforcement_events` table via the read-model consumer projection,
 * replace with real queries following the same pattern as baselines-routes.ts.
 *
 * NOTE: Per OMN-2325 architectural rule, route files must not import DB
 * accessors directly. Use projectionService views for data access once
 * the enforcement projection is wired (future ticket).
 */

import { Router } from 'express';
import type {
  EnforcementSummary,
  EnforcementByLanguage,
  EnforcementByDomain,
  ViolatedPattern,
  EnforcementTrendPoint,
} from '@shared/enforcement-types';

const router = Router();

// ============================================================================
// GET /api/enforcement/summary?window=7d
// ============================================================================

router.get('/summary', (req, res) => {
  try {
    const window = (req.query.window as string) || '7d';
    const validWindows = ['24h', '7d', '30d'];
    if (!validWindows.includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2275-followup): Replace with projectionService.getView('enforcement').getSnapshot()
    // once the enforcement projection is implemented. Use `window` to scope the query.
    const empty: EnforcementSummary = {
      total_evaluations: 0,
      hit_rate: 0,
      correction_rate: 0,
      false_positive_rate: 0,
      violated_pattern_count: 0,
      counts: { hits: 0, violations: 0, corrected: 0, false_positives: 0 },
      correction_rate_trend: [],
    };
    return res.json(empty);
  } catch (error) {
    console.error('[enforcement] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch enforcement summary' });
  }
});

// ============================================================================
// GET /api/enforcement/by-language?window=7d
// ============================================================================

router.get('/by-language', (req, res) => {
  try {
    const window = (req.query.window as string) || '7d';
    const validWindows = ['24h', '7d', '30d'];
    if (!validWindows.includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2275-followup): Replace with projection view query scoped to `window`.
    const data: EnforcementByLanguage[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enforcement] Error fetching by-language:', error);
    return res.status(500).json({ error: 'Failed to fetch enforcement by language' });
  }
});

// ============================================================================
// GET /api/enforcement/by-domain?window=7d
// ============================================================================

router.get('/by-domain', (req, res) => {
  try {
    const window = (req.query.window as string) || '7d';
    const validWindows = ['24h', '7d', '30d'];
    if (!validWindows.includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2275-followup): Replace with projection view query scoped to `window`.
    const data: EnforcementByDomain[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enforcement] Error fetching by-domain:', error);
    return res.status(500).json({ error: 'Failed to fetch enforcement by domain' });
  }
});

// ============================================================================
// GET /api/enforcement/violated-patterns?window=7d
// ============================================================================

router.get('/violated-patterns', (req, res) => {
  try {
    const window = (req.query.window as string) || '7d';
    const validWindows = ['24h', '7d', '30d'];
    if (!validWindows.includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2275-followup): Replace with projection view query scoped to `window`.
    const data: ViolatedPattern[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enforcement] Error fetching violated-patterns:', error);
    return res.status(500).json({ error: 'Failed to fetch violated patterns' });
  }
});

// ============================================================================
// GET /api/enforcement/trend?window=7d
// ============================================================================

router.get('/trend', (req, res) => {
  try {
    const window = (req.query.window as string) || '7d';
    const validWindows = ['24h', '7d', '30d'];
    if (!validWindows.includes(window)) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    // TODO(OMN-2275-followup): Replace with projection view query scoped to `window`.
    const data: EnforcementTrendPoint[] = [];
    return res.json(data);
  } catch (error) {
    console.error('[enforcement] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch enforcement trend' });
  }
});

export default router;
