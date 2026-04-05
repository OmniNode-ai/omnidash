/**
 * Learned Insights Data Source
 *
 * Fetches insights from OmniMemory API.
 *
 * @see OMN-1407 - Learned Insights Panel (OmniClaude Integration)
 */

import type { InsightsSummary, InsightsTrendPoint } from '@shared/insights-types';

class InsightsSource {
  private baseUrl = '/api/insights';

  async summary(): Promise<InsightsSummary> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.baseUrl}/summary`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async trend(): Promise<InsightsTrendPoint[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.baseUrl}/trend`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

export const insightsSource = new InsightsSource();
