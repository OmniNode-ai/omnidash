/**
 * Context Enrichment Data Source (OMN-2280)
 *
 * Fetches enrichment metrics from the API with graceful fallback to mock data.
 * Follows the same API-first + mock-fallback pattern as enforcement-source.ts.
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
import {
  getMockEnrichmentSummary,
  getMockEnrichmentByChannel,
  getMockLatencyDistribution,
  getMockTokenSavingsTrend,
  getMockSimilarityQuality,
  getMockInflationAlerts,
} from '@/lib/mock-data/enrichment-mock';
import { buildApiUrl } from './api-base';

export interface EnrichmentFetchOptions {
  /** Fall back to mock data on network/HTTP errors (default: true). */
  fallbackToMock?: boolean;
  /** Also fall back to mock when the API returns empty results (default: false). */
  mockOnEmpty?: boolean;
}

/**
 * Client-side data source for all enrichment dashboard endpoints.
 *
 * Each method attempts the real API first and transparently falls back
 * to mock data when the API is unavailable or returns empty results.
 */
class EnrichmentSource {
  private baseUrl = buildApiUrl('/api/enrichment');
  private _mockEndpoints = new Set<string>();

  /**
   * True if any of the primary data endpoints fell back to mock data.
   *
   * Checks the three primary endpoints (summary, by-channel, token-savings)
   * so that an empty response from ANY of them triggers the demo-mode banner.
   */
  get isUsingMockData(): boolean {
    return (
      this._mockEndpoints.has('summary') ||
      this._mockEndpoints.has('by-channel') ||
      this._mockEndpoints.has('token-savings')
    );
  }

  private markReal(endpoint: string): void {
    this._mockEndpoints.delete(endpoint);
  }

  private markMock(endpoint: string): void {
    this._mockEndpoints.add(endpoint);
  }

  private buildWindowParam(window: EnrichmentTimeWindow): string {
    return `?window=${encodeURIComponent(window)}`;
  }

  /** Fetch aggregate enrichment summary metrics. */
  async summary(
    window: EnrichmentTimeWindow = '7d',
    options: EnrichmentFetchOptions = {}
  ): Promise<EnrichmentSummary> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/summary${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: EnrichmentSummary = await response.json();
      if (mockOnEmpty && data.total_enrichments === 0) {
        this.markMock('summary');
        return getMockEnrichmentSummary(window);
      }
      this.markReal('summary');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnrichmentSource] API unavailable for summary, using demo data');
        this.markMock('summary');
        return getMockEnrichmentSummary(window);
      }
      throw new Error('Failed to fetch enrichment summary');
    }
  }

  /** Fetch enrichment hit rate broken down by channel. */
  async byChannel(
    window: EnrichmentTimeWindow = '7d',
    options: EnrichmentFetchOptions = {}
  ): Promise<EnrichmentByChannel[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/by-channel${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: EnrichmentByChannel[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('by-channel');
        return getMockEnrichmentByChannel(window);
      }
      this.markReal('by-channel');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnrichmentSource] API unavailable for by-channel, using demo data');
        this.markMock('by-channel');
        return getMockEnrichmentByChannel(window);
      }
      throw new Error('Failed to fetch enrichment by channel');
    }
  }

  /** Fetch latency distribution per model. */
  async latencyDistribution(
    window: EnrichmentTimeWindow = '7d',
    options: EnrichmentFetchOptions = {}
  ): Promise<LatencyDistributionPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/latency-distribution${this.buildWindowParam(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LatencyDistributionPoint[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('latency-distribution');
        return getMockLatencyDistribution(window);
      }
      this.markReal('latency-distribution');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn(
          '[EnrichmentSource] API unavailable for latency-distribution, using demo data'
        );
        this.markMock('latency-distribution');
        return getMockLatencyDistribution(window);
      }
      throw new Error('Failed to fetch latency distribution');
    }
  }

  /** Fetch token savings trend over time. */
  async tokenSavings(
    window: EnrichmentTimeWindow = '7d',
    options: EnrichmentFetchOptions = {}
  ): Promise<TokenSavingsTrendPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/token-savings${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: TokenSavingsTrendPoint[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('token-savings');
        return getMockTokenSavingsTrend(window);
      }
      this.markReal('token-savings');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnrichmentSource] API unavailable for token-savings, using demo data');
        this.markMock('token-savings');
        return getMockTokenSavingsTrend(window);
      }
      throw new Error('Failed to fetch token savings trend');
    }
  }

  /** Fetch similarity search quality trend. */
  async similarityQuality(
    window: EnrichmentTimeWindow = '7d',
    options: EnrichmentFetchOptions = {}
  ): Promise<SimilarityQualityPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/similarity-quality${this.buildWindowParam(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: SimilarityQualityPoint[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('similarity-quality');
        return getMockSimilarityQuality(window);
      }
      this.markReal('similarity-quality');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnrichmentSource] API unavailable for similarity-quality, using demo data');
        this.markMock('similarity-quality');
        return getMockSimilarityQuality(window);
      }
      throw new Error('Failed to fetch similarity quality');
    }
  }

  /** Fetch recent context inflation alerts. */
  async inflationAlerts(
    window: EnrichmentTimeWindow = '7d',
    options: EnrichmentFetchOptions = {}
  ): Promise<InflationAlert[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/inflation-alerts${this.buildWindowParam(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: InflationAlert[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('inflation-alerts');
        return getMockInflationAlerts(window);
      }
      this.markReal('inflation-alerts');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnrichmentSource] API unavailable for inflation-alerts, using demo data');
        this.markMock('inflation-alerts');
        return getMockInflationAlerts(window);
      }
      throw new Error('Failed to fetch inflation alerts');
    }
  }
}

/** Singleton data source instance shared across components. */
export const enrichmentSource = new EnrichmentSource();
