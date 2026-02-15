/**
 * Injection Effectiveness Data Source
 *
 * Fetches effectiveness metrics from API with graceful fallback to mock data.
 * Follows the same API-first + mock-fallback pattern as ValidationSource.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
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
  fallbackToMock?: boolean;
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

  /** Returns true if the summary response has no meaningful data (empty tables). */
  private isSummaryEmpty(data: EffectivenessSummary): boolean {
    return data.total_sessions === 0;
  }

  async summary(options: EffectivenessFetchOptions = {}): Promise<EffectivenessSummary> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (fallbackToMock && this.isSummaryEmpty(data)) {
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
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/throttle`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
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
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/latency`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // Fall back to mock if response is valid but has no real data
      if (fallbackToMock && (!data.breakdowns || data.breakdowns.length === 0)) {
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
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/utilization`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // Fall back to mock if response is valid but has no real data
      if (fallbackToMock && (!data.histogram || data.histogram.length === 0)) {
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
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/ab`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // Fall back to mock if response is valid but has no real data
      if (fallbackToMock && (!data.cohorts || data.cohorts.length === 0)) {
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
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
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
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/trend?days=${days ?? 14}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // Fall back to mock if response is valid but has no real data
      if (fallbackToMock && (!Array.isArray(data) || data.length === 0)) {
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
