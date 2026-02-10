/**
 * Event Bus Projection Data Source (OMN-2095)
 *
 * Fetcher functions for the server-side event-bus projection.
 * Used by useProjectionStream to retrieve snapshot data.
 */

import type { ProjectionResponse } from '@/hooks/useProjectionStream.types';
import type { EventBusPayload } from '@shared/event-bus-payload';

export type { EventBusPayload };

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
