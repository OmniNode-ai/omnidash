import { useMemo } from 'react';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import type { DelegationSummary } from '@/components/dashboard/delegation/DelegationMetrics';
import type { DelegationSavingsProjection, DelegationSavingsSession } from '@/components/dashboard/delegation/delegation-savings.types';
import type {
  DelegationModelRoutingProjection,
  RoutingDecisionTrace,
} from '@/components/dashboard/delegation/DelegationModelRoutingWidget';
import type { DelegationQualityGateProjection } from '@/components/dashboard/delegation/DelegationQualityGateWidget';
import type { DelegationTokenUsageProjection } from '@/components/dashboard/delegation/DelegationTokenUsageWidget';
import type {
  DelegationDecisionProjectionRow,
  DelegationEvidenceSnapshot,
  DelegationProjectionProbe,
  DelegationRun,
} from './delegation-control-plane.types';

const REFRESH_INTERVAL_MS = 5_000;

function first<T>(rows: T[] | undefined): T | null {
  return rows?.[0] ?? null;
}

function parseDate(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric > 1e9) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeDate(value: string | number | null | undefined): string | undefined {
  const ts = parseDate(value);
  return ts > 0 ? new Date(ts).toISOString() : undefined;
}

function normalizeStatus(value: boolean | number | null | undefined): DelegationRun['status'] {
  if (value === true || Number(value) === 1) return 'passed';
  if (value === false || Number(value) === 0) return 'failed';
  return 'projected';
}

function totalTokens(session: DelegationSavingsSession): number | undefined {
  const total = (session.prompt_tokens ?? 0) + (session.completion_tokens ?? 0);
  return total > 0 ? total : undefined;
}

function upsertRun(map: Map<string, DelegationRun>, run: DelegationRun): void {
  const existing = map.get(run.id);
  if (!existing) {
    map.set(run.id, run);
    return;
  }
  map.set(run.id, {
    ...existing,
    ...Object.fromEntries(
      Object.entries(run).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ),
    status: existing.status === 'projected' ? run.status : existing.status,
    source: existing.source,
  } as DelegationRun);
}

function fromRoutingTrace(trace: RoutingDecisionTrace): DelegationRun {
  return {
    id: trace.correlation_id || `routing-${trace.id}`,
    correlationId: trace.correlation_id || `routing-${trace.id}`,
    taskType: trace.task_type || 'unknown',
    modelName: trace.model_name || trace.delegated_to || 'unknown',
    delegatedTo: trace.delegated_to || undefined,
    status: normalizeStatus(trace.quality_gate_passed),
    routingRule: trace.routing_rule || undefined,
    routingConfidence: trace.routing_confidence ?? undefined,
    latencyMs: trace.latency_ms ?? undefined,
    createdAt: normalizeDate(trace.created_at),
    source: 'routing_trace',
  };
}

function fromDecisionRow(row: DelegationDecisionProjectionRow): DelegationRun {
  const id = row.correlation_id || row.session_id || String(row.id);
  return {
    id,
    correlationId: row.correlation_id || id,
    sessionId: row.session_id || undefined,
    taskType: row.task_type || 'unknown',
    modelName: row.model_name || row.delegated_to || 'unknown',
    delegatedTo: row.delegated_to || undefined,
    status: normalizeStatus(row.quality_gate_passed),
    qualityGateDetail: row.quality_gate_detail || undefined,
    routingRule: row.routing_rule || undefined,
    routingConfidence: row.routing_confidence ?? undefined,
    latencyMs: row.latency_ms ?? undefined,
    createdAt: normalizeDate(row.created_at),
    source: 'decision_projection',
  };
}

function fromSavingsSession(session: DelegationSavingsSession): DelegationRun {
  return {
    id: session.session_id,
    correlationId: session.session_id,
    sessionId: session.session_id,
    taskType: session.task_type || 'unknown',
    modelName: session.model_name || 'unknown',
    status: 'projected',
    latencyMs: session.latency_ms,
    tokenCount: totalTokens(session),
    savingsUsd: session.savings_usd,
    estimatedCostUsd: session.cloud_cost_usd,
    pricingManifestVersion: session.pricing_manifest_version,
    createdAt: normalizeDate(session.created_at),
    source: 'savings_projection',
  };
}

function buildRuns(
  routing: DelegationModelRoutingProjection | null,
  decisions: DelegationDecisionProjectionRow[],
  savings: DelegationSavingsProjection | null,
): DelegationRun[] {
  const runs = new Map<string, DelegationRun>();

  for (const trace of routing?.decision_traces ?? []) {
    upsertRun(runs, fromRoutingTrace(trace));
  }
  for (const decision of decisions) {
    upsertRun(runs, fromDecisionRow(decision));
  }
  for (const session of savings?.sessions ?? []) {
    upsertRun(runs, fromSavingsSession(session));
  }

  return [...runs.values()].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
}

