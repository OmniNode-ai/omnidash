/**
 * Shared EventBusPayload type (OMN-2095)
 *
 * Single source of truth for the event-bus projection snapshot payload.
 * Used by both server (EventBusProjection.getSnapshot) and client
 * (event-bus-projection-source fetcher).
 */

import type { ProjectionEvent } from './projection-types';

/** Time-series bucket width used by both server and client for chart alignment */
export const TIME_SERIES_BUCKET_MS = 15_000; // 15 seconds

/**
 * Event shape within the projection snapshot.
 * Alias of ProjectionEvent from shared/projection-types (single source of truth).
 */
export type EventBusSnapshotEvent = ProjectionEvent;

/**
 * Snapshot payload returned by the event-bus projection.
 * All aggregates are pre-computed server-side — no O(n) scans on read.
 */
export interface EventBusPayload {
  events: EventBusSnapshotEvent[];
  topicBreakdown: Record<string, number>;
  eventTypeBreakdown: Record<string, number>;
  timeSeries: Array<{ bucketKey: number; count: number }>;
  eventsPerSecond: number;
  errorCount: number;
  activeTopics: number;
  totalEventsIngested: number;
}
