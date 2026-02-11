/**
 * Shared Projection Types (OMN-2096)
 *
 * Wire-format contracts for server-side projection snapshots consumed by
 * client components. These types define the JSON shape that crosses HTTP
 * between projection-routes.ts (server) and useProjectionStream.ts (client).
 *
 * Server-side ProjectionEvent (which has stricter severity union and optional
 * error/eventTimeMissing) is structurally assignable to ProjectionEventItem,
 * so the server can use these types directly.
 */

// ============================================================================
// Generic projection event item (wire format)
// ============================================================================

/**
 * A projection event as serialized in snapshot JSON payloads.
 * Subset of the server-side ProjectionEvent — only fields that
 * cross the wire to the client.
 */
export interface ProjectionEventItem {
  id: string;
  eventTimeMs: number;
  ingestSeq: number;
  type: string;
  topic: string;
  source: string;
  severity: string;
  payload: Record<string, unknown>;
}

// ============================================================================
// Intent projection payload
// ============================================================================

/**
 * Distribution entry for intent category statistics.
 */
export interface IntentDistributionEntry {
  category: string;
  count: number;
  percentage: number;
}

/**
 * Intent projection snapshot payload.
 * Returned by GET /api/projections/intent/snapshot.
 */
export interface IntentProjectionPayload {
  recentIntents: ProjectionEventItem[];
  distribution: IntentDistributionEntry[];
  totalIntents: number;
  categoryCount: number;
  lastEventTimeMs: number | null;
}
