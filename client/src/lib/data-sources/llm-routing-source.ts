/**
 * LLM Routing Data Source (OMN-2279)
 *
 * Fetches LLM routing effectiveness metrics from the API.
 */

import type {
  LlmRoutingSummary,
  LlmRoutingLatencyPoint,
  LlmRoutingByVersion,
  LlmRoutingByModel,
  LlmRoutingByOmninodeMode,
  LlmRoutingDisagreement,
  LlmRoutingTrendPoint,
  LlmRoutingTimeWindow,
  LlmRoutingFuzzyConfidenceBucket,
} from '@shared/llm-routing-types';
import { buildApiUrl } from '@/lib/data-sources/api-base';

class LlmRoutingSource {
  private baseUrl = buildApiUrl('/api/llm-routing');

  private buildWindowParam(window: LlmRoutingTimeWindow): string {
    return `?window=${encodeURIComponent(window)}`;
  }

  async summary(window: LlmRoutingTimeWindow = '7d'): Promise<LlmRoutingSummary> {
    const response = await fetch(`${this.baseUrl}/summary${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: LlmRoutingSummary = await response.json();
    if (data.total_decisions == null) {
      throw new Error('Malformed response: missing total_decisions');
    }
    return data;
  }

  async latency(window: LlmRoutingTimeWindow = '7d'): Promise<LlmRoutingLatencyPoint[]> {
    const response = await fetch(`${this.baseUrl}/latency${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: LlmRoutingLatencyPoint[] = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Malformed response: expected array');
    }
    return data;
  }

  async byVersion(window: LlmRoutingTimeWindow = '7d'): Promise<LlmRoutingByVersion[]> {
    const response = await fetch(`${this.baseUrl}/by-version${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: LlmRoutingByVersion[] = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Malformed response: expected array');
    }
    return data;
  }

  async disagreements(window: LlmRoutingTimeWindow = '7d'): Promise<LlmRoutingDisagreement[]> {
    const response = await fetch(`${this.baseUrl}/disagreements${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: LlmRoutingDisagreement[] = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Malformed response: expected array');
    }
    return data;
  }

  async trend(window: LlmRoutingTimeWindow = '7d'): Promise<LlmRoutingTrendPoint[]> {
    const response = await fetch(`${this.baseUrl}/trend${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: LlmRoutingTrendPoint[] = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Malformed response: expected array');
    }
    return data;
  }

  async byModel(window: LlmRoutingTimeWindow = '7d'): Promise<LlmRoutingByModel[]> {
    const response = await fetch(`${this.baseUrl}/by-model${this.buildWindowParam(window)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: LlmRoutingByModel[] = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Malformed response: expected array');
    }
    return data;
  }
}

/** Singleton data source instance shared across components. */
export const llmRoutingSource = new LlmRoutingSource();

/**
 * Fetch per-model effectiveness data for the given time window (OMN-3443).
 */
export async function fetchByModel(window: LlmRoutingTimeWindow): Promise<LlmRoutingByModel[]> {
  return llmRoutingSource.byModel(window);
}

/**
 * Fetch the list of distinct model identifiers seen in the current window (OMN-3443).
 */
export async function fetchAvailableModels(window: LlmRoutingTimeWindow): Promise<string[]> {
  const rows = await llmRoutingSource.byModel(window);
  return rows.map((r) => r.model);
}

// ============================================================================
// Standalone fetch helpers (OMN-3447)
// ============================================================================

const _routingBase = buildApiUrl('/api/llm-routing');
const _configBase = buildApiUrl('/api/routing-config');

/**
 * Fetch ONEX path vs legacy path comparison data (OMN-3450).
 */
export async function fetchByOmninodeMode(window: string): Promise<LlmRoutingByOmninodeMode[]> {
  const response = await fetch(
    `${_routingBase}/by-omninode-mode?window=${encodeURIComponent(window)}`
  );
  if (!response.ok) throw new Error(`[fetchByOmninodeMode] HTTP ${response.status}`);
  const data: LlmRoutingByOmninodeMode[] = await response.json();
  if (!Array.isArray(data)) throw new Error('[fetchByOmninodeMode] Malformed response');
  return data;
}

/**
 * Fetch fuzzy confidence distribution for a given time window.
 */
export async function fetchFuzzyConfidence(
  window: string
): Promise<LlmRoutingFuzzyConfidenceBucket[]> {
  const response = await fetch(
    `${_routingBase}/fuzzy-confidence?window=${encodeURIComponent(window)}`
  );
  if (!response.ok) throw new Error(`[fetchFuzzyConfidence] HTTP ${response.status}`);
  const data: LlmRoutingFuzzyConfidenceBucket[] = await response.json();
  if (!Array.isArray(data)) throw new Error('[fetchFuzzyConfidence] Malformed response');
  return data;
}

/**
 * Fetch a single routing config value by key.
 */
export async function fetchRoutingConfig(key: string): Promise<string | null> {
  const response = await fetch(`${_configBase}/${encodeURIComponent(key)}`);
  if (!response.ok) throw new Error(`[fetchRoutingConfig] HTTP ${response.status}`);
  const data: { key: string; value: string | null } = await response.json();
  return data.value ?? null;
}

/**
 * Upsert a routing config value.
 */
export async function putRoutingConfig(key: string, value: string): Promise<void> {
  const response = await fetch(`${_configBase}/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) throw new Error(`[putRoutingConfig] HTTP ${response.status}`);
}
