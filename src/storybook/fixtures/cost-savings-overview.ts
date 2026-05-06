import type {
  CostSavingsOverviewProjection,
  CostSavingsRow,
  ExecutionMode,
} from '@/components/dashboard/cost-savings-overview/CostSavingsOverviewWidget';

export interface BuildCostSavingsOverviewOptions {
  window?: '24h' | '7d' | '30d';
  includeWarnings?: boolean;
  provisioned?: boolean;
  localRatio?: number;
}

const MODELS: Array<{ id: string; name: string; mode: ExecutionMode; baseCost: number }> = [
  { id: 'qwen3-coder-30b', name: 'Qwen3-Coder-30B', mode: 'local', baseCost: 0.2 },
  { id: 'deepseek-r1-32b', name: 'DeepSeek-R1-32B', mode: 'local', baseCost: 0.15 },
  { id: 'qwen3-next-80b', name: 'Qwen3-Next-80B', mode: 'delegated', baseCost: 0.1 },
  { id: 'claude-sonnet-4-5', name: 'Claude-Sonnet-4-5', mode: 'cloud', baseCost: 0 },
  { id: 'glm-4-plus', name: 'GLM-4-Plus', mode: 'market', baseCost: 0 },
  { id: 'deepseek-r1-14b', name: 'DeepSeek-R1-14B', mode: 'workflow_child', baseCost: 0.08 },
];

export function buildCostSavingsOverview(
  opts: BuildCostSavingsOverviewOptions = {},
): CostSavingsOverviewProjection {
  const { window = '7d', includeWarnings = false, provisioned = false, localRatio = 0.75 } = opts;

  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  const rows: CostSavingsRow[] = MODELS.map((m) => {
    const taskCount = Math.round(50 + rand() * 400);
    const tokensPerTask = Math.round(5000 + rand() * 20000);
    const tokensTotal = taskCount * tokensPerTask;
    const isLocal = m.mode === 'local' || m.mode === 'delegated' || m.mode === 'workflow_child';
    const cloudRatePerToken = 0.000004 + rand() * 0.000006;
    const costUsd = isLocal ? 0 : taskCount * cloudRatePerToken * tokensPerTask;
    const baselineCostUsd = taskCount * cloudRatePerToken * tokensPerTask;
    const savingsUsd = Math.max(0, baselineCostUsd - costUsd);
    const savingsPct = baselineCostUsd > 0 ? savingsUsd / baselineCostUsd : 0;

    return {
      model_id: m.id,
      display_name: m.name,
      execution_mode: m.mode,
      task_count: taskCount,
      tokens_total: tokensTotal,
      cost_usd: Number(costUsd.toFixed(4)),
      baseline_cost_usd: Number(baselineCostUsd.toFixed(4)),
      savings_usd: Number(savingsUsd.toFixed(4)),
      savings_pct: Number(savingsPct.toFixed(4)),
      runtime_address: isLocal ? `192.168.86.${200 + (MODELS.indexOf(m) % 3)}` : null,
      evidence_ref: savingsUsd > 0 ? `OMN-10346/evidence/${m.id}` : null,
    };
  });

  const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0);
  const totalBaseline = rows.reduce((s, r) => s + r.baseline_cost_usd, 0);
  const totalSavings = Math.max(0, totalBaseline - totalCost);
  const savingsRate = totalBaseline > 0 ? totalSavings / totalBaseline : 0;
  const tokensTotal = rows.reduce((s, r) => s + r.tokens_total, 0);

  const warnings = includeWarnings
    ? [
        'Baseline cost is estimated from cloud list pricing — actual avoided cost may differ.',
        'Delegated executions excluded from savings calculation pending OMN-10345.',
      ]
    : [];

  return {
    window,
    total_cost_usd: Number(totalCost.toFixed(2)),
    total_baseline_cost_usd: Number(totalBaseline.toFixed(2)),
    total_savings_usd: Number(totalSavings.toFixed(2)),
    savings_rate: Number(savingsRate.toFixed(4)),
    tokens_total: tokensTotal,
    local_token_pct: localRatio,
    captured_at: new Date('2026-05-05T12:00:00Z').toISOString(),
    rows,
    warnings,
    provisioned,
  };
}

export function buildCostSavingsOverviewEmpty(): CostSavingsOverviewProjection[] {
  return [];
}
