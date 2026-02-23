/**
 * Status Data Source (OMN-2658)
 *
 * Fetches status dashboard data from the API.
 * No mock fallback — the projection returns empty state on first load.
 */

import type { GitHookEvent, TriageState, WorkstreamStatus } from '@shared/status-types';
import type { GitHubPRStatusEvent } from '@shared/status-types';
import { buildApiUrl } from '@/lib/data-sources/api-base';

export type PRsByTriageState = Record<
  TriageState,
  Array<GitHubPRStatusEvent & { triage_state: TriageState }>
>;

export interface StatusSummary {
  triage_counts: Record<TriageState, number>;
  ci_failure_repos: string[];
  total_prs: number;
  workstream_count: number;
}

export interface WorkstreamsResponse {
  workstreams: WorkstreamStatus[];
  snapshot_at: string | null;
}

class StatusSource {
  private baseUrl = buildApiUrl('/api/status');

  /** Fetch all PRs grouped by triage state. */
  async prs(): Promise<PRsByTriageState> {
    const response = await fetch(`${this.baseUrl}/prs`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch PRs`);
    return response.json() as Promise<PRsByTriageState>;
  }

  /** Fetch PRs for a specific repo (URL-encoded). */
  async prsByRepo(
    repo: string
  ): Promise<Array<GitHubPRStatusEvent & { triage_state: TriageState }>> {
    const response = await fetch(`${this.baseUrl}/prs/${encodeURIComponent(repo)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch PRs for ${repo}`);
    return response.json() as Promise<Array<GitHubPRStatusEvent & { triage_state: TriageState }>>;
  }

  /** Fetch recent git hook events. */
  async hooks(limit = 50): Promise<GitHookEvent[]> {
    const response = await fetch(`${this.baseUrl}/hooks?limit=${limit}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch hook events`);
    return response.json() as Promise<GitHookEvent[]>;
  }

  /** Fetch status summary (triage counts, CI failure repos). */
  async summary(): Promise<StatusSummary> {
    const response = await fetch(`${this.baseUrl}/summary`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch status summary`);
    return response.json() as Promise<StatusSummary>;
  }

  /** Fetch current Linear workstreams snapshot. */
  async workstreams(): Promise<WorkstreamsResponse> {
    const response = await fetch(`${this.baseUrl}/workstreams`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch workstreams`);
    return response.json() as Promise<WorkstreamsResponse>;
  }
}

/** Singleton data source instance shared across components. */
export const statusSource = new StatusSource();
