// SPDX-License-Identifier: MIT
/**
 * Objective Evaluation Data Source (OMN-2583)
 *
 * Fetches objective evaluation dashboard data from the API with graceful
 * fallback to mock data. Follows the API-first + mock-fallback pattern
 * established by llm-routing-source.ts and enforcement-source.ts.
 */

import type {
  ScoreVectorSummaryResponse,
  GateFailureTimelineResponse,
  PolicyStateHistoryResponse,
  AntiGamingAlertFeedResponse,
  ObjectiveTimeWindow,
} from '@shared/objective-types';
import {
  getMockScoreVectorSummary,
  getMockGateFailureTimeline,
  getMockPolicyStateHistory,
  getMockAntiGamingAlerts,
} from '@/lib/mock-data/objective-mock';
import { buildApiUrl } from '@/lib/data-sources/api-base';

export interface ObjectiveFetchOptions {
  /** Fall back to mock data on network/HTTP errors (default: true). */
  fallbackToMock?: boolean;
  /** Also fall back to mock when the API returns empty results (default: true). */
  mockOnEmpty?: boolean;
}

/**
 * Client-side data source for all objective evaluation dashboard endpoints.
 *
 * Each method attempts the real API first and transparently falls back
 * to mock data when the API is unavailable or returns empty results.
 */
class ObjectiveSource {
  private baseUrl = buildApiUrl('/api/objective');
  private _mockEndpoints = new Set<string>();

  /**
   * True if any primary endpoint fell back to mock data.
   */
  get isUsingMockData(): boolean {
    return this._mockEndpoints.size > 0;
  }

  clearMockState(): void {
    this._mockEndpoints.clear();
  }

  // ============================================================================
  // Score Vector
  // ============================================================================

  async scoreVector(
    window: ObjectiveTimeWindow,
    options: ObjectiveFetchOptions = { fallbackToMock: false, mockOnEmpty: false }
  ): Promise<ScoreVectorSummaryResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/score-vector?window=${window}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ScoreVectorSummaryResponse;
      if (options.mockOnEmpty && data.points.length === 0) {
        this._mockEndpoints.add('score-vector');
        return getMockScoreVectorSummary(window);
      }
      return data;
    } catch {
      if (options.fallbackToMock) {
        this._mockEndpoints.add('score-vector');
        return getMockScoreVectorSummary(window);
      }
      throw new Error('Failed to fetch score vector data');
    }
  }

  // ============================================================================
  // Gate Failure Timeline
  // ============================================================================

  async gateFailureTimeline(
    window: ObjectiveTimeWindow,
    options: ObjectiveFetchOptions = { fallbackToMock: false, mockOnEmpty: false }
  ): Promise<GateFailureTimelineResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/gate-failures?window=${window}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GateFailureTimelineResponse;
      if (options.mockOnEmpty && data.total_failures === 0) {
        this._mockEndpoints.add('gate-failures');
        return getMockGateFailureTimeline(window);
      }
      return data;
    } catch {
      if (options.fallbackToMock) {
        this._mockEndpoints.add('gate-failures');
        return getMockGateFailureTimeline(window);
      }
      throw new Error('Failed to fetch gate failure timeline');
    }
  }

  // ============================================================================
  // Policy State History
  // ============================================================================

  async policyStateHistory(
    window: ObjectiveTimeWindow,
    options: ObjectiveFetchOptions = { fallbackToMock: false, mockOnEmpty: false }
  ): Promise<PolicyStateHistoryResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/policy-state?window=${window}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PolicyStateHistoryResponse;
      if (options.mockOnEmpty && data.points.length === 0) {
        this._mockEndpoints.add('policy-state');
        return getMockPolicyStateHistory(window);
      }
      return data;
    } catch {
      if (options.fallbackToMock) {
        this._mockEndpoints.add('policy-state');
        return getMockPolicyStateHistory(window);
      }
      throw new Error('Failed to fetch policy state history');
    }
  }

  // ============================================================================
  // Anti-Gaming Alert Feed
  // ============================================================================

  async antiGamingAlerts(
    window: ObjectiveTimeWindow,
    options: ObjectiveFetchOptions = { fallbackToMock: false, mockOnEmpty: false }
  ): Promise<AntiGamingAlertFeedResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/anti-gaming-alerts?window=${window}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AntiGamingAlertFeedResponse;
      if (options.mockOnEmpty && data.alerts.length === 0) {
        this._mockEndpoints.add('anti-gaming-alerts');
        return getMockAntiGamingAlerts(window);
      }
      return data;
    } catch {
      if (options.fallbackToMock) {
        this._mockEndpoints.add('anti-gaming-alerts');
        return getMockAntiGamingAlerts(window);
      }
      throw new Error('Failed to fetch anti-gaming alerts');
    }
  }

  // ============================================================================
  // Acknowledge Alert
  // ============================================================================

  async acknowledgeAlert(alertId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/anti-gaming-alerts/${alertId}/acknowledge`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to acknowledge alert`);
  }
}

export const objectiveSource = new ObjectiveSource();
