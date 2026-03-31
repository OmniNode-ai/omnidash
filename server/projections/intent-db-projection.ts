/**
 * IntentDbProjection — DB-backed projection for intent signals (OMN-7129)
 *
 * Projects from: ReadModelConsumer intent stored handler (platform-projections.ts)
 * Source table:  intent_signals (populated by projectIntentStoredEvent)
 *
 * Snapshot payload shape:
 *   IntentProjectionPayload { recentIntents, distribution, totalIntents, categoryCount, lastEventTimeMs }
 *
 * Routes access this via intentDbProjection.ensureFresh()
 * — no direct DB imports allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';
import type {
  IntentProjectionPayload,
  IntentDistributionEntry,
  ProjectionEventItem,
} from '@shared/projection-types';

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

// ============================================================================
// Row types
// ============================================================================

interface IntentSignalRow {
  correlation_id: string;
  event_id: string;
  intent_type: string | null;
  topic: string;
  raw_payload: Record<string, unknown> | string | null;
  created_at: string | null;
}

// ============================================================================
// Projection
// ============================================================================

export class IntentDbProjection extends DbBackedProjectionView<IntentProjectionPayload> {
  readonly viewId = 'intent-db';

  protected emptyPayload(): IntentProjectionPayload {
    return {
      recentIntents: [],
      distribution: [],
      totalIntents: 0,
      categoryCount: 0,
      lastEventTimeMs: null,
    };
  }

  protected async querySnapshot(db: Db, limit = 100): Promise<IntentProjectionPayload> {
    try {
      const result = await db.execute(sql`
        SELECT
          correlation_id,
          event_id,
          intent_type,
          topic,
          raw_payload,
          created_at::text
        FROM intent_signals
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);

      const rows = (result.rows ?? []) as unknown as IntentSignalRow[];

      if (rows.length === 0) {
        return this.emptyPayload();
      }

      // Build recent intents as ProjectionEventItems
      const recentIntents: ProjectionEventItem[] = rows.map((row, idx) => {
        const payload =
          typeof row.raw_payload === 'string'
            ? (JSON.parse(row.raw_payload) as Record<string, unknown>)
            : (row.raw_payload ?? {});

        const eventTimeMs = row.created_at ? new Date(row.created_at).getTime() : Date.now();

        return {
          id: row.event_id || row.correlation_id,
          eventTimeMs,
          ingestSeq: idx,
          type: row.intent_type ?? 'unknown',
          topic: row.topic,
          source: 'omnimemory',
          severity: 'info' as const,
          payload,
        };
      });

      // Build distribution
      const categoryMap = new Map<string, number>();
      for (const row of rows) {
        const category = row.intent_type ?? 'unknown';
        categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1);
      }

      const totalIntents = rows.length;
      const distribution: IntentDistributionEntry[] = Array.from(categoryMap.entries()).map(
        ([category, count]) => ({
          category,
          count,
          percentage: totalIntents > 0 ? count / totalIntents : 0,
        })
      );

      const lastEventTimeMs = recentIntents.length > 0 ? recentIntents[0].eventTimeMs : null;

      return {
        recentIntents,
        distribution,
        totalIntents,
        categoryCount: categoryMap.size,
        lastEventTimeMs,
      };
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('intent_signals') && msg.includes('does not exist'))
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
