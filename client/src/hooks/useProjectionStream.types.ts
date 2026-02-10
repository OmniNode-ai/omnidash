/**
 * Shared types for useProjectionStream hook (OMN-2095)
 *
 * These mirror the server-side ProjectionResponse type but are
 * defined here to avoid importing server modules into client code.
 */

/** Standardized response envelope from projection API */
export interface ProjectionResponse<T> {
  viewId: string;
  cursor: number;
  snapshotTimeMs: number;
  payload: T;
}

/** Response envelope for events-since queries */
export interface ProjectionEventsResponse {
  viewId: string;
  cursor: number;
  snapshotTimeMs: number;
  events: ProjectionEvent[];
}

/** Client-side mirror of the server ProjectionEvent */
export interface ProjectionEvent {
  id: string;
  eventTimeMs: number;
  ingestSeq: number;
  topic: string;
  type: string;
  source: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  payload: Record<string, unknown>;
  eventTimeMissing?: boolean;
  error?: { message: string; stack?: string };
}
