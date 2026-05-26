import { useMemo } from 'react';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { ContextExperimentScore, HeatmapCell, ContextSegment } from './context-heatmap.types';
import { OMN_11241_FIXTURE_SCORES } from './context-heatmap.fixtures';

const REFRESH_INTERVAL_MS = 10_000;

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
  scores: ContextExperimentScore[];
  isLoading: boolean;
  hasAnyData: boolean;
  isFixture: boolean;
  error: Error | null;
}

export function useContextHeatmap(): ContextHeatmapSnapshot {
  const query = useProjectionQuery<ContextExperimentScore>({
    queryKey: ['context-heatmap', 'experiment-scores'],
    topic: TOPICS.contextExperimentScores,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const liveScores: ContextExperimentScore[] = query.data != null ? query.data : [];
  const isFixture = !query.isLoading && liveScores.length === 0;
  const scores = isFixture ? OMN_11241_FIXTURE_SCORES : liveScores;

  const { cells, models } = useMemo(() => buildMatrix(scores), [scores]);

  return {
    cells,
    segments: KNOWN_SEGMENTS,
    models,
    scores,
    isLoading: query.isLoading,
    hasAnyData: scores.length > 0,
    isFixture,
    error: (query.error as Error | null) != null ? (query.error as Error) : null,
  };
}

function buildMatrix(scores: ContextExperimentScore[]): { cells: HeatmapCell[]; models: string[] } {
  // Collect unique models preserving insertion order
  const modelSet = new Set<string>();
  for (const s of scores) modelSet.add(s.modelId);
  const models = Array.from(modelSet);

  // Aggregate by segment×model
  const map = new Map<string, { pass: number; total: number; tokens: number }>();
  for (const s of scores) {
    const key = `${s.packId}::${s.modelId}`;
    const existing = map.get(key);
    if (existing != null) {
      existing.total += 1;
      if (s.qualityGatePassed) existing.pass += 1;
      existing.tokens += s.tokensUsed;
    } else {
      map.set(key, { pass: s.qualityGatePassed ? 1 : 0, total: 1, tokens: s.tokensUsed });
    }
  }

  // Compute per-segment baseline token average (across all models) for delta calculation
  const segmentTokenBaseline = new Map<string, number>();
  for (const seg of Array.from(new Set(scores.map((s) => s.packId)))) {
    const segScores = scores.filter((s) => s.packId === seg);
    if (segScores.length > 0) {
      segmentTokenBaseline.set(seg, segScores.reduce((sum, s) => sum + s.tokensUsed, 0) / segScores.length);
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
