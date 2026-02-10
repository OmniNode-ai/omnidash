/**
 * Shared projection types for client-side consumption (OMN-2097)
 *
 * Mirrors the server-side ProjectionResponse envelope shape.
 */

export interface ProjectionResponse<T> {
  viewId: string;
  cursor: number;
  snapshotTimeMs: number;
  payload: T;
}
