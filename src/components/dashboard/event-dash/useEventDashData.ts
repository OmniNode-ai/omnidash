/**
 * OMN-12943 — React Query hooks for the ported event-dash views.
 *
 * Thin wrappers over src/services/event-dash-api.ts. Each hook returns the
 * typed ProjectionResult (rows + freshness + degraded reason) so pages render
 * an honest empty/degraded state without applying any fallback default to a
 * projection value. Live data only — no fixture path.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  fetchDelegationDecisions,
  fetchDelegationSummary,
  fetchDelegationModelRouting,
  fetchDelegationQualityGate,
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
  type SavingsRow,
  type TokenUsageRow,
  type CorrelationTraceRow,
  type NodeGenerationRow,
  type AbCompareRow,
  type ContextExperimentScoreRow,
} from '@/services/event-dash-api';

// Live ticker poll cadence (ms). The bus view polls newest rows so the
// "now on bus" surface tracks real event arrival, never a simulated playback.
const POLL_MS = 15_000;

export const useDelegationDecisions = (): UseQueryResult<ProjectionResult<DelegationDecisionRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'decisions'], queryFn: fetchDelegationDecisions, refetchInterval: POLL_MS });

export const useDelegationSummary = (): UseQueryResult<ProjectionResult<DelegationSummaryRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'summary'], queryFn: fetchDelegationSummary, refetchInterval: POLL_MS });

export const useDelegationModelRouting = (): UseQueryResult<ProjectionResult<ModelRoutingRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'model-routing'], queryFn: fetchDelegationModelRouting, refetchInterval: POLL_MS });

export const useDelegationQualityGate = (): UseQueryResult<ProjectionResult<QualityGateRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'quality-gate'], queryFn: fetchDelegationQualityGate, refetchInterval: POLL_MS });

export const useDelegationSavings = (): UseQueryResult<ProjectionResult<SavingsRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'savings'], queryFn: fetchDelegationSavings, refetchInterval: POLL_MS });

export const useDelegationTokenUsage = (): UseQueryResult<ProjectionResult<TokenUsageRow>> =>
  useQuery({ queryKey: ['ev', 'delegation', 'token-usage'], queryFn: fetchDelegationTokenUsage, refetchInterval: POLL_MS });

export const useCorrelationTrace = (
  correlationId: string | null,
): UseQueryResult<ProjectionResult<CorrelationTraceRow>> =>
  useQuery({
    queryKey: ['ev', 'delegation', 'trace', correlationId],
    queryFn: () => fetchCorrelationTrace(correlationId as string),
    enabled: correlationId != null,
  });

export const useNodeGenerations = (): UseQueryResult<ProjectionResult<NodeGenerationRow>> =>
  useQuery({ queryKey: ['ev', 'sea', 'node-generations'], queryFn: fetchNodeGenerations, refetchInterval: POLL_MS });

export const useAbCompare = (): UseQueryResult<ProjectionResult<AbCompareRow>> =>
  useQuery({ queryKey: ['ev', 'experiments', 'ab-compare'], queryFn: fetchAbCompare, refetchInterval: POLL_MS });

export const useContextExperimentScores = (): UseQueryResult<ProjectionResult<ContextExperimentScoreRow>> =>
  useQuery({
    queryKey: ['ev', 'experiments', 'context-scores'],
    queryFn: fetchContextExperimentScores,
    refetchInterval: POLL_MS,
  });
