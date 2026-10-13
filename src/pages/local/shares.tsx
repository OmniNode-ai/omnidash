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

/** A fraction as a percentage with one decimal, the way Run locally already shows its served share. */
function percent(share: number): string {
  return share.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export interface TierSegment {
  name: string;
  /** The served pct_of_tier_routed: a fraction of the tier-routed runs, between 0 and 1. */
  share: number;
  count: unknown;
}

export type TierShares =
  | { segments: TierSegment[]; unmeasured: string[] }
  | { refused: string };

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

/** The tiers the runtime names today get a fixed colour each; any other tier gets the neutral one. */
const TIER_TONES: Record<string, string> = {
  local: 'local',
  cheap_frontier: 'economy',
  cheap_cloud: 'economy',
  cloud: 'balanced',
  claude: 'frontier',
  frontier: 'frontier',
};

/**
 * OMN-21015 U2: where the tier-routed runs landed, as one bar. Each segment is a served share; the list under it
 * names every segment with its share and its served run count, so the bar adds no figure of its own.
 */
export function TierShareBar({ byTier }: { byTier: unknown }) {
  const shaped = tierShares(byTier);
  if ('refused' in shaped) return <p className="local-dashboard-empty" role="status">{shaped.refused}</p>;
  if (shaped.segments.length === 0 && shaped.unmeasured.length === 0) return null;
  return (
    <div className="local-share">
      {shaped.segments.length > 0 && (
        <>
          <div className="local-share-bar" role="img" aria-label={`Tier mix: ${shaped.segments.map((s) => `${s.name} ${percent(s.share)}`).join(', ')}`}>
            {shaped.segments.map((segment, index) => (
              <span
                className="local-share-segment"
                data-testid="tier-segment"
                data-tier={segment.name}
                data-tone={TIER_TONES[segment.name] ?? 'other'}
                key={`${segment.name}-${index}`}
                style={{ width: `${segment.share * 100}%` }}
                title={`${segment.name}: ${percent(segment.share)} of tier-routed runs`}
              />
            ))}
          </div>
          <ul className="local-share-legend">
            {shaped.segments.map((segment, index) => (
              <li key={`${segment.name}-${index}`}>
                <span className="local-share-swatch" data-tone={TIER_TONES[segment.name] ?? 'other'} aria-hidden="true" />
                <span>{segment.name}</span>
                <span className="local-share-value">{percent(segment.share)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {shaped.unmeasured.length > 0 && (
        <p className="local-dashboard-caption">{`No share served for: ${shaped.unmeasured.join(', ')}`}</p>
      )}
    </div>
  );
}

/**
 * OMN-21015 U2: the quality view's served pass rate as a meter. It reads overall_pass_rate, a fraction between 0 and
 * 1, and nothing else: it is never passed over total worked out here. A rate that is not served, not a number, or off
 * that scale draws no meter; the field list beside it still says what was served.
 */
export function PassRateMeter({ row }: { row: Row | null }) {
  const rate = row ? fraction(row.overall_pass_rate) : null;
  if (rate === null || rate === 'out-of-range') return null;
  return (
    <div className="local-meter" role="meter" aria-label="Quality pass rate" aria-valuemin={0} aria-valuemax={1} aria-valuenow={rate}>
      <div className="local-meter-track">
        <span className="local-meter-fill" data-testid="pass-rate-fill" style={{ width: `${rate * 100}%` }} />
      </div>
      <span className="local-meter-value">{percent(rate)}</span>
    </div>
  );
}
