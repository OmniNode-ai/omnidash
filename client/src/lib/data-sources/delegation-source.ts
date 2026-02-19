/**
 * Delegation Data Source (OMN-2284)
 *
 * Fetches delegation metrics from the API with graceful fallback to mock data.
 * Follows the same API-first + mock-fallback pattern as llm-routing-source.ts
 * and enrichment-source.ts.
 */

import type {
  DelegationSummary,
  DelegationByTaskType,
  DelegationCostSavingsTrendPoint,
  DelegationQualityGatePoint,
  DelegationShadowDivergence,
  DelegationTrendPoint,
  DelegationTimeWindow,
} from '@shared/delegation-types';
import {
  getMockDelegationSummary,
  getMockDelegationByTaskType,
  getMockDelegationCostSavings,
  getMockDelegationQualityGates,
  getMockDelegationShadowDivergence,
  getMockDelegationTrend,
} from '@/lib/mock-data/delegation-mock';
import { buildApiUrl } from '@/lib/data-sources/api-base';

export interface DelegationFetchOptions {
  /** Fall back to mock data on network/HTTP errors (default: true). */
  fallbackToMock?: boolean;
  /** Also fall back to mock when the API returns empty results (default: false). */
  mockOnEmpty?: boolean;
  /**
   * When true, skip the API call entirely and return canned demo data.
   * Used when global demo mode is active (OMN-2298).
   */
  demoMode?: boolean;
}

/**
 * Client-side data source for all delegation dashboard endpoints.
 *
 * Each method attempts the real API first and transparently falls back
 * to mock data when the API is unavailable or returns empty results.
 */
class DelegationSource {
  private baseUrl = buildApiUrl('/api/delegation');
  // NOTE: This Set has a known race on parallel refetches — markReal/markMock calls may
  // interleave during concurrent window-change fetches. Acceptable for scaffold;
  // call clearMockState() before a window switch to avoid stale state.
  private _mockEndpoints = new Set<string>();

