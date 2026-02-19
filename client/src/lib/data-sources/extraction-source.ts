/**
 * Extraction Dashboard Data Source (OMN-1804 / OMN-2304)
 *
 * Fetches extraction pipeline metrics from API endpoints with graceful
 * fallback to mock data when tables are empty or API is unavailable.
 *
 * PostgreSQL is the primary data source; falls back to demo data when tables are empty or the API is unavailable.
 *
 * Each method returns a discriminated union `{ data: T; isMock: boolean }`
 * so callers can track mock status in reactive state rather than reading a
 * mutable Set that React cannot observe.
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

export interface ExtractionResult<T> {
  data: T;
  isMock: boolean;
}

class ExtractionSource {
  private baseUrl = '/api/extraction';

  /**
   * Returns true when the summary represents a genuinely empty table —
   * no rows have ever been written. A zero-injection count alone is not
   * sufficient because a real (but quiet) period also produces
   * `total_injections === 0`. We additionally require `last_event_at` to
   * be null/undefined, which the API only returns when the table contains
   * no rows at all.
   */
  private isSummaryEmpty(data: ExtractionSummary): boolean {
    return data.total_injections === 0 && data.last_event_at == null;
  }

  async summary(
    options: ExtractionFetchOptions = {}
  ): Promise<ExtractionResult<ExtractionSummary>> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ExtractionSummary = await response.json();
      if (fallbackToMock && this.isSummaryEmpty(data)) {
        return { data: getMockExtractionSummary(), isMock: true };
      }
      return { data, isMock: false };
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for summary, using demo data');
        return { data: getMockExtractionSummary(), isMock: true };
      }
      throw error;
    }
  }

  async pipelineHealth(
    options: ExtractionFetchOptions = {}
  ): Promise<ExtractionResult<PipelineHealthResponse>> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/health/pipeline`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: PipelineHealthResponse = await response.json();
      if (fallbackToMock && data.cohorts.length === 0) {
        return { data: getMockPipelineHealth(), isMock: true };
      }
      return { data, isMock: false };
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for pipeline health, using demo data');
        return { data: getMockPipelineHealth(), isMock: true };
      }
      throw error;
    }
  }

  async latencyHeatmap(
    window: string = '24h',
    options: ExtractionFetchOptions = {}
  ): Promise<ExtractionResult<LatencyHeatmapResponse>> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/latency/heatmap?window=${encodeURIComponent(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: LatencyHeatmapResponse = await response.json();
      if (fallbackToMock && data.buckets.length === 0) {
        return { data: getMockLatencyHeatmap(window), isMock: true };
      }
      return { data, isMock: false };
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for latency heatmap, using demo data');
        return { data: getMockLatencyHeatmap(window), isMock: true };
      }
      throw error;
    }
  }

  async patternVolume(
    window: string = '24h',
    options: ExtractionFetchOptions = {}
  ): Promise<ExtractionResult<PatternVolumeResponse>> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(
        `${this.baseUrl}/patterns/volume?window=${encodeURIComponent(window)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: PatternVolumeResponse = await response.json();
      if (fallbackToMock && data.points.length === 0) {
        return { data: getMockPatternVolume(window), isMock: true };
      }
      return { data, isMock: false };
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for pattern volume, using demo data');
        return { data: getMockPatternVolume(window), isMock: true };
      }
      throw error;
    }
  }

  async errorsSummary(
    options: ExtractionFetchOptions = {}
  ): Promise<ExtractionResult<ErrorRatesSummaryResponse>> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/errors/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: ErrorRatesSummaryResponse = await response.json();
      if (fallbackToMock && data.entries.length === 0) {
        return { data: getMockErrorRatesSummary(), isMock: true };
      }
      return { data, isMock: false };
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[ExtractionSource] API unavailable for error rates, using demo data');
        return { data: getMockErrorRatesSummary(), isMock: true };
      }
      throw error;
    }
  }
}

export const extractionSource = new ExtractionSource();
