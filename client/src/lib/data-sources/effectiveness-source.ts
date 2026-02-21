/**
 * Injection Effectiveness Data Source
 *
 * Fetches effectiveness metrics from API with graceful fallback to mock data.
 * Follows the same API-first + mock-fallback pattern as ValidationSource.
 *
 * OMN-2330: Remove automatic empty-data mock fallback. Tables are now populated
 * by the InjectionEffectivenessConsumer (OMN-2303). The `fallbackToMock` flag
 * now only governs network/HTTP errors. Use `mockOnEmpty: true` explicitly
 * (e.g. in demo contexts) to restore the old behaviour of falling back when
 * the API returns zero-row / empty responses.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 * @see OMN-2330 - Remove mock fallback, serve real data
 */

import type {
  EffectivenessSummary,
  ThrottleStatus,
  LatencyDetails,
  UtilizationDetails,
  ABComparison,
  EffectivenessTrendPoint,
  SessionDetail,
} from '@shared/effectiveness-types';
import {
  getMockSummary,
  getMockThrottleStatus,
  getMockLatencyDetails,
  getMockUtilizationDetails,
  getMockABComparison,
  getMockEffectivenessTrend,
  getMockSessionDetail,
} from '@/lib/mock-data/effectiveness-mock';

export interface EffectivenessFetchOptions {
  /** Fall back to mock data on network/HTTP errors (default: false). */
  fallbackToMock?: boolean;
  /**
   * Also fall back to mock when the API returns empty results (default: false).
   *
   * Set to `true` only for explicit demo scenarios. Real-data mode should show
   * genuine empty state so operators know the tables are actually empty rather
   * than masked by canned data. This flag was previously implicit in
   * `fallbackToMock`; it is now separated to prevent mock data from hiding real
   * empty tables after OMN-2303 populated the database (OMN-2330).
   */
  mockOnEmpty?: boolean;
  /**
   * When true, skip the API call entirely and return canned demo data.
   * Used when global demo mode is active (OMN-2298).
   */
  demoMode?: boolean;
}

class EffectivenessSource {
  private baseUrl = '/api/effectiveness';
  private _mockEndpoints = new Set<string>();

  /** True if any endpoint fell back to mock data */
  get isUsingMockData(): boolean {
    return this._mockEndpoints.size > 0;
  }

  private markReal(endpoint: string): void {
    this._mockEndpoints.delete(endpoint);
  }

  private markMock(endpoint: string): void {
    this._mockEndpoints.add(endpoint);
  }

  async summary(options: EffectivenessFetchOptions = {}): Promise<EffectivenessSummary> {
    const { fallbackToMock = false, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('summary');
      return getMockSummary();
    }
    try {
      const response = await fetch(`${this.baseUrl}/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: EffectivenessSummary = await response.json();
      if (mockOnEmpty && data.total_sessions === 0) {
        this.markMock('summary');
        return getMockSummary();
      }
      this.markReal('summary');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for summary, using demo data');
        this.markMock('summary');
        return getMockSummary();
      }
      throw error;
    }
  }

  async throttleStatus(options: EffectivenessFetchOptions = {}): Promise<ThrottleStatus> {
    const { fallbackToMock = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('throttle');
      return getMockThrottleStatus();
    }
    try {
      const response = await fetch(`${this.baseUrl}/throttle`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ThrottleStatus = await response.json();
      this.markReal('throttle');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for throttle, using demo data');
        this.markMock('throttle');
        return getMockThrottleStatus();
      }
      throw error;
    }
  }

  async latencyDetails(options: EffectivenessFetchOptions = {}): Promise<LatencyDetails> {
    const { fallbackToMock = false, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('latency');
      return getMockLatencyDetails();
    }
    try {
      const response = await fetch(`${this.baseUrl}/latency`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LatencyDetails = await response.json();
      if (mockOnEmpty && (!data.breakdowns || data.breakdowns.length === 0)) {
        this.markMock('latency');
        return getMockLatencyDetails();
      }
      this.markReal('latency');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for latency, using demo data');
        this.markMock('latency');
        return getMockLatencyDetails();
      }
      throw error;
    }
  }

  async utilizationDetails(options: EffectivenessFetchOptions = {}): Promise<UtilizationDetails> {
    const { fallbackToMock = false, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('utilization');
      return getMockUtilizationDetails();
    }
    try {
      const response = await fetch(`${this.baseUrl}/utilization`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: UtilizationDetails = await response.json();
      if (mockOnEmpty && (!data.histogram || data.histogram.length === 0)) {
        this.markMock('utilization');
        return getMockUtilizationDetails();
      }
      this.markReal('utilization');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for utilization, using demo data');
        this.markMock('utilization');
        return getMockUtilizationDetails();
      }
      throw error;
    }
  }

  async abComparison(options: EffectivenessFetchOptions = {}): Promise<ABComparison> {
    const { fallbackToMock = false, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('ab');
      return getMockABComparison();
    }
    try {
      const response = await fetch(`${this.baseUrl}/ab`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ABComparison = await response.json();
      if (mockOnEmpty && (!data.cohorts || data.cohorts.length === 0)) {
        this.markMock('ab');
        return getMockABComparison();
      }
      this.markReal('ab');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for A/B, using demo data');
        this.markMock('ab');
        return getMockABComparison();
      }
      throw error;
    }
  }

  async sessionDetail(
    sessionId: string,
    options: EffectivenessFetchOptions = {}
  ): Promise<SessionDetail> {
    const { fallbackToMock = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('session');
      return getMockSessionDetail(sessionId);
    }
    try {
      const response = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: SessionDetail = await response.json();
      this.markReal('session');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for session detail, using demo data');
        this.markMock('session');
        return getMockSessionDetail(sessionId);
      }
      throw error;
    }
  }

  async trend(
    days?: number,
    options: EffectivenessFetchOptions = {}
  ): Promise<EffectivenessTrendPoint[]> {
    const { fallbackToMock = false, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('trend');
      return getMockEffectivenessTrend();
    }
    try {
      const response = await fetch(`${this.baseUrl}/trend?days=${days ?? 14}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: EffectivenessTrendPoint[] = await response.json();
      if (!Array.isArray(data)) {
        console.warn('[EffectivenessSource] /trend response is not an array, returning empty');
        return [];
      }
      if (mockOnEmpty && data.length === 0) {
        this.markMock('trend');
        return getMockEffectivenessTrend();
      }
      this.markReal('trend');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for trend, using demo data');
        this.markMock('trend');
        return getMockEffectivenessTrend();
      }
      throw error;
    }
  }
}

export const effectivenessSource = new EffectivenessSource();