function capturedAt(row: unknown): string | undefined {
  if (typeof row !== 'object' || row === null) return undefined;
  const value = (row as { captured_at?: unknown }).captured_at;
  return typeof value === 'string' ? value : undefined;
}

function provisioned(row: unknown): boolean | null {
  if (typeof row !== 'object' || row === null || !('provisioned' in row)) return null;
  return Boolean((row as { provisioned?: unknown }).provisioned);
}

function probe<T>(
  key: string,
  label: string,
  topic: string,
  rows: T[] | undefined,
  isLoading: boolean,
  error: Error | null,
): DelegationProjectionProbe {
  const row = first(rows);
  return {
    key,
    label,
    topic,
    rowCount: rows?.length ?? 0,
    capturedAt: capturedAt(row),
    provisioned: provisioned(row),
    isLoading,
    error,
  };
}

export function useDelegationEvidenceSnapshot(): DelegationEvidenceSnapshot {
  const summaryQuery = useProjectionQuery<DelegationSummary>({
    queryKey: ['delegation-control-plane', 'summary'],
    topic: TOPICS.delegationSummary,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const decisionsQuery = useProjectionQuery<DelegationDecisionProjectionRow>({
    queryKey: ['delegation-control-plane', 'decisions'],
    topic: TOPICS.delegationDecisions,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const savingsQuery = useProjectionQuery<DelegationSavingsProjection>({
    queryKey: ['delegation-control-plane', 'savings'],
    topic: TOPICS.delegationSavings,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const routingQuery = useProjectionQuery<DelegationModelRoutingProjection>({
    queryKey: ['delegation-control-plane', 'model-routing'],
    topic: TOPICS.delegationModelRouting,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const qualityQuery = useProjectionQuery<DelegationQualityGateProjection>({
    queryKey: ['delegation-control-plane', 'quality-gate'],
    topic: TOPICS.delegationQualityGate,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const tokenQuery = useProjectionQuery<DelegationTokenUsageProjection>({
    queryKey: ['delegation-control-plane', 'token-usage'],
    topic: TOPICS.delegationTokenUsage,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  return useMemo(() => {
    const summary = first(summaryQuery.data);
    const savings = first(savingsQuery.data);
    const modelRouting = first(routingQuery.data);
    const qualityGate = first(qualityQuery.data);
    const tokenUsage = first(tokenQuery.data);
    let decisions: DelegationDecisionProjectionRow[] = [];
    if (decisionsQuery.data) {
      decisions = decisionsQuery.data;
    }
    const runs = buildRuns(modelRouting, decisions, savings);
    const probes = [
      probe('summary', 'Delegation Summary', TOPICS.delegationSummary, summaryQuery.data, summaryQuery.isLoading, summaryQuery.error as Error | null),
      probe('decisions', 'Decision Rows', TOPICS.delegationDecisions, decisionsQuery.data, decisionsQuery.isLoading, decisionsQuery.error as Error | null),
      probe('savings', 'Savings', TOPICS.delegationSavings, savingsQuery.data, savingsQuery.isLoading, savingsQuery.error as Error | null),
      probe('routing', 'Model Routing', TOPICS.delegationModelRouting, routingQuery.data, routingQuery.isLoading, routingQuery.error as Error | null),
      probe('quality', 'Quality Gate', TOPICS.delegationQualityGate, qualityQuery.data, qualityQuery.isLoading, qualityQuery.error as Error | null),
      probe('tokens', 'Token Usage', TOPICS.delegationTokenUsage, tokenQuery.data, tokenQuery.isLoading, tokenQuery.error as Error | null),
    ];
    const isLoading = probes.some((p) => p.isLoading);
    const primaryError = probes.find((p) => p.error)?.error ?? null;
    const hasAnyData =
      runs.length > 0 ||
      Boolean(summary && summary.totalDelegations > 0) ||
      Boolean(modelRouting && modelRouting.total_delegations > 0) ||
      Boolean(qualityGate && qualityGate.total_checks > 0) ||
      Boolean(tokenUsage && tokenUsage.total_tokens > 0) ||
      Boolean(savings && savings.session_count > 0);

    return {
      summary,
      savings,
      modelRouting,
      qualityGate,
      tokenUsage,
      decisions,
      runs,
      probes,
      hasAnyData,
      isLoading,
      primaryError,
    };
  }, [
    decisionsQuery.data,
    decisionsQuery.error,
    decisionsQuery.isLoading,
    qualityQuery.data,
    qualityQuery.error,
    qualityQuery.isLoading,
    routingQuery.data,
    routingQuery.error,
    routingQuery.isLoading,
    savingsQuery.data,
    savingsQuery.error,
    savingsQuery.isLoading,
    summaryQuery.data,
    summaryQuery.error,
    summaryQuery.isLoading,
    tokenQuery.data,
    tokenQuery.error,
    tokenQuery.isLoading,
  ]);
}
