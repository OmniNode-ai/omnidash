/**
 * Shared types for useProjectionStream hook (OMN-2095)
 *
 * ProjectionResponse<T> lives in @shared/projection-types (single source of
 * truth for both server and client). Projection-specific client types remain here.
 */

export type { ProjectionResponse } from '@shared/projection-types';

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
