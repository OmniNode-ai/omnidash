import type { DelegationSavingsProjection, DelegationSavingsSession } from '@/components/dashboard/delegation/delegation-savings.types';
import type { DelegationModelRoutingProjection } from '@/components/dashboard/delegation/DelegationModelRoutingWidget';
import type { DelegationQualityGateProjection } from '@/components/dashboard/delegation/DelegationQualityGateWidget';
import type { DelegationTokenUsageProjection, TokenProvenance } from '@/components/dashboard/delegation/DelegationTokenUsageWidget';
import type { InferenceResponseProjection } from '@/components/dashboard/delegation/DelegationModelOutputWidget';

// ── Savings fixtures ──────────────────────────────────────────────────

export interface BuildDelegationSavingsOptions {
  sessionCount?: number;
  baselineModel?: string;
  /** @deprecated use baselineModel */
  baselinModel?: string;
  pricingManifestVersion?: string;
  provisioned?: boolean;
}

const SESSION_IDS = [
  'sess_a1b2c3d4e5f6',
  'sess_b2c3d4e5f6a1',
  'sess_c3d4e5f6a1b2',
  'sess_d4e5f6a1b2c3',
  'sess_e5f6a1b2c3d4',
];

const SESSION_TASK_TYPES = ['code-review', 'pattern-match', 'document-summarize', 'classification', 'code-review'];
const SESSION_MODELS = ['qwen3-coder-30b', 'deepseek-r1-14b', 'qwen3-coder-30b', 'openrouter-glm-flash', 'claude-sonnet-4-6'];

export function buildDelegationSavings(opts: BuildDelegationSavingsOptions = {}): DelegationSavingsProjection {
  const {
    sessionCount = 5,
    baselineModel,
    baselinModel,
    pricingManifestVersion = 'v2026-05-01',
    provisioned = false,
  } = opts;
  const resolvedBaselineModel = baselineModel ?? baselinModel ?? 'claude-sonnet-4-6';

  let seed = 77;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  const sessions: DelegationSavingsSession[] = Array.from({ length: Math.min(sessionCount, SESSION_IDS.length) }, (_, i) => {
    const localCost = rand() * 0.05;
    const cloudCost = 0.08 + rand() * 0.25;
    const promptTokens = Math.round(800 + rand() * 3200);
    const completionTokens = Math.round(200 + rand() * 800);
    return {
      session_id: SESSION_IDS[i],
      task_type: SESSION_TASK_TYPES[i],
      model_name: SESSION_MODELS[i],
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      latency_ms: Math.round(400 + rand() * 2600),
      local_cost_usd: Number(localCost.toFixed(4)),
      cloud_cost_usd: Number(cloudCost.toFixed(4)),
      savings_usd: Number(Math.max(0, cloudCost - localCost).toFixed(4)),
      baseline_model: resolvedBaselineModel,
      pricing_manifest_version: pricingManifestVersion,
      savings_method: 'estimated' as const,
      usage_source: (rand() > 0.5 ? 'measured' : 'estimated') as 'measured' | 'estimated',
      created_at: new Date(2026, 4, 5 - i, 10, 0, 0).toISOString(),
    };
  });

  const cumulativeSavings = sessions.reduce((s, r) => s + r.savings_usd, 0);
  const cumulativeLocalCost = sessions.reduce((s, r) => s + r.local_cost_usd, 0);
  const cumulativeCloudCost = sessions.reduce((s, r) => s + r.cloud_cost_usd, 0);

  return {
    cumulative_savings_usd: Number(cumulativeSavings.toFixed(4)),
    cumulative_local_cost_usd: Number(cumulativeLocalCost.toFixed(4)),
    cumulative_cloud_cost_usd: Number(cumulativeCloudCost.toFixed(4)),
    baseline_model: resolvedBaselineModel,
    pricing_manifest_version: pricingManifestVersion,
    session_count: sessions.length,
    sessions,
    captured_at: new Date('2026-05-05T12:00:00Z').toISOString(),
    provisioned,
  };
}

// ── Model routing fixtures ────────────────────────────────────────────

export interface BuildDelegationModelRoutingOptions {
  provisioned?: boolean;
}

const ROUTING_MODELS = ['qwen3-coder-30b', 'deepseek-r1-14b', 'openrouter-glm-flash', 'claude-sonnet-4-6'];
const TASK_TYPES = ['code-review', 'classification', 'summarization', 'pattern-match'];

