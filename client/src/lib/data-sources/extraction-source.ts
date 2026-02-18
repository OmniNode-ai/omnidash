/**
 * Extraction Dashboard Data Source (OMN-1804 / OMN-2304)
 *
 * Fetches extraction pipeline metrics from API endpoints with graceful
 * fallback to mock data when tables are empty or API is unavailable.
 *
 * PostgreSQL is the single source of truth for all data.
 */

import type {
  ExtractionSummary,
  PipelineHealthResponse,
  LatencyHeatmapResponse,
  PatternVolumeResponse,
  ErrorRatesSummaryResponse,
} from '@shared/extraction-types';
import {
  getMockExtractionSummary,
  getMockPipelineHealth,
  getMockLatencyHeatmap,
  getMockPatternVolume,
  getMockErrorRatesSummary,
} from '@/lib/mock-data/extraction-mock';

export interface ExtractionFetchOptions {
  fallbackToMock?: boolean;
}

class ExtractionSource {
  private baseUrl = '/api/extraction';
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

  private isSummaryEmpty(data: ExtractionSummary): boolean {
    return data.total_injections === 0;
  }

  async summary(options: ExtractionFetchOptions = {}): Promise<ExtractionSummary> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ExtractionSummary = await response.json();
      if (fallbackToMock && this.isSummaryEmpty(data)) {
        this.markMock('summary');
        return getMockExtractionSummary();
      }
      this.markReal('summary');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for summary, using demo data');
        this.markMock('summary');
        return getMockExtractionSummary();
      }
      throw error;
    }
  }

  async pipelineHealth(options: ExtractionFetchOptions = {}): Promise<PipelineHealthResponse> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/health/pipeline`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: PipelineHealthResponse = await response.json();
      if (fallbackToMock && data.cohorts.length === 0) {
        this.markMock('health');
        return getMockPipelineHealth();
      }
      this.markReal('health');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for pipeline health, using demo data');
        this.markMock('health');
        return getMockPipelineHealth();
      }
      throw error;
    }
  }

  async latencyHeatmap(
    window: string = '24h',
    options: ExtractionFetchOptions = {}
  ): Promise<LatencyHeatmapResponse> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/latency/heatmap?window=${encodeURIComponent(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LatencyHeatmapResponse = await response.json();
      if (fallbackToMock && data.buckets.length === 0) {
        this.markMock('latency');
        return getMockLatencyHeatmap(window);
      }
      this.markReal('latency');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for latency heatmap, using demo data');
        this.markMock('latency');
        return getMockLatencyHeatmap(window);
      }
      throw error;
    }
  }

  async patternVolume(
    window: string = '24h',
    options: ExtractionFetchOptions = {}
  ): Promise<PatternVolumeResponse> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/patterns/volume?window=${encodeURIComponent(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: PatternVolumeResponse = await response.json();
      if (fallbackToMock && data.points.length === 0) {
        this.markMock('volume');
        return getMockPatternVolume(window);
      }
      this.markReal('volume');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for pattern volume, using demo data');
        this.markMock('volume');
        return getMockPatternVolume(window);
      }
      throw error;
    }
  }

  async errorsSummary(options: ExtractionFetchOptions = {}): Promise<ErrorRatesSummaryResponse> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/errors/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ErrorRatesSummaryResponse = await response.json();
      if (fallbackToMock && data.entries.length === 0) {
        this.markMock('errors');
        return getMockErrorRatesSummary();
      }
      this.markReal('errors');
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for error rates, using demo data');
        this.markMock('errors');
        return getMockErrorRatesSummary();
      }
      throw error;
    }
  }
}

export const extractionSource = new ExtractionSource();
