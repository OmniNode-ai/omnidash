import { Meter, TierMix, percent, type TierSegment, type TierShares } from '@/design-system/charts';
import { tierLabel } from './plain-text';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A served share as it is used here: a finite number between 0 and 1, or null when the row carries none. */
function fraction(value: unknown): number | null | 'out-of-range' {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value < 0 || value > 1 ? 'out-of-range' : value;
}

const SHARE_OFF_SCALE = 'A served tier share is not between 0 and 1, so the bar is not drawn';

/**
 * delegation.model-routing.v1's by_tier.tiers shaped for a bar (OMN-21015 U2): one segment per tier-routed tier, in
 * the order served, as wide as its served pct_of_tier_routed. That field is a fraction between 0 and 1 in the
 * runtime's views (count / tier_routed_total), whatever its name suggests. Nothing is recomputed from the counts. A
 * row that is not tier-routed is not a tier. A tier with no served share is left out and named. A share off the 0 to
 * 1 scale means the page and the runtime disagree about the unit, so the whole bar is refused rather than drawn wrong.
 */
export function tierShares(byTier: unknown): TierShares {
  const tiers = isRow(byTier) && Array.isArray(byTier.tiers) ? byTier.tiers.filter(isRow) : [];
  const segments: TierSegment[] = [];
  const unmeasured: string[] = [];
  for (const tier of tiers) {
    if (tier.tier_routed !== true && tier.tier_routed !== 1) continue;
    const name = String(tier.cost_tier_name ?? 'Not recorded');
    const share = fraction(tier.pct_of_tier_routed);
    if (share === 'out-of-range') return { refused: SHARE_OFF_SCALE };
    if (share === null) unmeasured.push(name);
    else segments.push({ name, share, count: tier.count });
  }
  return { segments, unmeasured };
}

/**
 * OMN-21015 U2: where the tier-routed runs landed, shaped from the served by_tier row and drawn by the kit's tier mix.
 * Shares that add up to more than the whole are refused by the chart, and a tier with no served share is named.
 */
export function TierShareChart({ byTier, variant = 'donut' }: { byTier: unknown; variant?: 'donut' | 'bars' }) {
  return <TierMix shares={tierShares(byTier)} nameOf={tierLabel} variant={variant} />;
}

/**
 * OMN-21015 U2: the quality view's served pass rate as a meter. It reads overall_pass_rate, a fraction between 0 and
 * 1, and nothing else: it is never passed over total worked out here. A rate that is not served, not a number, or off
 * that scale draws no meter; the field list beside it still says what was served.
 */
export function PassRateMeter({ row }: { row: Row | null }) {
  const rate = row ? fraction(row.overall_pass_rate) : null;
  if (rate === null || rate === 'out-of-range') return null;
  return <Meter className="local-meter" label="Quality pass rate" min={0} max={1} now={rate} share={rate} value={percent(rate)} fillTestId="pass-rate-fill" />;
}
