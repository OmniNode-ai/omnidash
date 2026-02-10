/**
 * Event Bus Projection Data Source (OMN-2095)
 *
 * Fetcher functions for the server-side event-bus projection.
 * Used by useProjectionStream to retrieve snapshot data.
 */

import type { ProjectionResponse } from '@/hooks/useProjectionStream.types';

/**
 * Snapshot payload from the event-bus projection.
 * SYNC: Must match server/projections/event-bus-projection.ts → EventBusPayload
 */
export interface EventBusPayload {
  events: Array<{
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
  }>;
  topicBreakdown: Record<string, number>;
  eventTypeBreakdown: Record<string, number>;
  timeSeries: Array<{ bucketKey: number; count: number }>;
  eventsPerSecond: number;
  errorCount: number;
  activeTopics: number;
  totalEventsIngested: number;
}

/**
 * Fetch event-bus projection snapshot from the server.
 */
export async function fetchEventBusSnapshot(params?: {
  limit?: number;
}): Promise<ProjectionResponse<EventBusPayload>> {
  const queryParams = new URLSearchParams();
  if (params?.limit != null) {
    queryParams.set('limit', String(params.limit));
  }

  const url = `/api/projections/event-bus/snapshot${queryParams.toString() ? `?${queryParams}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch event-bus projection: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}
