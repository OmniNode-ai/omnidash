/**
 * Context Enrichment Data Source (OMN-2280)
 *
 * Fetches enrichment metrics from the API.
 */

import type {
  EnrichmentSummary,
  EnrichmentByChannel,
  LatencyDistributionPoint,
  TokenSavingsTrendPoint,
  SimilarityQualityPoint,
  InflationAlert,
  EnrichmentTimeWindow,
} from '@shared/enrichment-types';
import { buildApiUrl } from '@/lib/data-sources/api-base';

class EnrichmentSource {
  private baseUrl = buildApiUrl('/api/enrichment');

  private buildWindowParam(window: EnrichmentTimeWindow): string {
    return `?window=${encodeURIComponent(window)}`;
  }

  async summary(window: EnrichmentTimeWindow = '7d'): Promise<EnrichmentSummary> {
    const response = await fetch(`${this.baseUrl}/summary${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async byChannel(window: EnrichmentTimeWindow = '7d'): Promise<EnrichmentByChannel[]> {
    const response = await fetch(`${this.baseUrl}/by-channel${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async latencyDistribution(
    window: EnrichmentTimeWindow = '7d'
  ): Promise<LatencyDistributionPoint[]> {
    const response = await fetch(
      `${this.baseUrl}/latency-distribution${this.buildWindowParam(window)}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async tokenSavings(window: EnrichmentTimeWindow = '7d'): Promise<TokenSavingsTrendPoint[]> {
    const response = await fetch(`${this.baseUrl}/token-savings${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async similarityQuality(window: EnrichmentTimeWindow = '7d'): Promise<SimilarityQualityPoint[]> {
    const response = await fetch(
      `${this.baseUrl}/similarity-quality${this.buildWindowParam(window)}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async inflationAlerts(window: EnrichmentTimeWindow = '7d'): Promise<InflationAlert[]> {
    const response = await fetch(
      `${this.baseUrl}/inflation-alerts${this.buildWindowParam(window)}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

/** Singleton data source instance shared across components. */
export const enrichmentSource = new EnrichmentSource();
