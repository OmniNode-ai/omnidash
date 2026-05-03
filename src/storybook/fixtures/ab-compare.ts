import type { AbCompareRow } from '@/components/dashboard/ab-compare/AbCompareWidget';

export interface BuildAbCompareRowsOptions {
  /** Number of models per run. Default 4. */
  modelCount?: number;
  /** Number of past runs to include (each with a distinct correlation_id). Default 1. */
  runCount?: number;
  /** Include at least one model with estimated_cost_usd = 0 (local model). Default true. */
  includeLocalModel?: boolean;
  /** Include one row with nullable optional metrics. Default false. */
  includeUnknownCost?: boolean;
}

const MODEL_CATALOGUE: Array<{ key: string; name: string; costPerToken: number }> = [
  { key: 'qwen3-coder-30b',    name: 'Qwen3-Coder-30B',      costPerToken: 0 },
  { key: 'deepseek-r1-14b',    name: 'DeepSeek-R1-14B',      costPerToken: 0 },
  { key: 'claude-sonnet-4-6',  name: 'Claude Sonnet 4.6',    costPerToken: 3e-6 },
  { key: 'gpt-4o',             name: 'GPT-4o',               costPerToken: 5e-6 },
  { key: 'gemini-1-5-pro',     name: 'Gemini 1.5 Pro',       costPerToken: 3.5e-6 },
];

/**
 * Build deterministic `AbCompareRow[]` fixture data.
 *
 * Determinism: rows are seeded off the model catalogue and index so
 * story renders stay stable across reloads. Timestamps walk backward
 * from "now" per run so the latest run sorts first.
 */
export function buildAbCompareRows(opts: BuildAbCompareRowsOptions = {}): AbCompareRow[] {
  const {
    modelCount = 4,
    runCount = 1,
    includeLocalModel = true,
    includeUnknownCost = false,
  } = opts;

  const models = MODEL_CATALOGUE.slice(0, modelCount);
  if (includeLocalModel && !models.some((m) => m.costPerToken === 0)) {
    // Ensure at least one local model
    models[0] = MODEL_CATALOGUE[0];
  }

  const rows: AbCompareRow[] = [];
  const now = Date.now();

  for (let r = 0; r < runCount; r++) {
    const correlationId = `run-${r + 1}`;
    const runBase = now - r * 600_000; // runs spaced 10 min apart

    for (let m = 0; m < models.length; m++) {
      const model = models[m];
      const promptTokens = 512 + m * 64;
      const completionTokens = 256 + m * 32;
      const totalTokens = promptTokens + completionTokens;
      const costUsd = model.costPerToken * totalTokens;
      const latencyMs = 800 + m * 350 + (model.costPerToken === 0 ? 1200 : 0);
      const hasUnknownCost = includeUnknownCost && m === models.length - 1;

      rows.push({
        correlation_id: correlationId,
        model_id: model.key,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: hasUnknownCost ? null : costUsd,
        latency_ms: hasUnknownCost ? null : latencyMs,
        usage_source: hasUnknownCost ? null : m % 2 === 0 ? 'router' : 'gateway',
        created_at: new Date(runBase - m * 5_000).toISOString(),
      });
    }
  }

  return rows;
}