export function buildDelegationModelRouting(
  opts: BuildDelegationModelRoutingOptions = {},
): DelegationModelRoutingProjection {
  const { provisioned = false } = opts;

  let seed = 33;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  const modelWeights = [0.45, 0.30, 0.15, 0.10];
  const totalDelegations = 312;

  const by_model = ROUTING_MODELS.map((model, i) => ({
    model_name: model,
    total_count: Math.round(modelWeights[i] * totalDelegations),
    pct_of_total: modelWeights[i],
    top_task_type: TASK_TYPES[0],
    avg_latency_ms: Math.round(300 + rand() * 2200),
    qg_pass_rate: Number((0.70 + rand() * 0.28).toFixed(2)),
    task_types: TASK_TYPES.slice(0, i < 2 ? 4 : 2),
  }));

  const rows = ROUTING_MODELS.flatMap((model_name, mi) => {
    const modelTotal = by_model[mi].total_count;
    const taskWeights = TASK_TYPES.map(() => rand());
    const taskWeightSum = taskWeights.reduce((a, b) => a + b, 0);
    const normalized = taskWeights.map((w) => w / taskWeightSum);
    let assigned = 0;
    return TASK_TYPES.map((task_type, ti) => {
      const count =
        ti === TASK_TYPES.length - 1
          ? modelTotal - assigned
          : Math.round(normalized[ti] * modelTotal);
      assigned += count;
      return {
        model_name,
        task_type,
        count,
        pct_of_model: normalized[ti],
        pct_of_total: count / totalDelegations,
      };
    });
  });

  return {
    total_delegations: totalDelegations,
    rows,
    by_model,
    captured_at: new Date('2026-05-05T12:00:00Z').toISOString(),
    provisioned,
  };
}

// ── Quality gate fixtures ─────────────────────────────────────────────

export interface BuildDelegationQualityGateOptions {
  overallPassRate?: number;
  includeEscalations?: boolean;
  provisioned?: boolean;
  /**
   * If true (default), populate tokens-to-compliance KPIs (OMN-10795). When false,
   * the projection omits compliance fields entirely — useful for testing the
   * widget's optional-field handling.
   */
  includeComplianceMetrics?: boolean;
}

export function buildDelegationQualityGate(
  opts: BuildDelegationQualityGateOptions = {},
): DelegationQualityGateProjection {
  const {
    overallPassRate = 0.87,
    includeEscalations = true,
    provisioned = false,
    includeComplianceMetrics = true,
  } = opts;

  const totalChecks = 480;
  const totalPassed = Math.round(overallPassRate * totalChecks);
  const totalFailed = totalChecks - totalPassed;
  const escalationCount = includeEscalations ? Math.round(totalFailed * 0.25) : 0;

  const safeOverall = Math.max(0, Math.min(1, overallPassRate));
  const detRate = Math.min(1, safeOverall + 0.05);
  const detTotal = Math.round(totalChecks * 0.65);
  const heuTotal = totalChecks - detTotal;
  const detPassed = Math.min(totalPassed, Math.round(detRate * detTotal));
  const detFailed = detTotal - detPassed;
  const heuPassed = Math.max(0, totalPassed - detPassed);
  const heuFailed = Math.max(0, totalFailed - detFailed);

  return {
    overall_pass_rate: safeOverall,
    total_passed: totalPassed,
    total_failed: totalFailed,
    total_checks: totalChecks,
    escalation_count: escalationCount,
    escalation_rate: escalationCount / totalChecks,
    by_check_type: [
      {
        check_type: 'deterministic',
        passed: detPassed,
        failed: detFailed,
        total: detTotal,
        pass_rate: detTotal > 0 ? detPassed / detTotal : 0,
      },
      {
        check_type: 'heuristic',
        passed: heuPassed,
        failed: heuFailed,
        total: heuTotal,
        pass_rate: heuTotal > 0 ? heuPassed / heuTotal : 0,
      },
    ],
    failure_categories: [
      { category: 'output_too_short', count: Math.round(totalFailed * 0.38), pct_of_failures: 0.38 },
      { category: 'missing_citations', count: Math.round(totalFailed * 0.27), pct_of_failures: 0.27 },
      { category: 'hallucinated_identifiers', count: Math.round(totalFailed * 0.20), pct_of_failures: 0.20 },
      { category: 'timeout_exceeded', count: Math.round(totalFailed * 0.15), pct_of_failures: 0.15 },
    ],
    ...(includeComplianceMetrics
      ? {
          avg_tokens_to_compliance: 4_280,
          median_tokens_to_compliance: 3_950,
          avg_compliance_attempts: 1.32,
          tokens_to_compliance_by_model: [
            { model_name: 'qwen3-coder-30b', avg_tokens: 3_120, avg_attempts: 1.18, sample_count: 142 },
            { model_name: 'deepseek-r1-14b', avg_tokens: 4_640, avg_attempts: 1.34, sample_count: 96 },
            { model_name: 'openrouter-glm-flash', avg_tokens: 5_280, avg_attempts: 1.51, sample_count: 64 },
            { model_name: 'claude-sonnet-4-6', avg_tokens: 6_910, avg_attempts: 1.78, sample_count: 38 },
          ],
        }
      : {}),
    captured_at: new Date('2026-05-05T12:00:00Z').toISOString(),
    provisioned,
  };
}

// ── Token usage fixtures ──────────────────────────────────────────────

export interface BuildDelegationTokenUsageOptions {
  provisioned?: boolean;
}

