import type { CostDataPoint } from '@/components/dashboard/cost-trend/CostTrendPanel';

export interface BuildCostDataPointsOptions {
  /** Specific list of model names to use. Default: 4 representative models. */
  models?: string[];
  /** Bucket granularity. Default `'hour'`. */
  granularity?: 'hour' | 'day';
  /** Anchor for the last bucket; default = now. */
  endTime?: number;
  /** RNG seed for deterministic story renders. Default 7. */
  seed?: number;
  /**
   * Cost magnitude per bucket per model (USD). Default 0.6 — produces
   * realistic-looking bands with the default 4 models.
   */
  costScale?: number;
}

const DEFAULT_MODELS = [
  'claude-sonnet-4-6',
  'gpt-5-mini',
  'deepseek-r1-32b',
  'qwen3-coder-30b',
];

/**
 * Build a deterministic-ish array of `CostDataPoint` rows. Each
 * (bucket × model) combination produces one row. With the default
 * `count=24` and 4 models, this returns ~96 rows — exactly the shape
 * the cost-trend widgets expect from `onex.snapshot.projection.llm_cost.v1`.
 *
 * `count` is the bucket count; the function always returns
 * `count * models.length` rows.
 */
export function buildCostDataPoints(
  count = 24,
  opts: BuildCostDataPointsOptions = {},
): CostDataPoint[] {
  const models = opts.models ?? DEFAULT_MODELS;
  const granularity = opts.granularity ?? 'hour';
  const endTime = opts.endTime ?? Date.now();
  const costScale = opts.costScale ?? 0.6;
  let seed = opts.seed ?? 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  const stepMs = granularity === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const out: CostDataPoint[] = [];

  for (let b = count - 1; b >= 0; b--) {
    const bucketDate = new Date(endTime - b * stepMs);
    // Truncate to the granularity floor so buckets line up cleanly on
    // the x-axis (the widget sorts by `bucket_time` string and assumes
    // identical timestamps for rows in the same bucket).
    if (granularity === 'hour') {
      bucketDate.setMinutes(0, 0, 0);
    } else {
      bucketDate.setHours(0, 0, 0, 0);
    }
    const bucketTime = bucketDate.toISOString();

    for (let m = 0; m < models.length; m++) {
      // Each model has its own cost profile via a different multiplier
      // so the stacked chart shows visible bands. Some bursts of
      // activity (rand() > 0.85) push a model's cost higher.
      const modelMult = 0.4 + (m + 1) * 0.18;
      const burst = rand() > 0.85 ? 2 + rand() * 1.5 : 1;
      const cost = costScale * modelMult * burst * (0.4 + rand() * 0.6);
      const totalTokens = Math.round(cost * 100_000 + rand() * 5_000);
      const promptTokens = Math.round(totalTokens * (0.6 + rand() * 0.2));
      const completionTokens = totalTokens - promptTokens;
      const requestCount = Math.max(1, Math.round(totalTokens / (1500 + rand() * 1000)));

      out.push({
        bucket_time: bucketTime,
        model_name: models[m],
        total_cost_usd: cost.toFixed(6),
        total_tokens: totalTokens,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        request_count: requestCount,
      });
    }
  }
  return out;
}
