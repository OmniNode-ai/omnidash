/**
 * Pattern Enforcement Data Source (OMN-2275)
 *
 * Fetches enforcement metrics from the API with graceful fallback to mock data.
 * Follows the same API-first + mock-fallback pattern as cost-source.ts.
 */

import type {
  EnforcementSummary,
  EnforcementByLanguage,
  EnforcementByDomain,
  ViolatedPattern,
  EnforcementTrendPoint,
  EnforcementTimeWindow,
} from '@shared/enforcement-types';
import {
  getMockEnforcementSummary,
  getMockEnforcementByLanguage,
  getMockEnforcementByDomain,
  getMockViolatedPatterns,
  getMockEnforcementTrend,
} from '@/lib/mock-data/enforcement-mock';
import { buildApiUrl } from './api-base';

export interface EnforcementFetchOptions {
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
 * Client-side data source for all enforcement dashboard endpoints.
 *
 * Each method attempts the real API first and transparently falls back
 * to mock data when the API is unavailable or returns empty results.
 */
class EnforcementSource {
  private baseUrl = buildApiUrl('/api/enforcement');
  private _mockEndpoints = new Set<string>();

  /**
   * True if any of the main data endpoints fell back to mock data.
   *
   * Explicitly checks the three primary endpoints (summary, by-language,
   * by-domain) so that an empty response from ANY of them triggers the
   * demo-mode banner — not just a zero-evaluation summary.
   */
  get isUsingMockData(): boolean {
    return (
      this._mockEndpoints.has('summary') ||
      this._mockEndpoints.has('by-language') ||
      this._mockEndpoints.has('by-domain')
    );
  }

  private markReal(endpoint: string): void {
    this._mockEndpoints.delete(endpoint);
  }

  private markMock(endpoint: string): void {
    this._mockEndpoints.add(endpoint);
  }

  private buildWindowParam(window: EnforcementTimeWindow): string {
    return `?window=${encodeURIComponent(window)}`;
  }

  /** Fetch aggregate enforcement summary metrics. */
  async summary(
    window: EnforcementTimeWindow = '7d',
    options: EnforcementFetchOptions = {}
  ): Promise<EnforcementSummary> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('summary');
      return getMockEnforcementSummary(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/summary${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: EnforcementSummary = await response.json();
      if (mockOnEmpty && data.total_evaluations === 0) {
        this.markMock('summary');
        return getMockEnforcementSummary(window);
      }
      this.markReal('summary');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnforcementSource] API unavailable for summary, using demo data');
        this.markMock('summary');
        return getMockEnforcementSummary(window);
      }
      throw new Error('Failed to fetch enforcement summary');
    }
  }

  /** Fetch enforcement hit rate broken down by language. */
  async byLanguage(
    window: EnforcementTimeWindow = '7d',
    options: EnforcementFetchOptions = {}
  ): Promise<EnforcementByLanguage[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('by-language');
      return getMockEnforcementByLanguage(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/by-language${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: EnforcementByLanguage[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('by-language');
        return getMockEnforcementByLanguage(window);
      }
      this.markReal('by-language');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnforcementSource] API unavailable for by-language, using demo data');
        this.markMock('by-language');
        return getMockEnforcementByLanguage(window);
      }
      throw new Error('Failed to fetch enforcement by language');
    }
  }

  /** Fetch enforcement hit rate broken down by domain. */
  async byDomain(
    window: EnforcementTimeWindow = '7d',
    options: EnforcementFetchOptions = {}
  ): Promise<EnforcementByDomain[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('by-domain');
      return getMockEnforcementByDomain(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/by-domain${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: EnforcementByDomain[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('by-domain');
        return getMockEnforcementByDomain(window);
      }
      this.markReal('by-domain');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnforcementSource] API unavailable for by-domain, using demo data');
        this.markMock('by-domain');
        return getMockEnforcementByDomain(window);
      }
      throw new Error('Failed to fetch enforcement by domain');
    }
  }

  /** Fetch the top violated patterns table. */
  async violatedPatterns(
    window: EnforcementTimeWindow = '7d',
    options: EnforcementFetchOptions = {}
  ): Promise<ViolatedPattern[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('violated-patterns');
      return getMockViolatedPatterns(window);
    }
    try {
      const response = await fetch(
        `${this.baseUrl}/violated-patterns${this.buildWindowParam(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ViolatedPattern[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('violated-patterns');
        return getMockViolatedPatterns(window);
      }
      this.markReal('violated-patterns');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnforcementSource] API unavailable for violated-patterns, using demo data');
        this.markMock('violated-patterns');
        return getMockViolatedPatterns(window);
      }
      throw new Error('Failed to fetch violated patterns');
    }
  }

  /** Fetch time-series trend data for enforcement metrics. */
  async trend(
    window: EnforcementTimeWindow = '7d',
    options: EnforcementFetchOptions = {}
  ): Promise<EnforcementTrendPoint[]> {
    const { fallbackToMock = true, mockOnEmpty = false, demoMode = false } = options;
    if (demoMode) {
      this.markMock('trend');
      return getMockEnforcementTrend(window);
    }
    try {
      const response = await fetch(`${this.baseUrl}/trend${this.buildWindowParam(window)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: EnforcementTrendPoint[] = await response.json();
      if (mockOnEmpty && (!Array.isArray(data) || data.length === 0)) {
        this.markMock('trend');
        return getMockEnforcementTrend(window);
      }
      this.markReal('trend');
      return data;
    } catch {
      if (fallbackToMock) {
        console.warn('[EnforcementSource] API unavailable for trend, using demo data');
        this.markMock('trend');
        return getMockEnforcementTrend(window);
      }
      throw new Error('Failed to fetch enforcement trend');
    }
  }
}

/** Singleton data source instance shared across components. */
export const enforcementSource = new EnforcementSource();
