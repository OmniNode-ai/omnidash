// Display tier buckets for delegated work. The AUTHORITATIVE tier is truth from
// the routing decision: it is carried on the delegation terminal event and
// persisted as `cost_tier_name` on the delegation projection (decisions.v1 /
// correlation-trace.v1, OMN-13649). This module only maps that authoritative tier
// enum onto the three display buckets the dashboard renders — it NEVER derives
// the tier from a model name (the old client-side model-name regex was deleted
// in OMN-13649 because client-side classification of truth violates the doctrine).

export type Tier = 'local' | 'cheap' | 'premium';

export const TIER_LABEL: Record<Tier, string> = {
  local: 'Local (free)',
  cheap: 'Cheap cloud',
  premium: 'Premium',
};

export const TIER_ORDER: Tier[] = ['local', 'cheap', 'premium'];

/**
 * Map the projection's authoritative `cost_tier_name` (the routing/cost tier:
 * `local` | `cheap_cloud` | `cheap_frontier` | `claude`) onto a display bucket.
 * This is a presentation grouping of an authoritative enum, not a heuristic over
 * the model name. An unknown/unset tier falls back to "cheap" rather than
 * silently inflating the free-local share.
 */
export function tierFromCostTier(costTierName: string | null | undefined): Tier {
  switch ((costTierName ?? '').toLowerCase()) {
    case 'local':
      return 'local';
    case 'cheap_cloud':
    case 'cheap_frontier':
      return 'cheap';
    case 'claude':
    case 'premium':
    case 'frontier':
      return 'premium';
    default:
      return 'cheap';
  }
}
