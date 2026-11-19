/**
 * OMN-12943 — React Query hooks for the ported event-dash views.
 *
 * Thin wrappers over src/services/event-dash-api.ts. Each hook returns the
 * typed ProjectionResult (rows + freshness + degraded reason) so pages render
 * an honest empty/degraded state without applying any fallback default to a
 * projection value. Live data only — no fixture path.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  fetchDelegationDecisions,
  fetchMoreDelegationDecisions,
  fetchDelegationSummary,
  fetchDelegationModelRouting,
  fetchDelegationQualityGate,
  fetchCostSavingsOverview,
  fetchMeteringSummary,
  fetchDelegationSavings,
  fetchDelegationTokenUsage,
  fetchCorrelationTrace,
  fetchNodeGenerations,
  fetchAbCompare,
  fetchContextExperimentScores,
  type ProjectionResult,
  type DelegationDecisionRow,
  type DelegationSummaryRow,
  type ModelRoutingRow,
  type QualityGateRow,
  type CostSavingsOverviewRow,
  type SavingsRow,
  type TokenUsageRow,
  type CorrelationTraceRow,
  type NodeGenerationRow,
  type AbCompareRow,
  type ContextExperimentScoreRow,
} from '@/services/event-dash-api';
import { fetchExposureCensus, type ExposureCensus } from '@/data-source/exposure-census';
import { refreshInterval } from '@/theme/refresh';

// Live ticker poll cadence (ms). The bus view polls newest rows so the
// "now on bus" surface tracks real event arrival, never a simulated playback.

/** OMN-24472: one key for the decisions query, so the poll can read back what the query already holds. */
const DECISIONS_QUERY_KEY = ['ev', 'delegation', 'decisions'] as const;

/**
 * OMN-24472: a page timer poll passes the result the query already holds, so every fetch reads only the newest page
 * and merges it into what is held. OMN-19998: the first load (nothing held yet) reads the newest page only too — no
 * fetch of this query walks the run history. Older runs are read by useLoadMoreDelegationDecisions, one page per
 * Load more press.
 */
export const useDelegationDecisions = (): UseQueryResult<ProjectionResult<DelegationDecisionRow>> => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: DECISIONS_QUERY_KEY,
    queryFn: () => fetchDelegationDecisions(queryClient.getQueryData<ProjectionResult<DelegationDecisionRow>>(DECISIONS_QUERY_KEY)),
    refetchInterval: refreshInterval(),
  });
};

/**
 * OMN-19998: the viewer's Load more control for the decisions history. No page or poll walks the run history; when
 * the held result is truncated (an unfinished ascending walk), canLoadMore is true and each loadMore press reads
 * EXACTLY ONE older page (fetchMoreDelegationDecisions) into the same query cache entry. The held result is
 * subscribed with enabled:false — the query never fetches here, it only observes what useDelegationDecisions reads.
 */
export const useLoadMoreDelegationDecisions = (): {
  canLoadMore: boolean;
  loading: boolean;
  loadMore: () => Promise<void>;
} => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const held = useQuery({
    queryKey: DECISIONS_QUERY_KEY,
    queryFn: () => fetchDelegationDecisions(queryClient.getQueryData<ProjectionResult<DelegationDecisionRow>>(DECISIONS_QUERY_KEY)),
    enabled: false,
  }).data;
  const loadMore = useCallback(async () => {
    const current = queryClient.getQueryData<ProjectionResult<DelegationDecisionRow>>(DECISIONS_QUERY_KEY);
    if (current === undefined) return;
    setLoading(true);
    try {
      queryClient.setQueryData<ProjectionResult<DelegationDecisionRow>>(
        DECISIONS_QUERY_KEY,
        await fetchMoreDelegationDecisions(current),
      );
    } finally {
      setLoading(false);
    }
  }, [queryClient]);
  return {
    canLoadMore: held?.truncated === true && typeof held.nextCursor === 'string',
    loading,
    loadMore,
  };
};

export const useDelegationSummary = (): UseQueryResult<ProjectionResult<DelegationSummaryRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'summary'], queryFn: fetchDelegationSummary, refetchInterval: refreshInterval() });

export const useDelegationModelRouting = (): UseQueryResult<ProjectionResult<ModelRoutingRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'model-routing'], queryFn: fetchDelegationModelRouting, refetchInterval: refreshInterval() });

export const useDelegationQualityGate = (): UseQueryResult<ProjectionResult<QualityGateRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'quality-gate'], queryFn: fetchDelegationQualityGate, refetchInterval: refreshInterval() });

export const useCostSavingsOverview = (): UseQueryResult<ProjectionResult<CostSavingsOverviewRow>> =>
  useQuery({ queryKey: ['ev', 'cost', 'savings-overview'], queryFn: fetchCostSavingsOverview, refetchInterval: refreshInterval() });

// OMN-21166 AC50: the catalogue decides which headline source Overview reads; Evidence follows the same decision.
export const useExposureCensus = (): UseQueryResult<ExposureCensus> =>
  useQuery({ queryKey: ['ev', 'census'], queryFn: fetchExposureCensus, refetchInterval: refreshInterval() });
export const useMeteringSummary = (enabled: boolean): UseQueryResult<ProjectionResult<Record<string, unknown>>> =>
  useQuery({ queryKey: ['ev', 'metering', 'summary'], queryFn: fetchMeteringSummary, refetchInterval: refreshInterval(), enabled });
export const useDelegationSavings = (): UseQueryResult<ProjectionResult<SavingsRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'savings'], queryFn: fetchDelegationSavings, refetchInterval: refreshInterval() });

export const useDelegationTokenUsage = (): UseQueryResult<ProjectionResult<TokenUsageRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'token-usage'], queryFn: fetchDelegationTokenUsage, refetchInterval: refreshInterval() });

export const useCorrelationTrace = (
  correlationId: string | null,
): UseQueryResult<ProjectionResult<CorrelationTraceRow>> =>
  useQuery({
    queryKey: ['ev', 'delegation', 'trace', correlationId],
    queryFn: () => fetchCorrelationTrace(correlationId as string),
    enabled: correlationId != null,
  });

export const useNodeGenerations = (): UseQueryResult<ProjectionResult<NodeGenerationRow>> =>
  useQuery({ queryKey: ['ev', 'sea', 'node-generations'], queryFn: fetchNodeGenerations, refetchInterval: refreshInterval() });

export const useAbCompare = (): UseQueryResult<ProjectionResult<AbCompareRow>> =>
  useQuery({ queryKey: ['ev', 'experiments', 'ab-compare'], queryFn: fetchAbCompare, refetchInterval: refreshInterval() });

export const useContextExperimentScores = (): UseQueryResult<ProjectionResult<ContextExperimentScoreRow>> =>
  useQuery({
    queryKey: ['ev', 'experiments', 'context-scores'],
    queryFn: fetchContextExperimentScores,
    refetchInterval: refreshInterval(),
  });
