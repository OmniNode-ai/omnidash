import type { DelegationSummary } from '@/components/dashboard/delegation/DelegationMetrics';
import type { DelegationSavingsProjection } from '@/components/dashboard/delegation/DelegationSavingsWidget';
import type { DelegationModelRoutingProjection } from '@/components/dashboard/delegation/DelegationModelRoutingWidget';
import type { DelegationQualityGateProjection } from '@/components/dashboard/delegation/DelegationQualityGateWidget';
import type { DelegationTokenUsageProjection } from '@/components/dashboard/delegation/DelegationTokenUsageWidget';

export type DelegationEvidenceTabId =
  | 'projection'
  | 'event-chain'
  | 'runtime-topology'
  | 'evidence-bundle';

export interface DelegationControlPlaneConfig {
  defaultTab?: DelegationEvidenceTabId;
  maxRuns?: number;
}

export interface DelegationDecisionProjectionRow {
  id: string | number;
  correlation_id?: string | null;
  session_id?: string | null;
  task_type?: string | null;
  model_name?: string | null;
  delegated_to?: string | null;
  routing_rule?: string | null;
  routing_confidence?: number | null;
  latency_ms?: number | null;
  quality_gate_passed?: boolean | number | null;
  quality_gate_detail?: string | null;
  created_at?: string | number | null;
}

export type DelegationRunStatus = 'passed' | 'failed' | 'projected';
export type DelegationRunSource = 'routing_trace' | 'decision_projection' | 'savings_projection';

export interface DelegationRun {
  id: string;
  correlationId: string;
  sessionId?: string;
  taskType: string;
  modelName: string;
  delegatedTo?: string;
  status: DelegationRunStatus;
  qualityGateDetail?: string;
  routingRule?: string;
  routingConfidence?: number;
  latencyMs?: number;
  tokenCount?: number;
  savingsUsd?: number;
  estimatedCostUsd?: number;
  pricingManifestVersion?: string;
  createdAt?: string;
  source: DelegationRunSource;
}

export interface DelegationProjectionProbe {
  key: string;
  label: string;
  topic: string;
  rowCount: number;
  capturedAt?: string;
  provisioned: boolean | null;
  isLoading: boolean;
  error: Error | null;
}

export interface DelegationEvidenceSnapshot {
  summary: DelegationSummary | null;
  savings: DelegationSavingsProjection | null;
  modelRouting: DelegationModelRoutingProjection | null;
  qualityGate: DelegationQualityGateProjection | null;
  tokenUsage: DelegationTokenUsageProjection | null;
  decisions: DelegationDecisionProjectionRow[];
  runs: DelegationRun[];
  probes: DelegationProjectionProbe[];
  hasAnyData: boolean;
  isLoading: boolean;
  primaryError: Error | null;
}
