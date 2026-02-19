/**
 * LLM Routing Data Source (OMN-2279)
 *
 * Fetches LLM routing effectiveness metrics from the API with graceful
 * fallback to mock data.  Follows the same API-first + mock-fallback pattern
 * as enforcement-source.ts and enrichment-source.ts.
 */

import type {
  LlmRoutingSummary,
  LlmRoutingLatencyPoint,
  LlmRoutingByVersion,
  LlmRoutingDisagreement,
  LlmRoutingTrendPoint,
  LlmRoutingTimeWindow,
} from '@shared/llm-routing-types';
import {
  getMockLlmRoutingSummary,
  getMockLlmRoutingLatency,
  getMockLlmRoutingByVersion,
  getMockLlmRoutingDisagreements,
  getMockLlmRoutingTrend,
} from '@/lib/mock-data/llm-routing-mock';
import { buildApiUrl } from '@/lib/data-sources/api-base';

export interface LlmRoutingFetchOptions {
  /** Fall back to mock data on network/HTTP errors (default: true). */
  fallbackToMock?: boolean;
  /** Also fall back to mock when the API returns empty results (default: false). */
  mockOnEmpty?: boolean;
}

/**
 * Client-side data source for all LLM routing dashboard endpoints.
 *
 * Each method attempts the real API first and transparently falls back
 * to mock data when the API is unavailable or returns empty results.
 */
class LlmRoutingSource {
  private baseUrl = buildApiUrl('/api/llm-routing');
  private _mockEndpoints = new Set<string>();

  /**
   * True if any of the primary data endpoints fell back to mock data.
   *
   * Only summary, latency, and by-version are treated as "primary" signals
   * because they cover the three golden dimensions (agreement rate, latency
   * distribution, longitudinal comparison).  Disagreements and trend may
   * legitimately be empty early on.
   */
  get isUsingMockData(): boolean {
    return (
      this._mockEndpoints.has('summary') ||
      this._mockEndpoints.has('latency') ||
      this._mockEndpoints.has('by-version')
    );
  }

  /** Clear all mock-endpoint tracking state. Call before a time-window switch. */
  clearMockState(): void {
    this._mockEndpoints.clear();
  }

  private markReal(endpoint: string): void {
    this._mockEndpoints.delete(endpoint);
  }

  private markMock(endpoint: string): void {
    this._mockEndpoints.add(endpoint);
  }

  private buildWindowParam(window: LlmRoutingTimeWindow): string {
    return `?window=${encodeURIComponent(window)}`;
  }

  /** Fetch aggregate summary metrics. */
  async summary(
    window: LlmRoutingTimeWindow = '7d',
    options: LlmRoutingFetchOptions = {}
  ): Promise<LlmRoutingSummary> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/summary${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LlmRoutingSummary = await response.json();
      if (mockOnEmpty && data.total_decisions === 0) {
        this.markMock('summary');
        return getMockLlmRoutingSummary(window);
      }
      this.markReal('summary');
      return data;
    } catch (err) {
      console.warn('[LlmRoutingSource] fetch failed for summary:', err);
      if (fallbackToMock) {
        this.markMock('summary');
        return getMockLlmRoutingSummary(window);
      }
      throw new Error('Failed to fetch LLM routing summary');
    }
  }

  /** Fetch latency distribution per routing method. */
  async latency(
    window: LlmRoutingTimeWindow = '7d',
    options: LlmRoutingFetchOptions = {}
  ): Promise<LlmRoutingLatencyPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/latency${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LlmRoutingLatencyPoint[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('latency');
        return getMockLlmRoutingLatency(window);
      }
      this.markReal('latency');
      return data;
    } catch (err) {
      console.warn('[LlmRoutingSource] fetch failed for latency:', err);
      if (fallbackToMock) {
        this.markMock('latency');
        return getMockLlmRoutingLatency(window);
      }
      throw new Error('Failed to fetch LLM routing latency');
    }
  }

  /** Fetch agreement rate comparison by prompt version. */
  async byVersion(
    window: LlmRoutingTimeWindow = '7d',
    options: LlmRoutingFetchOptions = {}
  ): Promise<LlmRoutingByVersion[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/by-version${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LlmRoutingByVersion[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('by-version');
        return getMockLlmRoutingByVersion(window);
      }
      this.markReal('by-version');
      return data;
    } catch (err) {
      console.warn('[LlmRoutingSource] fetch failed for by-version:', err);
      if (fallbackToMock) {
        this.markMock('by-version');
        return getMockLlmRoutingByVersion(window);
      }
      throw new Error('Failed to fetch LLM routing by version');
    }
  }

  /** Fetch top LLM vs fuzzy disagreement pairs. */
  async disagreements(
    window: LlmRoutingTimeWindow = '7d',
    options: LlmRoutingFetchOptions = {}
  ): Promise<LlmRoutingDisagreement[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/disagreements${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LlmRoutingDisagreement[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('disagreements');
        return getMockLlmRoutingDisagreements(window);
      }
      this.markReal('disagreements');
      return data;
    } catch (err) {
      console.warn('[LlmRoutingSource] fetch failed for disagreements:', err);
      if (fallbackToMock) {
        this.markMock('disagreements');
        return getMockLlmRoutingDisagreements(window);
      }
      throw new Error('Failed to fetch LLM routing disagreements');
    }
  }

  /** Fetch multi-metric trend over time. */
  async trend(
    window: LlmRoutingTimeWindow = '7d',
    options: LlmRoutingFetchOptions = {}
  ): Promise<LlmRoutingTrendPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/trend${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LlmRoutingTrendPoint[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('trend');
        return getMockLlmRoutingTrend(window);
      }
      this.markReal('trend');
      return data;
    } catch (err) {
      console.warn('[LlmRoutingSource] fetch failed for trend:', err);
      if (fallbackToMock) {
        this.markMock('trend');
        return getMockLlmRoutingTrend(window);
      }
      throw new Error('Failed to fetch LLM routing trend');
    }
  }
}

/** Singleton data source instance shared across components. */
export const llmRoutingSource = new LlmRoutingSource();
