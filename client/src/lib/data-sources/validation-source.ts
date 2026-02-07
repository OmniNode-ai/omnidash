/**
 * Validation Dashboard Data Source
 *
 * Fetches cross-repo validation data from API endpoints with graceful
 * fallback to mock data when the database is unavailable.
 *
 * Follows the same API-first + mock-fallback pattern as PatternLearningSource.
 *
 * Part of OMN-1907: Cross-Repo Validation Dashboard Integration
 */

import type { ValidationRun, RepoTrends } from '@shared/validation-types';
import {
  getMockRuns,
  getMockSummary,
  getMockRunDetail,
  getMockRepoTrends,
} from '@/lib/mock-data/validation-mock';

// ===========================
// Types
// ===========================

export interface ValidationSummary {
  total_runs: number;
  completed_runs: number;
  running_runs: number;
  unique_repos: number;
  repos: string[];
  pass_rate: number;
  total_violations_by_severity: Record<string, number>;
}

export interface RunSummary {
  run_id: string;
  repos: string[];
  validators: string[];
  triggered_by?: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  total_violations: number;
  violations_by_severity: Record<string, number>;
  violation_count: number;
}

export interface RunsListResponse {
  runs: RunSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ValidationFetchOptions {
  /** If true, fallback to mock data on error. Default: true */
  fallbackToMock?: boolean;
}

// ===========================
// Data Source Class
// ===========================

class ValidationSource {
  private baseUrl = '/api/validation';

  /** Track if we're currently using mock data (for UI indicator) */
  private _isUsingMockData = false;

  /** Check if last fetch used mock data */
  get isUsingMockData(): boolean {
    return this._isUsingMockData;
  }

  /**
   * Get summary stats across all validation runs.
   */
  async summary(options: ValidationFetchOptions = {}): Promise<ValidationSummary> {
    const { fallbackToMock = true } = options;

    try {
      const response = await fetch(`${this.baseUrl}/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn(
          '[ValidationSource] API unavailable for summary, using demo data:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        this._isUsingMockData = true;
        return getMockSummary();
      }
      throw error;
    }
  }

  /**
   * List validation runs with optional filters.
   */
  async listRuns(
    params: { status?: string; limit?: number; offset?: number } = {},
    options: ValidationFetchOptions = {}
  ): Promise<RunsListResponse> {
    const { fallbackToMock = true } = options;

    try {
      const query = new URLSearchParams();
      if (params.status && params.status !== 'all') query.set('status', params.status);
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      if (params.offset !== undefined) query.set('offset', String(params.offset));

      const url = query.toString() ? `${this.baseUrl}/runs?${query}` : `${this.baseUrl}/runs`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn(
          '[ValidationSource] API unavailable for runs, using demo data:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        this._isUsingMockData = true;

        let runs = getMockRuns();

        // Apply status filter
        if (params.status && params.status !== 'all') {
          runs = runs.filter((r) => r.status === params.status);
        }

        const total = runs.length;
        const offset = params.offset ?? 0;
        const limit = params.limit ?? 50;
        const paged = runs.slice(offset, offset + limit);

        // Convert to RunSummary (strip full violations array, add violation_count)
        const summaries: RunSummary[] = paged.map((run) => ({
          run_id: run.run_id,
          repos: run.repos,
          validators: run.validators,
          triggered_by: run.triggered_by,
          status: run.status,
          started_at: run.started_at,
          completed_at: run.completed_at,
          duration_ms: run.duration_ms,
          total_violations: run.total_violations,
          violations_by_severity: run.violations_by_severity,
          violation_count: run.total_violations,
        }));

        return { runs: summaries, total, limit, offset };
      }
      throw error;
    }
  }

  /**
   * Get a single validation run with full violation details.
   */
  async getRunDetail(
    runId: string,
    options: ValidationFetchOptions = {}
  ): Promise<ValidationRun | null> {
    const { fallbackToMock = true } = options;

    try {
      const response = await fetch(`${this.baseUrl}/runs/${encodeURIComponent(runId)}`);

      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn(
          '[ValidationSource] API unavailable for run detail, using demo data:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        this._isUsingMockData = true;
        return getMockRunDetail(runId);
      }
      throw error;
    }
  }

  /**
   * Get violation trends for a specific repo.
   */
  async getRepoTrends(repoId: string, options: ValidationFetchOptions = {}): Promise<RepoTrends> {
    const { fallbackToMock = true } = options;

    try {
      const response = await fetch(`${this.baseUrl}/repos/${encodeURIComponent(repoId)}/trends`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this._isUsingMockData = false;
      return data;
    } catch (error) {
      if (fallbackToMock) {
        console.warn(
          '[ValidationSource] API unavailable for trends, using demo data:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        this._isUsingMockData = true;
        return getMockRepoTrends(repoId);
      }
      throw error;
    }
  }
}

// ===========================
// Export Singleton
// ===========================

export const validationSource = new ValidationSource();
