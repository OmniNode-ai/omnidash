/**
 * RoutingFeedbackProjection — DB-backed projection for routing feedback data (OMN-5284)
 *
 * Projects from: routing_feedback_events table (migration 0024_routing_feedback_events)
 *
 * Routes access this via routingFeedbackProjection.ensureFresh() — no direct DB imports
 * allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export interface RoutingFeedbackSummary {
  totalEvents: number;
  avgAccuracy: number | null;
  positiveCount: number;
  negativeCount: number;
  correctionCount: number;
}

export interface RoutingFeedbackDistribution {
  feedbackType: string;
  count: number;
}

export interface RoutingFeedbackTrendPoint {
  day: string;
  avgAccuracy: number | null;
  eventCount: number;
}

export interface RoutingFeedbackEvent {
  id: string;
  agent_id: string;
  feedback_type: string;
  original_route: string;
  corrected_route: string | null;
  accuracy_score: number | null;
  created_at: string;
}

export interface RoutingFeedbackPayload {
  events: RoutingFeedbackEvent[];
  summary: RoutingFeedbackSummary;
  distribution: RoutingFeedbackDistribution[];
  accuracyTrend: RoutingFeedbackTrendPoint[];
}

export class RoutingFeedbackProjection extends DbBackedProjectionView<RoutingFeedbackPayload> {
  readonly viewId = 'routing-feedback';

  protected emptyPayload(): RoutingFeedbackPayload {
    return {
      events: [],
      summary: {
        totalEvents: 0,
        avgAccuracy: null,
        positiveCount: 0,
        negativeCount: 0,
        correctionCount: 0,
      },
      distribution: [],
      accuracyTrend: [],
    };
  }

  protected async querySnapshot(db: Db): Promise<RoutingFeedbackPayload> {
    try {
      const [recentRows, summaryRows, distributionRows, trendRows] = await Promise.all([
        db.execute<Record<string, unknown>>(sql`
          SELECT id, agent_id, feedback_type, original_route, corrected_route,
                 accuracy_score, created_at
          FROM routing_feedback_events
          ORDER BY created_at DESC
          LIMIT 50
        `),
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
        db.execute<{ feedback_type: string; count: string }>(sql`
          SELECT feedback_type, COUNT(*)::text AS count
          FROM routing_feedback_events
          GROUP BY feedback_type
          ORDER BY count DESC
        `),
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

      return {
        events: recentRows.rows as unknown as RoutingFeedbackEvent[],
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
      };
    } catch (err) {
      // Graceful degrade: table may not exist yet (migration 0024 pending)
      const pgCode = (err as { code?: string }).code;
      if (pgCode === '42P01') {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
