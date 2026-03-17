/**
 * Routing Feedback API Routes (OMN-5284)
 *
 * Provides read endpoints for routing feedback events projected from
 * onex.evt.omniintelligence.routing-feedback-processed.v1 into the
 * routing_feedback_events read-model table.
 *
 * Endpoints:
 *   GET /api/routing-feedback         — recent events + accuracy summary
 */

import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';

const router = Router();

// ============================================================================
// GET /api/routing-feedback
// ============================================================================

router.get('/', async (_req: Request, res: Response) => {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const [recentRows, summaryRows, distributionRows, trendRows] = await Promise.all([
      // Most recent 50 feedback events
      db.execute<{
        id: string;
        agent_id: string;
        feedback_type: string;
        original_route: string;
        corrected_route: string | null;
        accuracy_score: number | null;
        created_at: string;
      }>(sql`
        SELECT id, agent_id, feedback_type, original_route, corrected_route,
               accuracy_score, created_at
        FROM routing_feedback_events
        ORDER BY created_at DESC
        LIMIT 50
      `),
      // Accuracy summary
      db.execute<{
        total_events: string;
        avg_accuracy: string | null;
        positive_count: string;
        negative_count: string;
        correction_count: string;
      }>(sql`
        SELECT
          COUNT(*)::text AS total_events,
          AVG(accuracy_score)::text AS avg_accuracy,
          COUNT(*) FILTER (WHERE feedback_type = 'positive')::text AS positive_count,
          COUNT(*) FILTER (WHERE feedback_type = 'negative')::text AS negative_count,
          COUNT(*) FILTER (WHERE feedback_type = 'correction')::text AS correction_count
        FROM routing_feedback_events
      `),
      // Feedback type distribution
      db.execute<{ feedback_type: string; count: string }>(sql`
        SELECT feedback_type, COUNT(*)::text AS count
        FROM routing_feedback_events
        GROUP BY feedback_type
        ORDER BY count DESC
      `),
      // Accuracy trend: daily avg over last 30 days
      db.execute<{ day: string; avg_accuracy: string | null; event_count: string }>(sql`
        SELECT
          DATE_TRUNC('day', created_at)::text AS day,
          AVG(accuracy_score)::text AS avg_accuracy,
          COUNT(*)::text AS event_count
        FROM routing_feedback_events
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day ASC
      `),
    ]);

    const summary = summaryRows.rows[0] ?? {
      total_events: '0',
      avg_accuracy: null,
      positive_count: '0',
      negative_count: '0',
      correction_count: '0',
    };

    return res.json({
      events: recentRows.rows,
      summary: {
        totalEvents: Number(summary.total_events),
        avgAccuracy: summary.avg_accuracy !== null ? Number(summary.avg_accuracy) : null,
        positiveCount: Number(summary.positive_count),
        negativeCount: Number(summary.negative_count),
        correctionCount: Number(summary.correction_count),
      },
      distribution: distributionRows.rows.map((r) => ({
        feedbackType: r.feedback_type,
        count: Number(r.count),
      })),
      accuracyTrend: trendRows.rows.map((r) => ({
        day: r.day,
        avgAccuracy: r.avg_accuracy !== null ? Number(r.avg_accuracy) : null,
        eventCount: Number(r.event_count),
      })),
    });
  } catch (error) {
    console.error('[routing-feedback] Error fetching routing feedback:', error);
    return res.status(500).json({ error: 'Failed to fetch routing feedback' });
  }
});

export default router;
