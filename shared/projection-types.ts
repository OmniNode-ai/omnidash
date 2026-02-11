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
// Generic snapshot envelope (wire format)
// ============================================================================

/**
 * Standardized response envelope for projection view snapshots.
 * Used by both server (ProjectionResponse) and client (useProjectionStream).
 *
 * @template T - The payload type specific to each view
 */
export interface ProjectionSnapshot<T> {
  viewId: string;
  /** Cursor: max(ingestSeq) in the current snapshot */
  cursor: number;
  /** Timestamp when snapshot was captured */
  snapshotTimeMs: number;
  payload: T;
}

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
 *
 * Each item in `recentIntents` carries an intent-specific `payload` with
 * expected fields: `intent_category` (string), `confidence` (number 0-1),
 * `session_ref` (string), `keywords` (string[]). See `IntentRecordPayload`
 * in `shared/intent-types.ts` for the canonical intent payload schema.
 */
export interface IntentProjectionPayload {
  recentIntents: ProjectionEventItem[];
  distribution: IntentDistributionEntry[];
  totalIntents: number;
  categoryCount: number;
  lastEventTimeMs: number | null;
}
