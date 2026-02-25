/**
 * ValidationProjection — DB-backed projection for validation runs (OMN-2325)
 *
 * Encapsulates the COUNT(*) query from health-data-sources-routes.ts
 * (probeValidation) behind the ProjectionView interface. Routes call
 * getSnapshot() instead of executing SQL directly.
 *
 * Snapshot payload shape:
 *   { totalRuns: number }
 */

import { sql } from 'drizzle-orm';
import { validationRuns } from '@shared/intelligence-schema';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload type
// ============================================================================

export interface ValidationProjectionPayload {
  totalRuns: number;
}

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class ValidationProjection extends DbBackedProjectionView<ValidationProjectionPayload> {
  readonly viewId = 'validation';

  protected emptyPayload(): ValidationProjectionPayload {
    return { totalRuns: 0 };
  }

  protected async querySnapshot(db: Db): Promise<ValidationProjectionPayload> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(validationRuns);
    return { totalRuns: result[0]?.count ?? 0 };
  }
}
