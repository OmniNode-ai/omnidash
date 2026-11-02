/** Exact served model identity, preserving case and independent of position or filtering. Presentation only. */
export function modelColor(model: string): string {
  if (!model.trim() || /^(none|unknown(?: model)?|not recorded)$/i.test(model)) {
    return 'var(--field-unavailable)';
  }
  let hash = 2166136261;
  for (let index = 0; index < model.length; index += 1) {
    hash = Math.imul(hash ^ model.charCodeAt(index), 16777619) >>> 0;
  }
  const hue = (hash % 36000) / 100;
  return `oklch(var(--model-identity-lightness, 46%) 0.13 ${hue})`;
}

/** Canonical presentation for the runtime's named tiers; exact IDs are never case-folded. */
const TIER_CONCEPTS: Readonly<Record<string, string>> = {
  local: 'tier-local', harness: 'tier-harness', cheap_frontier: 'tier-cheap-frontier',
  cheap_cloud: 'tier-cheap-cloud', cloud: 'tier-cloud', claude: 'tier-claude',
  frontier: 'tier-frontier', customer_keys: 'tier-customer-keys',
};

export function tierConcept(tier: string): string | null {
  return Object.hasOwn(TIER_CONCEPTS, tier) ? TIER_CONCEPTS[tier] : null;
}

/**
 * OMN-21970 AC5, AC6: each tier's colour token, from the product owner's palette. cheap_frontier and cheap_cloud, which
 * the palette does not name, share their family's colour; every other tier, and a missing one, is none. No tier is ever
 * coloured by a hash of its name.
 */
const TIER_COLOR_TOKENS: Readonly<Record<string, string>> = {
  local: 'tier-local', harness: 'tier-harness', frontier: 'tier-frontier', cheap_frontier: 'tier-frontier',
  cloud: 'tier-cloud', cheap_cloud: 'tier-cloud', claude: 'tier-claude', customer_keys: 'tier-customer-keys',
};

export function tierColor(tier: string): string {
  const token = Object.hasOwn(TIER_COLOR_TOKENS, tier) ? TIER_COLOR_TOKENS[tier] : 'tier-none';
  return `var(--field-${token})`;
}

/** The served model name a row carries, under whichever field its exposure names it. */
function rowModel(row: Readonly<Record<string, unknown>>): string | null {
  for (const field of ['model_name', 'model_id', 'model']) {
    const value = row[field];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

/**
 * OMN-21970 AC5: each served model's tier, the one most of the rows that name it carry (ties go to the tier named
 * first in palette order, so row order never changes a colour). Presentation only: built from served fields, owns
 * nothing.
 */
export function modelTiersFrom(rows: readonly unknown[]): ReadonlyMap<string, string> {
  const counts = new Map<string, Map<string, number>>();
  const add = (model: string, tier: unknown, weight: number) => {
    if (typeof tier !== 'string' || tier.trim() === '' || !(weight > 0)) return;
    const tiers = counts.get(model) ?? new Map<string, number>();
    tiers.set(tier, (tiers.get(tier) ?? 0) + weight);
    counts.set(model, tiers);
  };
  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const model = rowModel(row);
    if (model !== null) add(model, row.cost_tier_name, 1);
    // The model-routing row: every tier's models over the whole history, each weighted by its run count, so a model
    // seen only in runs older than the newest decisions page still takes its tier's colour.
    const byTier = row.by_tier as { tiers?: unknown } | null | undefined;
    if (byTier && Array.isArray(byTier.tiers)) {
      for (const entry of byTier.tiers as Array<Record<string, unknown>>) {
        if (!entry || !Array.isArray(entry.models)) continue;
        for (const item of entry.models as Array<Record<string, unknown>>) {
          const name = item && typeof item.model_name === 'string' ? item.model_name : null;
          if (name) add(name, entry.cost_tier_name, typeof item.count === 'number' ? item.count : 1);
        }
      }
    }
  }
  const order = Object.keys(TIER_COLOR_TOKENS);
  const rank = (tier: string) => (order.includes(tier) ? order.indexOf(tier) : order.length);
  const result = new Map<string, string>();
  for (const [model, tiers] of counts) {
    const [best] = [...tiers].sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
    result.set(model, best[0]);
  }
  return result;
}

/** OMN-21970 AC5: a model's colour is its tier's colour; a model no row places in a tier is none. */
export function modelTierColor(model: string, tiers: ReadonlyMap<string, string>): string {
  return tierColor(tiers.get(model) ?? 'none');
}