  /**
   * True if any of the primary data endpoints fell back to mock data.
   *
   * summary, by-task-type, and quality-gates are treated as "primary" signals
   * because they cover the three golden dimensions (delegation rate, quality gate
   * pass rate, cost savings). Other endpoints may legitimately return empty results.
   */
  get isUsingMockData(): boolean {
    return (
      this._mockEndpoints.has('summary') ||
      this._mockEndpoints.has('by-task-type') ||
      this._mockEndpoints.has('quality-gates')
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

  private buildWindowParam(window: DelegationTimeWindow): string {
    return `?window=${encodeURIComponent(window)}`;
  }

  /** Fetch aggregate summary metrics. */
  async summary(
    window: DelegationTimeWindow = '7d',
    options: DelegationFetchOptions = {}
  ): Promise<DelegationSummary> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('summary');
      return getMockDelegationSummary(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/summary${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: DelegationSummary = await response.json();
      if (data.total_delegations == null) {
        throw new Error('Malformed response: missing total_delegations');
      }
      if (mockOnEmpty && data.total_delegations === 0) {
        this.markMock('summary');
        return getMockDelegationSummary(window);
      }
      this.markReal('summary');
      return data;
    } catch (err) {
      console.warn('[DelegationSource] fetch failed for summary:', err);
      if (fallbackToMock) {
        this.markMock('summary');
        return getMockDelegationSummary(window);
      }
      throw new Error('Failed to fetch delegation summary');
    }
  }

  /** Fetch delegation breakdown by task type. */
  async byTaskType(
    window: DelegationTimeWindow = '7d',
    options: DelegationFetchOptions = {}
  ): Promise<DelegationByTaskType[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('by-task-type');
      return getMockDelegationByTaskType(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/by-task-type${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: DelegationByTaskType[] = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Malformed response: expected array');
      }
      if (mockOnEmpty && data.length === 0) {
        this.markMock('by-task-type');
        return getMockDelegationByTaskType(window);
      }
      this.markReal('by-task-type');
      return data;
    } catch (err) {
      console.warn('[DelegationSource] fetch failed for by-task-type:', err);
      if (fallbackToMock) {
        this.markMock('by-task-type');
        return getMockDelegationByTaskType(window);
      }
      throw new Error('Failed to fetch delegation by task type');
    }
  }

  /** Fetch cost savings trend over time. */
  async costSavings(
    window: DelegationTimeWindow = '7d',
    options: DelegationFetchOptions = {}
  ): Promise<DelegationCostSavingsTrendPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('cost-savings');
      return getMockDelegationCostSavings(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/cost-savings${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: DelegationCostSavingsTrendPoint[] = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Malformed response: expected array');
      }
      if (mockOnEmpty && data.length === 0) {
        this.markMock('cost-savings');
        return getMockDelegationCostSavings(window);
      }
      this.markReal('cost-savings');
      return data;
    } catch (err) {
      console.warn('[DelegationSource] fetch failed for cost-savings:', err);
      if (fallbackToMock) {
        this.markMock('cost-savings');
        return getMockDelegationCostSavings(window);
      }
      throw new Error('Failed to fetch delegation cost savings');
    }
  }

  /** Fetch quality gate pass/fail over time. */
  async qualityGates(
    window: DelegationTimeWindow = '7d',
    options: DelegationFetchOptions = {}
  ): Promise<DelegationQualityGatePoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('quality-gates');
      return getMockDelegationQualityGates(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/quality-gates${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: DelegationQualityGatePoint[] = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Malformed response: expected array');
      }
      if (mockOnEmpty && data.length === 0) {
        this.markMock('quality-gates');
        return getMockDelegationQualityGates(window);
      }
      this.markReal('quality-gates');
      return data;
    } catch (err) {
      console.warn('[DelegationSource] fetch failed for quality-gates:', err);
      if (fallbackToMock) {
        this.markMock('quality-gates');
        return getMockDelegationQualityGates(window);
      }
      throw new Error('Failed to fetch delegation quality gates');
    }
  }

  /** Fetch top shadow divergence pairs. */
  async shadowDivergence(
    window: DelegationTimeWindow = '7d',
    options: DelegationFetchOptions = {}
  ): Promise<DelegationShadowDivergence[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('shadow-divergence');
      return getMockDelegationShadowDivergence(window);
    }
    try {
      const response = await fetch(
        `${this.baseUrl}/shadow-divergence${this.buildWindowParam(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: DelegationShadowDivergence[] = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Malformed response: expected array');
      }
      if (mockOnEmpty && data.length === 0) {
        this.markMock('shadow-divergence');
        return getMockDelegationShadowDivergence(window);
      }
      this.markReal('shadow-divergence');
      return data;
    } catch (err) {
      console.warn('[DelegationSource] fetch failed for shadow-divergence:', err);
      if (fallbackToMock) {
        this.markMock('shadow-divergence');
        return getMockDelegationShadowDivergence(window);
      }
      throw new Error('Failed to fetch delegation shadow divergence');
    }
  }

  /** Fetch multi-metric delegation trend over time. */
  async trend(
    window: DelegationTimeWindow = '7d',
    options: DelegationFetchOptions = {}
  ): Promise<DelegationTrendPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('trend');
      return getMockDelegationTrend(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/trend${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: DelegationTrendPoint[] = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Malformed response: expected array');
      }
      if (mockOnEmpty && data.length === 0) {
        this.markMock('trend');
        return getMockDelegationTrend(window);
      }
      this.markReal('trend');
      return data;
    } catch (err) {
      console.warn('[DelegationSource] fetch failed for trend:', err);
      if (fallbackToMock) {
        this.markMock('trend');
        return getMockDelegationTrend(window);
      }
      throw new Error('Failed to fetch delegation trend');
    }
  }
}

/** Singleton data source instance shared across components. */
export const delegationSource = new DelegationSource();
