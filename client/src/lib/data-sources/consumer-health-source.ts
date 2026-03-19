/**
 * Consumer Health Data Source (OMN-5527)
 *
 * Fetches consumer health summaries and recent events from the API.
 * Used by the ConsumerHealthDashboard page.
 */

import { buildApiUrl } from './api-base';

export type ConsumerHealthWindow = '1h' | '24h' | '7d';

export type HealthStatus = 'green' | 'yellow' | 'red';

export interface ConsumerHealthSummaryItem {
  consumerIdentity: string;
  consumerGroup: string;
  topic: string;
  status: HealthStatus;
  lastEventType: string;
  lastSeverity: string;
  lastEventAt: string;
  eventCount: number;
}

export interface ConsumerHealthRecentEvent {
  id: string;
  consumerIdentity: string;
  consumerGroup: string;
  topic: string;
  eventType: string;
  severity: string;
  errorMessage: string;
  hostname: string;
  serviceLabel: string;
  emittedAt: string;
}

export interface ConsumerHealthSummary {
  consumers: ConsumerHealthSummaryItem[];
  severityCounts: { info: number; warning: number; error: number; critical: number };
  totalEvents: number;
  window: ConsumerHealthWindow;
}

export interface ConsumerHealthEvents {
  events: ConsumerHealthRecentEvent[];
  window: ConsumerHealthWindow;
}

class ConsumerHealthSource {
  private baseUrl = buildApiUrl('/api/consumer-health');

  async summary(window: ConsumerHealthWindow = '24h'): Promise<ConsumerHealthSummary> {
    const response = await fetch(`${this.baseUrl}/summary?window=${window}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async events(window: ConsumerHealthWindow = '24h'): Promise<ConsumerHealthEvents> {
    const response = await fetch(`${this.baseUrl}/events?window=${window}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

export const consumerHealthSource = new ConsumerHealthSource();
