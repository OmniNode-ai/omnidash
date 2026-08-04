import { useMemo } from 'react';
import { useContextExperimentScores } from '@/components/dashboard/event-dash/useEventDashData';
import type { ContextExperimentScoreRow } from '@/services/event-dash-api';
import type { HeatmapCell, ContextSegment } from './context-heatmap.types';

/** Known context segments surfaced in OMN-11241 research. */
export const KNOWN_SEGMENTS: ContextSegment[] = [
  { id: 'golden_chain', label: 'Golden Chain', description: 'Exemplar chain with passing test evidence' },
  { id: 'claude_md', label: 'CLAUDE.md', description: 'Full CLAUDE.md contents injected into context' },
  { id: 'architecture_patterns', label: 'Architecture Patterns', description: 'Repo architecture pattern reference docs' },
  { id: 'exemplar', label: 'Exemplar', description: 'Single passing example for exact-interface tasks' },
  { id: 'local_failures', label: 'Local Failures', description: 'Recent failure examples from this repo' },
];

export interface ContextHeatmapSnapshot {
  cells: HeatmapCell[];
  segments: ContextSegment[];
  models: string[];
  scores: ContextExperimentScoreRow[];
  isLoading: boolean;
  hasAnyData: boolean;
  /** True when the backend reports degraded (missing table / unknown topic / degraded freshness). */
  isDegraded: boolean;
  /** Backend-supplied reason when degraded/unknown (verbatim), else null. */
  degradedReason: string | null;
  error: Error | null;
}

/**
 * Reads the live `onex.snapshot.projection.context.experiment-scores.v1`
 * projection (`context_roi_scores`, materialized by omnimarket
 * `node_projection_context_roi` — OMN-12955) via the same documented,
 * served path `ExperimentsPage` uses (`useContextExperimentScores` /
 * `fetchContextExperimentScores`). No fixture fallback: when the
 * projection has zero rows or is degraded, `hasAnyData` is false and the
 * caller renders an honest empty/degraded state instead of fabricated data
 * (OMN-14895 — the prior implementation silently substituted
 * `OMN_11241_FIXTURE_SCORES` whenever the live query returned zero rows).
 */
export function useContextHeatmap(): ContextHeatmapSnapshot {
  const query = useContextExperimentScores();

  const rows = query.data?.rows;
  const scores: ContextExperimentScoreRow[] = useMemo(() => rows ?? [], [rows]);
  const { cells, models } = useMemo(() => buildMatrix(scores), [scores]);

  return {
    cells,
    segments: KNOWN_SEGMENTS,
    models,
    scores,
    isLoading: query.isLoading,
    hasAnyData: scores.length > 0,
    isDegraded: query.data?.isDegraded ?? false,
    degradedReason: query.data?.degradedReason ?? null,
    error: (query.error as Error | null) ?? null,
  };
}

function buildMatrix(scores: ContextExperimentScoreRow[]): { cells: HeatmapCell[]; models: string[] } {
  // Collect unique models preserving insertion order
  const modelSet = new Set<string>();
  for (const s of scores) modelSet.add(s.model_id);
  const models = Array.from(modelSet);

  // Aggregate by segment×model
  const map = new Map<string, { pass: number; total: number; tokens: number }>();
  for (const s of scores) {
    const key = `${s.context_factor_subset}::${s.model_id}`;
    const existing = map.get(key);
    if (existing != null) {
      existing.total += 1;
      if (s.final_success) existing.pass += 1;
      existing.tokens += s.tokens_used;
    } else {
      map.set(key, { pass: s.final_success ? 1 : 0, total: 1, tokens: s.tokens_used });
    }
  }

  // Compute per-segment baseline token average (across all models) for delta calculation
  const segmentTokenBaseline = new Map<string, number>();
  for (const seg of Array.from(new Set(scores.map((s) => s.context_factor_subset)))) {
    const segScores = scores.filter((s) => s.context_factor_subset === seg);
    if (segScores.length > 0) {
      segmentTokenBaseline.set(seg, segScores.reduce((sum, s) => sum + s.tokens_used, 0) / segScores.length);
    }
  }

  const cells: HeatmapCell[] = [];
  for (const [key, agg] of map.entries()) {
    const [segmentId, modelId] = key.split('::');
    const passRate = agg.total > 0 ? agg.pass / agg.total : 0;
    const avgTokens = agg.total > 0 ? agg.tokens / agg.total : 0;
    const baseline = segmentTokenBaseline.get(segmentId);
    const tokenDelta = baseline != null ? baseline - avgTokens : null;
    cells.push({ segmentId, modelId, passCount: agg.pass, totalCount: agg.total, totalTokens: agg.tokens, passRate, tokenDelta });
  }

  return { cells, models };
}
