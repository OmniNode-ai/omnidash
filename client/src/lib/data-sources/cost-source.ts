/**
 * Cost Trend Data Source (OMN-2242)
 *
 * Fetches cost/token metrics from API with graceful fallback to mock data.
 * Follows the same API-first + mock-fallback pattern as baselines-source.
 */

import type {
  CostSummary,
  CostTrendPoint,
  CostByModel,
  CostByRepo,
  CostByPattern,
  TokenUsagePoint,
  BudgetAlert,
  CostTimeWindow,
} from '@shared/cost-types';
import {
  getMockCostSummary,
  getMockCostTrend,
  getMockCostByModel,
  getMockCostByRepo,
  getMockCostByPattern,
  getMockTokenUsage,
  getMockBudgetAlerts,
} from '@/lib/mock-data/cost-mock';
import { buildApiUrl } from './api-base';

export interface CostFetchOptions {
  /** Fall back to mock data on network/HTTP errors (default: true). */
  fallbackToMock?: boolean;
  /** Also fall back to mock when the API returns empty results (default: false). */
  mockOnEmpty?: boolean;
  /** Include estimated data (default: false -- API-reported only). */
  includeEstimated?: boolean;
}

class CostSource {
  private baseUrl = buildApiUrl('/api/costs');
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

  private buildParams(window: CostTimeWindow, includeEstimated?: boolean): string {
    const params = new URLSearchParams({ window });
    if (includeEstimated) params.set('includeEstimated', 'true');
    return params.toString();
  }

  async summary(
    window: CostTimeWindow = '7d',
    options: CostFetchOptions = {}
  ): Promise<CostSummary> {
    const { fallbackToMock = true, mockOnEmpty = false, includeEstimated } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/summary?${this.buildParams(window, includeEstimated)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && data.total_tokens === 0) {
        this.markMock('summary');
        return getMockCostSummary(window);
      }
      this.markReal('summary');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[CostSource] API unavailable for summary, using demo data');
        this.markMock('summary');
        return getMockCostSummary(window);
      }
      throw new Error('Failed to fetch cost summary');
    }
  }

  async trend(
    window: CostTimeWindow = '7d',
    options: CostFetchOptions = {}
  ): Promise<CostTrendPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false, includeEstimated } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/trend?${this.buildParams(window, includeEstimated)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('trend');
        return getMockCostTrend(window);
      }
      this.markReal('trend');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[CostSource] API unavailable for trend, using demo data');
        this.markMock('trend');
        return getMockCostTrend(window);
      }
      throw new Error('Failed to fetch cost trend');
    }
  }

  async byModel(options: CostFetchOptions = {}): Promise<CostByModel[]> {
    const { fallbackToMock = true, mockOnEmpty = false, includeEstimated } = options;
    try {
      const params = includeEstimated ? '?includeEstimated=true' : '';
      const response = await fetch(`${this.baseUrl}/by-model${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('by-model');
        return getMockCostByModel();
      }
      this.markReal('by-model');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[CostSource] API unavailable for by-model, using demo data');
        this.markMock('by-model');
        return getMockCostByModel();
      }
      throw new Error('Failed to fetch cost by model');
    }
  }

  async byRepo(options: CostFetchOptions = {}): Promise<CostByRepo[]> {
    const { fallbackToMock = true, mockOnEmpty = false, includeEstimated } = options;
    try {
      const params = includeEstimated ? '?includeEstimated=true' : '';
      const response = await fetch(`${this.baseUrl}/by-repo${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('by-repo');
        return getMockCostByRepo();
      }
      this.markReal('by-repo');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[CostSource] API unavailable for by-repo, using demo data');
        this.markMock('by-repo');
        return getMockCostByRepo();
      }
      throw new Error('Failed to fetch cost by repo');
    }
  }

  async byPattern(options: CostFetchOptions = {}): Promise<CostByPattern[]> {
    const { fallbackToMock = true, mockOnEmpty = false, includeEstimated } = options;
    try {
      const params = includeEstimated ? '?includeEstimated=true' : '';
      const response = await fetch(`${this.baseUrl}/by-pattern${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('by-pattern');
        return getMockCostByPattern();
      }
      this.markReal('by-pattern');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[CostSource] API unavailable for by-pattern, using demo data');
        this.markMock('by-pattern');
        return getMockCostByPattern();
      }
      throw new Error('Failed to fetch cost by pattern');
    }
  }

  async tokenUsage(
    window: CostTimeWindow = '7d',
    options: CostFetchOptions = {}
  ): Promise<TokenUsagePoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false, includeEstimated } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/token-usage?${this.buildParams(window, includeEstimated)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('token-usage');
        return getMockTokenUsage(window);
      }
      this.markReal('token-usage');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[CostSource] API unavailable for token-usage, using demo data');
        this.markMock('token-usage');
        return getMockTokenUsage(window);
      }
      throw new Error('Failed to fetch token usage');
    }
  }

  async alerts(options: CostFetchOptions = {}): Promise<BudgetAlert[]> {
    const { fallbackToMock = true, mockOnEmpty = false } = options;
    try {
      const response = await fetch(`${this.baseUrl}/alerts`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('alerts');
        return getMockBudgetAlerts();
      }
      this.markReal('alerts');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[CostSource] API unavailable for alerts, using demo data');
        this.markMock('alerts');
        return getMockBudgetAlerts();
      }
      throw new Error('Failed to fetch budget alerts');
    }
  }
}

export const costSource = new CostSource();
