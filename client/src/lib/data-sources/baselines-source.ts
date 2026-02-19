/**
 * Baselines & ROI Data Source (OMN-2156)
 *
 * Fetches baselines/ROI metrics from API with graceful fallback to mock data.
 * Follows the same API-first + mock-fallback pattern as effectiveness-source.
 */

import type {
  BaselinesSummary,
  PatternComparison,
  ROITrendPoint,
  RecommendationBreakdown,
} from '@shared/baselines-types';
import {
  getMockBaselinesSummary,
  getMockComparisons,
  getMockROITrend,
  getMockRecommendationBreakdown,
} from '@/lib/mock-data/baselines-mock';
import { buildApiUrl } from './api-base';

export interface BaselinesFetchOptions {
  /** Fall back to mock data on network/HTTP errors (default: true). */
  fallbackToMock?: boolean;
  /** Also fall back to mock when the API returns empty results (default: false). */
  mockOnEmpty?: boolean;
}

class BaselinesSource {
  private baseUrl = buildApiUrl('/api/baselines');
  private _mockEndpoints = new Set<string>();

  /** True if any endpoint fell back to mock data. */
  get isUsingMockData(): boolean {
    return this._mockEndpoints.size > 0;
  }

  private markReal(endpoint: string): void {
    this._mockEndpoints.delete(endpoint);
  }

  private markMock(endpoint: string): void {
    this._mockEndpoints.add(endpoint);
  }

  async summary(options: BaselinesFetchOptions = {}): Promise<BaselinesSummary> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && data.total_comparisons === 0) {
        this.markMock('summary');
        return getMockBaselinesSummary();
      }
      // Guard: older server versions may omit trend_point_count.  Ensure the
      // field is always a number so callers never silently receive `undefined`.
      if (typeof data.trend_point_count !== 'number') {
        data.trend_point_count = 0;
      }
      this.markReal('summary');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[BaselinesSource] API unavailable for summary, using demo data');
        this.markMock('summary');
        return getMockBaselinesSummary();
      }
      throw new Error('Failed to fetch baselines summary');
    }
  }

  async comparisons(options: BaselinesFetchOptions = {}): Promise<PatternComparison[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/comparisons`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('comparisons');
        return getMockComparisons();
      }
      this.markReal('comparisons');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[BaselinesSource] API unavailable for comparisons, using demo data');
        this.markMock('comparisons');
        return getMockComparisons();
      }
      throw new Error('Failed to fetch baselines comparisons');
    }
  }

  async trend(days?: number, options: BaselinesFetchOptions = {}): Promise<ROITrendPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/trend?days=${days ?? 14}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('trend');
        return getMockROITrend();
      }
      this.markReal('trend');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[BaselinesSource] API unavailable for trend, using demo data');
        this.markMock('trend');
        return getMockROITrend();
      }
      throw new Error('Failed to fetch baselines trend');
    }
  }

  async breakdown(options: BaselinesFetchOptions = {}): Promise<RecommendationBreakdown[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/breakdown`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('breakdown');
        return getMockRecommendationBreakdown();
      }
      this.markReal('breakdown');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[BaselinesSource] API unavailable for breakdown, using demo data');
        this.markMock('breakdown');
        return getMockRecommendationBreakdown();
      }
      throw new Error('Failed to fetch baselines breakdown');
    }
  }
}

export const baselinesSource = new BaselinesSource();
