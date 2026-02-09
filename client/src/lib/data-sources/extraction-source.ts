/**
 * Extraction Dashboard Data Source (OMN-1804)
 *
 * Fetches extraction pipeline metrics from API endpoints.
 * Returns empty-safe defaults when database is unavailable.
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

class ExtractionSource {
  private baseUrl = '/api/extraction';

  /**
   * Get summary stats for the metric cards row.
   */
  async summary(): Promise<ExtractionSummary> {
    const response = await fetch(`${this.baseUrl}/summary`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /**
   * Get pipeline health grouped by stage.
   */
  async pipelineHealth(): Promise<PipelineHealthResponse> {
    const response = await fetch(`${this.baseUrl}/health/pipeline`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /**
   * Get latency heatmap data for a time window.
   */
  async latencyHeatmap(window: string = '24h'): Promise<LatencyHeatmapResponse> {
    const response = await fetch(
      `${this.baseUrl}/latency/heatmap?window=${encodeURIComponent(window)}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /**
   * Get pattern volume over time.
   */
  async patternVolume(window: string = '24h'): Promise<PatternVolumeResponse> {
    const response = await fetch(
      `${this.baseUrl}/patterns/volume?window=${encodeURIComponent(window)}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /**
   * Get error rates summary.
   */
  async errorsSummary(): Promise<ErrorRatesSummaryResponse> {
    const response = await fetch(`${this.baseUrl}/errors/summary`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

export const extractionSource = new ExtractionSource();
