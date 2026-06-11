/**
 * OMN-12993 — pure aggregation for the /experiments A/B Model Compare panel.
 *
 * The `onex.snapshot.projection.ab-compare.v1` projection (llm_call_metrics,
 * created in OMN-12970) serves ONE row PER LLM CALL. The panel renders ONE row
 * PER MODEL — run counts plus latency / token / cost rollups. This module is the
 * pure transform between the two shapes so the contract is unit-tested directly
 * (the page owns only rendering + empty states).
 *
 * Honest missing-usage: the exp0 emitter writes `usage_source='MISSING'` /
 * `prompt_tokens=0` when the provider returned no token usage (upstream gap
 * tracked by OMN-12994). Such rows are counted as runs but contribute NOTHING to
 * token/cost aggregates, and a model whose calls all lack usage reports
 * `hasUsage=false` with NULL token/cost — never 0 masquerading as a measured
 * value. Latency is captured on every call, so it aggregates independently.
 *
 * The projection API serializes numeric columns as strings (e.g. "819.00",
 * "0.000000"); `num()` coerces defensively so the aggregate stays numeric.
 */

import type { AbCompareRow } from '@/services/event-dash-api';

export interface ModelAggregate {
  /** Raw projection model_id (may be empty string). */
  modelId: string;
  /** Display label — falls back to an honest 'unknown model' for blank ids. */
  label: string;
  /** Number of per-call rows for this model. */
  runs: number;
  /** Mean latency over calls that reported latency, or null when none did. */
  avgLatencyMs: number | null;
  /** True when at least one call carried real (non-MISSING) token usage. */
  hasUsage: boolean;
  /** Summed total_tokens over real-usage calls, or null when usage is absent. */
  totalTokens: number | null;
  /** Mean total_tokens over real-usage calls, or null when usage is absent. */
  avgTokens: number | null;
  /** Summed estimated_cost_usd over real-usage calls, or null when absent. */
  totalCostUsd: number | null;
}

/** Coerce a string|number|null projection value to a finite number, else null. */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * A per-call row carries real token usage only when the emitter actually
 * captured it. The exp0 path writes `usage_source='MISSING'` with zeroed token
 * counts; those are NOT measured usage and must not feed the cost columns.
 */
function hasRealUsage(r: AbCompareRow): boolean {
  if (r.usage_source == null || r.usage_source === 'MISSING') return false;
  const pt = num(r.prompt_tokens);
  const tt = num(r.total_tokens);
  return (pt != null && pt > 0) || (tt != null && tt > 0);
}

interface Acc {
  modelId: string;
  runs: number;
  latencySum: number;
  latencyCount: number;
  tokensSum: number;
  usageCount: number;
  costSum: number;
  costCount: number;
}

/**
 * Roll per-call ab-compare rows up into one {@link ModelAggregate} per model.
 * Models are ordered by run count descending (busiest model first); ties keep
 * first-seen order via a stable secondary sort on model id.
 */
export function aggregateAbCompareByModel(rows: AbCompareRow[]): ModelAggregate[] {
  const byModel = new Map<string, Acc>();
  for (const r of rows) {
    const key = r.model_id ?? '';
    const acc =
      byModel.get(key) ??
      ({ modelId: key, runs: 0, latencySum: 0, latencyCount: 0, tokensSum: 0, usageCount: 0, costSum: 0, costCount: 0 } satisfies Acc);
    acc.runs += 1;

    const lat = num(r.latency_ms);
    if (lat != null) {
      acc.latencySum += lat;
      acc.latencyCount += 1;
    }

    if (hasRealUsage(r)) {
      const tt = num(r.total_tokens);
      if (tt != null) {
        acc.tokensSum += tt;
        acc.usageCount += 1;
      }
      const cost = num(r.estimated_cost_usd);
      if (cost != null) {
        acc.costSum += cost;
        acc.costCount += 1;
      }
    }

    byModel.set(key, acc);
  }

  return Array.from(byModel.values())
    .map((a): ModelAggregate => ({
      modelId: a.modelId,
      label: a.modelId === '' ? 'unknown model' : a.modelId,
      runs: a.runs,
      avgLatencyMs: a.latencyCount > 0 ? a.latencySum / a.latencyCount : null,
      hasUsage: a.usageCount > 0,
      totalTokens: a.usageCount > 0 ? a.tokensSum : null,
      avgTokens: a.usageCount > 0 ? a.tokensSum / a.usageCount : null,
      totalCostUsd: a.costCount > 0 ? a.costSum : null,
    }))
    .sort((x, y) => (y.runs - x.runs) || x.modelId.localeCompare(y.modelId));
}
