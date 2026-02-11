/**
 * Shared Projection Types (OMN-2095)
 *
 * Single source of truth for projection response envelopes.
 * Used by both server (ProjectionService) and client (useProjectionStream).
 */

/**
 * Standardized response envelope for view snapshots.
 *
 * @template T - The payload type specific to each view
 */
export interface ProjectionResponse<T> {
  viewId: string;
  /** Cursor: max(ingestSeq) in the current snapshot */
  cursor: number;
  /** Timestamp when snapshot was captured */
  snapshotTimeMs: number;
  payload: T;
}
