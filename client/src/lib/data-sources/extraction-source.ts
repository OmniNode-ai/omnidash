/**
 * Extraction Dashboard Data Source (OMN-1804 / OMN-2304)
 *
 * Fetches extraction pipeline metrics from API endpoints with graceful
 * fallback to mock data when tables are empty or API is unavailable.
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

/**
 * Options controlling fetch behaviour for ExtractionSource methods.
 *
 * @property fallbackToMock - When `true` (default), any network error or
 *   empty-table condition transparently returns demo data instead of throwing.
 *   Set to `false` in contexts where callers need to distinguish "no data yet"
 *   from a real API failure.
 */
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
   * Returns `true` when the summary represents a genuinely empty table —
   * i.e. no rows have ever been written to the backing store.
   *
   * A zero `total_injections` count alone is **not** sufficient to signal
   * "empty table", because a real (but currently quiet) deployment also
   * produces `total_injections === 0` for the current time window.
   *
   * The additional guard is `last_event_at == null` (null **or** undefined).
   * The API sets this field to `null` only when the aggregate query finds
   * zero rows in the table — it is the null sentinel for "table has never
   * had rows". A non-null `last_event_at` always means at least one row
   * exists, even if none fall inside the requested window.
   *
   * Do **not** change this to a strict `=== null` check: the API may return
   * either `null` or omit the field entirely (undefined), and both must be
   * treated identically as "no data".
   */
  private isSummaryEmpty(data: ExtractionSummary): boolean {
    return (
      (data.total_injections === 0 || !Number.isFinite(data.total_injections)) &&
      data.last_event_at == null
    );
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
        if (error instanceof SyntaxError) {
          // Parse errors (malformed JSON on 200) indicate a backend bug.
          // Use console.error so it's visible in DevTools, but still fall back to demo data.
          console.error(
            '[ExtractionSource] Malformed JSON from API for summary, falling back to demo data',
            error
          );
        } else {
          console.warn('[ExtractionSource] API unavailable for summary, using demo data');
        }
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
        if (error instanceof SyntaxError) {
          // Parse errors (malformed JSON on 200) indicate a backend bug.
          // Use console.error so it's visible in DevTools, but still fall back to demo data.
          console.error(
            '[ExtractionSource] Malformed JSON from API for pipeline health, falling back to demo data',
            error
          );
        } else {
          console.warn('[ExtractionSource] API unavailable for pipeline health, using demo data');
        }
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
        if (error instanceof SyntaxError) {
          // Parse errors (malformed JSON on 200) indicate a backend bug.
          // Use console.error so it's visible in DevTools, but still fall back to demo data.
          console.error(
            '[ExtractionSource] Malformed JSON from API for latency heatmap, falling back to demo data',
            error
          );
        } else {
          console.warn('[ExtractionSource] API unavailable for latency heatmap, using demo data');
        }
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
        if (error instanceof SyntaxError) {
          // Parse errors (malformed JSON on 200) indicate a backend bug.
          // Use console.error so it's visible in DevTools, but still fall back to demo data.
          console.error(
            '[ExtractionSource] Malformed JSON from API for pattern volume, falling back to demo data',
            error
          );
        } else {
          console.warn('[ExtractionSource] API unavailable for pattern volume, using demo data');
        }
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
        if (error instanceof SyntaxError) {
          // Parse errors (malformed JSON on 200) indicate a backend bug.
          // Use console.error so it's visible in DevTools, but still fall back to demo data.
          console.error(
            '[ExtractionSource] Malformed JSON from API for error rates, falling back to demo data',
            error
          );
        } else {
          console.warn('[ExtractionSource] API unavailable for error rates, using demo data');
        }
        return { data: getMockErrorRatesSummary(), isMock: true };
      }
      throw error;
    }
  }
}

export const extractionSource = new ExtractionSource();
