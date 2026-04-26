import type { RoutingDecision } from '@/components/dashboard/routing/RoutingDecisionTable';

export interface BuildRoutingDecisionsOptions {
  /** Probability that a row's `agreement` is true. Default 0.7. */
  agreementRate?: number;
  /** Bias seed start to keep stories deterministic across re-renders. */
  seed?: number;
}

const LLM_AGENTS = ['claude-sonnet-4-6', 'deepseek-r1-32b', 'qwen3-coder-30b', 'gpt-5-mini'];
const FUZZY_AGENTS = ['claude-sonnet-4-6', 'deepseek-r1-32b', 'qwen3-coder-30b'];

/**
 * Build a deterministic-ish array of `RoutingDecision` rows.
 *
 * Determinism: a small linear-congruential RNG seeded by `opts.seed`
 * (default 42) keeps story renders stable across reloads. We stop
 * short of full reproducibility — the timestamps walk backwards from
 * "now" so visual reviewers can see plausibly-recent times.
 */
export function buildRoutingDecisions(
  count = 25,
  opts: BuildRoutingDecisionsOptions = {},
): RoutingDecision[] {
  const rate = opts.agreementRate ?? 0.7;
  let seed = opts.seed ?? 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  const out: RoutingDecision[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const llmAgent = LLM_AGENTS[i % LLM_AGENTS.length];
    const fuzzyAgent = FUZZY_AGENTS[(i + 1) % FUZZY_AGENTS.length];
    out.push({
      id: `routing-${i}`,
      created_at: new Date(now - i * 60_000).toISOString(),
      llm_agent: llmAgent,
      fuzzy_agent: fuzzyAgent,
      agreement: rand() < rate,
      llm_confidence: 0.5 + rand() * 0.5,
      fuzzy_confidence: 0.5 + rand() * 0.5,
      cost_usd: rand() * 0.1,
    });
  }
  return out;
}