const TOKEN_MODELS: Array<{ id: string; name: string; promptRatio: number; costPerToken: number; provenance: TokenProvenance }> = [
  { id: 'qwen3-coder-30b', name: 'qwen3-coder-30b', promptRatio: 0.78, costPerToken: 0, provenance: 'measured' },
  { id: 'deepseek-r1-14b', name: 'deepseek-r1-14b', promptRatio: 0.72, costPerToken: 0.000003, provenance: 'measured' },
  { id: 'openrouter-glm-flash', name: 'openrouter-glm-flash', promptRatio: 0.68, costPerToken: 0.0000015, provenance: 'estimated' },
  { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', promptRatio: 0.65, costPerToken: 0.000002, provenance: 'estimated' },
];

export function buildDelegationTokenUsage(
  opts: BuildDelegationTokenUsageOptions = {},
): DelegationTokenUsageProjection {
  const { provisioned = false } = opts;

  let seed = 55;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  const by_model = TOKEN_MODELS.map((m) => {
    const total = Math.round(50_000 + rand() * 400_000);
    const prompt = Math.round(total * m.promptRatio);
    const completion = total - prompt;
    return {
      model_id: m.id,
      model_name: m.name,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total,
      estimated_cost_usd: Number((total * m.costPerToken).toFixed(4)),
      usage_source: m.provenance,
      token_provenance: m.provenance,
    };
  });

  const totalPrompt = by_model.reduce((s, r) => s + r.prompt_tokens, 0);
  const totalCompletion = by_model.reduce((s, r) => s + r.completion_tokens, 0);
  const totalTokens = by_model.reduce((s, r) => s + r.total_tokens, 0);
  const totalCost = by_model.reduce((s, r) => s + r.estimated_cost_usd, 0);

  const provenanceSummary: Record<TokenProvenance, number> = { measured: 0, estimated: 0, unknown: 0 };
  for (const r of by_model) provenanceSummary[r.token_provenance]++;

  return {
    total_prompt_tokens: totalPrompt,
    total_completion_tokens: totalCompletion,
    total_tokens: totalTokens,
    total_estimated_cost_usd: Number(totalCost.toFixed(4)),
    provenance_summary: provenanceSummary,
    by_model,
    captured_at: new Date('2026-05-05T12:00:00Z').toISOString(),
    provisioned,
  };
}

// ── Inference response fixtures (OMN-12745) ───────────────────────────

export interface BuildInferenceResponseOptions {
  provisioned?: boolean;
  responseCount?: number;
}

export function buildInferenceResponseProjection(
  opts: BuildInferenceResponseOptions = {},
): InferenceResponseProjection {
  const { provisioned = false, responseCount = 3 } = opts;

  const responses = [
    {
      correlation_id: 'corr-a1b2c3d4e5f6',
      model_name: 'qwen3-coder-30b',
      task_type: 'code-review',
      generated_text:
        'The delegation routing logic in node_router_delegation correctly selects the cheapest local model first. The quality-gate threshold of 0.87 is within acceptable bounds. No critical issues found.',
      prompt_tokens: 144,
      completion_tokens: 62,
      latency_ms: 1840,
      captured_at: new Date('2026-05-05T11:59:30Z').toISOString(),
    },
    {
      correlation_id: 'corr-b2c3d4e5f6a1',
      model_name: 'deepseek-r1-14b',
      task_type: 'summarization',
      generated_text:
        'Summary: The SEA demo pipeline executed 312 delegations across 4 models with an 87% quality gate pass rate. Local inference handled 75% of requests, saving an estimated $0.43 vs cloud-only routing.',
      prompt_tokens: 210,
      completion_tokens: 54,
      latency_ms: 2310,
      captured_at: new Date('2026-05-05T11:58:10Z').toISOString(),
    },
    {
      correlation_id: 'corr-c3d4e5f6a1b2',
      model_name: 'openrouter-glm-flash',
      task_type: 'classification',
      generated_text:
        'Classification result: task_type=code-review, confidence=0.94, routing_rule=exploit:best-latency. Delegated to qwen3-coder-30b.',
      prompt_tokens: 88,
      completion_tokens: 28,
      latency_ms: 920,
      captured_at: new Date('2026-05-05T11:57:00Z').toISOString(),
    },
  ].slice(0, Math.min(responseCount, 3));

  const latest = responses[0];

  return {
    latest_correlation_id: latest.correlation_id,
    latest_model_name: latest.model_name,
    latest_task_type: latest.task_type,
    latest_generated_text: latest.generated_text,
    latest_prompt_tokens: latest.prompt_tokens,
    latest_completion_tokens: latest.completion_tokens,
    latest_latency_ms: latest.latency_ms,
    source_topic: 'onex.evt.omnibase-infra.inference-response.v1',
    recent_responses: responses,
    captured_at: new Date('2026-05-05T12:00:00Z').toISOString(),
    provisioned,
  };
}
