import { useMemo } from 'react';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { tierForModel, type Tier } from './modelTier';
import type { DelegationSavingsProjection, DelegationDecisionRow } from '../types';

/** One delegated run, flattened from the savings session + its decision row. */
export interface RunRow {
  session_id: string;
  correlation_id: string | undefined;
  created_at: string;
  model_name: string;
  tier: Tier;
  task_type: string;
  /** undefined when no decision row matched this session (never a fabricated pass). */
  gate: boolean | undefined;
  gate_detail: string | null | undefined;
  tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  /** Actual (local/cheaper-tier) cost. */
  cost_usd: number;
  /** Counterfactual cost at the premium baseline. */
  cloud_cost_usd: number;
  saved_usd: number;
  baseline_model: string;
  tokens_to_compliance: number | null;
  compliance_attempts: number | undefined;
  latency_ms: number;
  prompt_text: string | undefined;
  response_text: string | undefined;
}

export interface DelegationRuns {
  /** Newest first. */
  rows: RunRow[];
  isLoading: boolean;
  error: Error | null;
  sample: boolean;
  /** Grand total of runs the projection reports (the window in `rows` may be smaller). */
  sessionCount: number | undefined;
}

/**
 * Shared read for the run views. Rows come from the savings projection's per-task
 * sessions; the gate and correlation id are joined from the decisions projection
 * by session_id. The dashboard's recent-runs widget, the tasks-list page, and the
 * run-detail page all read through this, so the join lives in exactly one place.
 */
export function useDelegationRuns(): DelegationRuns {
  const { data: savingsData, isLoading: sLoading, error: sError } =
    useProjectionQuery<DelegationSavingsProjection>({
      queryKey: ['dashboard', 'savings'],
      topic: TOPICS.delegationSavings,
    });
  const { data: decisionsData, isLoading: dLoading, error: dError } =
    useProjectionQuery<DelegationDecisionRow>({
      queryKey: ['dashboard', 'decisions'],
      topic: TOPICS.delegationDecisions,
    });

  const projection = savingsData?.[0];

  const decisionBySession = useMemo(() => {
    const m = new Map<string, DelegationDecisionRow>();
    for (const d of decisionsData ?? []) {
      if (d.session_id) m.set(d.session_id, d);
    }
    return m;
  }, [decisionsData]);

  const rows = useMemo<RunRow[]>(() => {
    if (!projection) return [];
    return [...projection.sessions]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => {
        const dec = decisionBySession.get(s.session_id);
        return {
          session_id: s.session_id,
          correlation_id: dec?.correlation_id,
          created_at: s.created_at,
          model_name: s.model_name,
          tier: tierForModel(s.model_name),
          task_type: s.task_type,
          gate: dec?.quality_gate_passed,
          gate_detail: dec?.quality_gate_detail,
          tokens: s.prompt_tokens + s.completion_tokens,
          prompt_tokens: s.prompt_tokens,
          completion_tokens: s.completion_tokens,
          cost_usd: s.local_cost_usd,
          cloud_cost_usd: s.cloud_cost_usd,
          saved_usd: s.savings_usd,
          baseline_model: s.baseline_model,
          tokens_to_compliance: s.tokens_to_compliance,
          compliance_attempts: s.compliance_attempts,
          latency_ms: s.latency_ms,
          prompt_text: s.prompt_text,
          response_text: s.response_text,
        };
      });
  }, [projection, decisionBySession]);

  return {
    rows,
    isLoading: sLoading || dLoading,
    error: sError ?? dError,
    sample: projection?.provisioned === false,
    sessionCount: projection?.session_count,
  };
}
