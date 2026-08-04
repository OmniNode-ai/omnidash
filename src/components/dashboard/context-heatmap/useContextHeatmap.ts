import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFrameStore } from '@/store/store';
import { fetchContextExperimentScores } from '@/services/event-dash-api';
import type { ContextExperimentScoreRow } from '@/services/event-dash-api';
import type { HeatmapCell, ContextSegment } from './context-heatmap.types';

// Fallback poll cadence when no dashboard-level auto-refresh preference is set.
const DEFAULT_POLL_MS = 15_000;

/**
 * Display metadata for segment ids known from prior OMN-11241 research or
 * OMN-12955's live experiment harness. This is a LABEL LOOKUP only — it never
 * gates which segments render. Any `context_factor_subset` value present in
 * the live projection renders, known or not (OMN-14895 D1): the harness's
 * live vocabulary ({golden_exemplar, off}, verified via `context_roi_scores`
 * on stability-test 2026-08-04) does not match OMN-11241's original research
 * vocabulary, and a hardcoded allow-list silently dropped every live row.
 */
const SEGMENT_LABELS: Record<string, { label: string; description: string }> = {
  golden_chain: { label: 'Golden Chain', description: 'Exemplar chain with passing test evidence' },
  claude_md: { label: 'CLAUDE.md', description: 'Full CLAUDE.md contents injected into context' },
  architecture_patterns: { label: 'Architecture Patterns', description: 'Repo architecture pattern reference docs' },
  exemplar: { label: 'Exemplar', description: 'Single passing example for exact-interface tasks' },
  local_failures: { label: 'Local Failures', description: 'Recent failure examples from this repo' },
  golden_exemplar: { label: 'Golden Exemplar', description: 'Golden-chain exemplar context injected into the run' },
  off: { label: 'Off', description: 'No supplemental context injected' },
};

function labelForSegment(id: string): ContextSegment {
  const known = SEGMENT_LABELS[id];
  if (known) return { id, ...known };
  const label = id
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  return { id, label, description: id };
}

export interface ContextHeatmapSnapshot {
  cells: HeatmapCell[];
  /** Segments actually present in the live data, derived (not hardcoded) — OMN-14895 D1. */
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
 * `node_projection_context_roi` — OMN-12955) via the same documented, served
 * fetch function `ExperimentsPage` uses (`fetchContextExperimentScores`).
 * No fixture fallback: when the projection has zero rows or is degraded,
 * `hasAnyData` is false and the caller renders an honest empty/degraded
 * state instead of fabricated data (OMN-14895 — the prior implementation
 * silently substituted `OMN_11241_FIXTURE_SCORES` whenever the live query
 * returned zero rows).
 *
 * Called directly with `useQuery` (rather than the shared
 * `useContextExperimentScores` wrapper) so the dashboard-level
 * `AutoRefreshSelector` override (`globalFilters.autoRefreshInterval`,
 * OMN-126) is honored the same way every other grid widget honors it —
 * OMN-14895 D4: the wrapper hardcodes a 15s poll and ignores the global
 * "off" setting.
 */
export function useContextHeatmap(): ContextHeatmapSnapshot {
  const globalInterval = useFrameStore((s) => s.globalFilters.autoRefreshInterval);
  const refetchInterval = globalInterval === null ? false : (globalInterval ?? DEFAULT_POLL_MS);

  const query = useQuery({
    queryKey: ['ev', 'experiments', 'context-scores'],
    queryFn: fetchContextExperimentScores,
    refetchInterval,
  });

  const rows = query.data?.rows;
  const scores: ContextExperimentScoreRow[] = useMemo(() => rows ?? [], [rows]);
  const { cells, segments, models } = useMemo(() => buildMatrix(scores), [scores]);

  return {
    cells,
    segments,
    models,
    scores,
    isLoading: query.isLoading,
    hasAnyData: scores.length > 0,
    isDegraded: query.data?.isDegraded ?? false,
    degradedReason: query.data?.degradedReason ?? null,
    error: (query.error as Error | null) ?? null,
  };
}

function buildMatrix(
  scores: ContextExperimentScoreRow[],
): { cells: HeatmapCell[]; segments: ContextSegment[]; models: string[] } {
  // Collect unique models preserving insertion order
  const modelSet = new Set<string>();
  for (const s of scores) modelSet.add(s.model_id);
  const models = Array.from(modelSet);

  // Collect unique segments actually present in the live data, preserving
  // insertion order — never a hardcoded allow-list (OMN-14895 D1).
  const segmentIdSet = new Set<string>();
  for (const s of scores) segmentIdSet.add(s.context_factor_subset);
  const segments = Array.from(segmentIdSet).map(labelForSegment);

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
  for (const seg of Array.from(segmentIdSet)) {
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

  return { cells, segments, models };
}
