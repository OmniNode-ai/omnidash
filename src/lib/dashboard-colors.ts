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

export function tierColor(tier: string): string {
  if (!tier.trim() || /^(none|unknown(?: tier)?|not recorded)$/i.test(tier)) return 'var(--field-unavailable)';
  const concept = tierConcept(tier);
  return concept ? `var(--field-${concept})` : modelColor(`tier:${tier}`);
}
