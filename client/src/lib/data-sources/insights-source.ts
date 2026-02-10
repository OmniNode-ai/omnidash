/**
 * Learned Insights Data Source
 *
 * Fetches insights from OmniMemory API with graceful fallback to mock data.
 * Follows the API-first + mock-fallback pattern used across the codebase.
 *
 * @see OMN-1407 - Learned Insights Panel (OmniClaude Integration)
 */

import type { InsightsSummary, InsightsTrendPoint } from '@shared/insights-types';
import { getMockInsightsSummary, getMockInsightsTrend } from '@/lib/mock-data/insights-mock';

export interface InsightsFetchOptions {
  fallbackToMock?: boolean;
}

class InsightsSource {
  private baseUrl = '/api/insights';
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

  async summary(options: InsightsFetchOptions = {}): Promise<InsightsSummary> {
    const { fallbackToMock = true } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.baseUrl}/summary`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (fallbackToMock && (!Array.isArray(data.insights) || data.insights.length === 0)) {
        this.markMock('summary');
        return getMockInsightsSummary();
      }
      this.markReal('summary');
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (fallbackToMock) {
        console.warn('[InsightsSource] API unavailable for summary, using demo data');
        this.markMock('summary');
        return getMockInsightsSummary();
      }
      throw error;
    }
  }

  async trend(options: InsightsFetchOptions = {}): Promise<InsightsTrendPoint[]> {
    const { fallbackToMock = true } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.baseUrl}/trend`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (fallbackToMock && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('trend');
        return getMockInsightsTrend();
      }
      this.markReal('trend');
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (fallbackToMock) {
        console.warn('[InsightsSource] API unavailable for trend, using demo data');
        this.markMock('trend');
        return getMockInsightsTrend();
      }
      throw error;
    }
  }
}

export const insightsSource = new InsightsSource();
