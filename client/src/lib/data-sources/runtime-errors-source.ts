/**
 * Runtime Errors Data Source (OMN-5528)
 *
 * Fetches runtime error summaries and recent events from the API.
 * Used by the RuntimeErrorsDashboard page.
 */

import { buildApiUrl } from './api-base';

export type RuntimeErrorWindow = '1h' | '24h' | '7d';

export interface RuntimeErrorCategoryCounts {
  kafkaConsumer: number;
  kafkaProducer: number;
  database: number;
  httpClient: number;
  httpServer: number;
  runtime: number;
  unknown: number;
}

export interface RuntimeErrorTopFingerprint {
  fingerprint: string;
  messageTemplate: string;
  errorCategory: string;
  loggerFamily: string;
  occurrences: number;
  lastSeenAt: string;
}

export interface RuntimeErrorRecentEvent {
  id: string;
  loggerFamily: string;
  logLevel: string;
  messageTemplate: string;
  errorCategory: string;
  severity: string;
  fingerprint: string;
  exceptionType: string;
  exceptionMessage: string;
  hostname: string;
  serviceLabel: string;
  emittedAt: string;
}

export interface RuntimeErrorsSummary {
  categoryCounts: RuntimeErrorCategoryCounts;
  topFingerprints: RuntimeErrorTopFingerprint[];
  totalEvents: number;
  window: RuntimeErrorWindow;
}

export interface RuntimeErrorsEvents {
  events: RuntimeErrorRecentEvent[];
  window: RuntimeErrorWindow;
}

class RuntimeErrorsSource {
  private baseUrl = buildApiUrl('/api/runtime-errors');

  async summary(window: RuntimeErrorWindow = '24h'): Promise<RuntimeErrorsSummary> {
    const response = await fetch(`${this.baseUrl}/summary?window=${window}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async events(window: RuntimeErrorWindow = '24h'): Promise<RuntimeErrorsEvents> {
    const response = await fetch(`${this.baseUrl}/events?window=${window}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

export const runtimeErrorsSource = new RuntimeErrorsSource();
