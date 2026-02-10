/**
 * Shared EventBusPayload type (OMN-2095)
 *
 * Single source of truth for the event-bus projection snapshot payload.
 * Used by both server (EventBusProjection.getSnapshot) and client
 * (event-bus-projection-source fetcher).
 */

/**
 * Event shape within the projection snapshot.
 * Mirrors ProjectionEvent but defined here to avoid importing server modules.
 */
export interface EventBusSnapshotEvent {
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
