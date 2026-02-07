/**
 * Injection Effectiveness Data Source
 *
 * Fetches effectiveness metrics from API with graceful fallback to mock data.
 * Follows the same API-first + mock-fallback pattern as ValidationSource.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 */

import type {
  EffectivenessSummary,
  ThrottleStatus,
  LatencyDetails,
  UtilizationDetails,
  ABComparison,
} from '@shared/effectiveness-types';
import {
  getMockSummary,
  getMockThrottleStatus,
  getMockLatencyDetails,
  getMockUtilizationDetails,
  getMockABComparison,
} from '@/lib/mock-data/effectiveness-mock';

export interface EffectivenessFetchOptions {
  fallbackToMock?: boolean;
}

class EffectivenessSource {
  private baseUrl = '/api/effectiveness';
  private _isUsingMockData = false;

  get isUsingMockData(): boolean {
    return this._isUsingMockData;
  }

  async summary(options: EffectivenessFetchOptions = {}): Promise<EffectivenessSummary> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for summary, using demo data');
        this._isUsingMockData = true;
        return getMockSummary();
      }
      throw error;
    }
  }

  async throttleStatus(options: EffectivenessFetchOptions = {}): Promise<ThrottleStatus> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/throttle`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for throttle, using demo data');
        this._isUsingMockData = true;
        return getMockThrottleStatus();
      }
      throw error;
    }
  }

  async latencyDetails(options: EffectivenessFetchOptions = {}): Promise<LatencyDetails> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/latency`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for latency, using demo data');
        this._isUsingMockData = true;
        return getMockLatencyDetails();
      }
      throw error;
    }
  }

  async utilizationDetails(options: EffectivenessFetchOptions = {}): Promise<UtilizationDetails> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/utilization`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for utilization, using demo data');
        this._isUsingMockData = true;
        return getMockUtilizationDetails();
      }
      throw error;
    }
  }

  async abComparison(options: EffectivenessFetchOptions = {}): Promise<ABComparison> {
    const { fallbackToMock = true } = options;
    try {
      const response = await fetch(`${this.baseUrl}/ab`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn('[EffectivenessSource] API unavailable for A/B, using demo data');
        this._isUsingMockData = true;
        return getMockABComparison();
      }
      throw error;
    }
  }
}

export const effectivenessSource = new EffectivenessSource();
