/**
 * PatternsProjection — DB-backed projection for pattern learning artifacts (OMN-2325)
 *
 * Encapsulates the COUNT(*) query from health-data-sources-routes.ts
 * (probePatterns) behind the ProjectionView interface. Routes call
 * getSnapshot() instead of executing SQL directly.
 *
 * Snapshot payload shape:
 *   { totalPatterns: number }
 */

import { sql } from 'drizzle-orm';
import { patternLearningArtifacts } from '@shared/intelligence-schema';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload type
// ============================================================================

export interface PatternsProjectionPayload {
  totalPatterns: number;
}

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class PatternsProjection extends DbBackedProjectionView<PatternsProjectionPayload> {
  readonly viewId = 'patterns';

  protected emptyPayload(): PatternsProjectionPayload {
    return { totalPatterns: 0 };
  }

  protected async querySnapshot(db: Db): Promise<PatternsProjectionPayload> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(patternLearningArtifacts);
    return { totalPatterns: result[0]?.count ?? 0 };
  }
}
