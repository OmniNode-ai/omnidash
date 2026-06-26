// Model → tier derivation. The dashboard groups delegated work into three tiers
// (Local / Cheap cloud / Premium), but the projection does not carry a tier field
// — the per-tier routing ladder is dropped at the projection boundary today (see
// dashboard-data-sourcing.md). So tier is a heuristic over the model name. Keep it
// honest: it is an approximation, and unknown models fall back to "cheap" rather
// than silently inflating the "local/free" share.

export type Tier = 'local' | 'cheap' | 'premium';

export const TIER_LABEL: Record<Tier, string> = {
  local: 'Local (free)',
  cheap: 'Cheap cloud',
  premium: 'Premium',
};

export const TIER_ORDER: Tier[] = ['local', 'cheap', 'premium'];

// Frontier / premium cloud models (the expensive baseline tier).
const PREMIUM = /(opus|gpt-5|gpt-4(?!o-mini)\b|o3|o1|gemini-(1\.5|2\.5)-pro|grok-4)/i;
// Cheaper cloud models (metered, but well below frontier list price).
const CHEAP = /(haiku|mini|flash|gpt-4o|gpt-3\.5|sonnet|gemini.*flash|nano)/i;
// Models that run on local / self-hosted hardware (free at the margin).
const LOCAL = /(qwen|llama|mistral|deepseek|phi-|gemma|codestral|starcoder|local)/i;

/** Best-effort tier for a model name. Premium wins over cheap wins over local. */
export function tierForModel(modelName: string | null | undefined): Tier {
  const m = (modelName ?? '').toLowerCase();
  if (PREMIUM.test(m)) return 'premium';
  if (LOCAL.test(m)) return 'local';
  if (CHEAP.test(m)) return 'cheap';
  // Unknown model: assume metered cloud rather than free-local, so we never
  // overstate the free share. Surfaced as "Cheap cloud".
  return 'cheap';
}
