import { formatDashboardCount } from '@/lib/dashboard-count';
import { tierLabel } from './plain-text';
import { useEffect, useState, type CSSProperties } from 'react';
import { tierColor } from '@/lib/dashboard-colors';

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

/**
 * A fraction as a percentage with one decimal, the way Run locally already shows its served share. A share above zero
 * is never written as 0.0%, and one below the whole never as 100.0%: where rounding would say so, it reads <0.1% or
 * >99.9% instead. Exactly 0 and exactly 1 are written as they are.
 */
/** A served share as a percent to one decimal; a share above zero never reads 0.0% and one below the whole never 100.0%. */
export function percent(share: number): string {
  const written = share.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (share > 0 && written === '0.0%') return '<0.1%';
  if (share < 1 && written === '100.0%') return '>99.9%';
  return written;
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

/** Legacy CSS hook names; actual colour is resolved from the exact served tier identity. */
export const TIER_TONES: Readonly<Record<string, string>> = {
  local: 'local',
  harness: 'harness',
  cheap_frontier: 'cheap-frontier',
  cheap_cloud: 'cheap-cloud',
  cloud: 'balanced',
  claude: 'claude',
  frontier: 'frontier',
  customer_keys: 'customer-keys',
};

const tierStyle = (name: string) => ({ '--tier-color': tierColor(name) }) as CSSProperties;

export const SHARES_OVER_WHOLE = 'The served tier shares add up to more than the whole, so the chart is not drawn';

/** The ring the slices are drawn on, in the units of the 42 x 42 drawing: its centre and its radius. */
const RING_CENTRE = 21;
const RING_RADIUS = 15.915494;
/** Shares are served as decimals; this much over 1 is rounding in the runtime's division, not a second whole. */
const WHOLE_TOLERANCE = 1e-6;

/** A number written without float noise (0.1 + 0.2 is 0.3, not 0.30000000000000004). */
function units(value: number): number {
  return Number(value.toFixed(6));
}

/** The point of the ring `turn` of the way round, clockwise from twelve o'clock. */
function ringPoint(turn: number): string {
  const angle = turn * 2 * Math.PI;
  return `${units(RING_CENTRE + RING_RADIUS * Math.sin(angle))} ${units(RING_CENTRE - RING_RADIUS * Math.cos(angle))}`;
}

/**
 * The arc of one slice: from `start` of a turn, clockwise, for `sweep` of a turn. A slice is a real arc and not a
 * dash laid on a circle, because a browser lays dashes by its own measure of the circle: Chromium drew a quarter
 * turn 0.5% short that way, and draws this arc to within one part in 36,000.
 */
export function arcPath(start: number, sweep: number): string {
  if (sweep <= 0) return '';
  const radii = `${RING_RADIUS} ${RING_RADIUS}`;
  // A whole turn ends where it starts, which an arc cannot say; it is drawn as two half turns.
  if (sweep >= 1) return `M ${ringPoint(start)} A ${radii} 0 1 1 ${ringPoint(start + 0.5)} A ${radii} 0 1 1 ${ringPoint(start)}`;
  return `M ${ringPoint(start)} A ${radii} 0 ${sweep > 0.5 ? 1 : 0} 1 ${ringPoint(start + sweep)}`;
}

/**
 * OMN-21015 U2: where the tier-routed runs landed, as a donut. Each slice is one served tier and sweeps exactly its
 * served share of the ring; slices follow each other clockwise from twelve o'clock in the order served. The
 * list beside the ring names every slice with its share, so the drawing adds no figure of its own.
 *
 * Shares that add up to less than the whole leave the rest of the ring empty (a tier with no served share is named
 * under the chart, not guessed). Shares that add up to more than the whole cannot be a split of one whole, so nothing
 * is drawn and the reason is said. Pointing at a tier, in the list or on the ring, marks it and names it in the
 * middle; the list items take keyboard focus for the same.
 */
export function TierShareChart({ byTier, variant = 'donut' }: { byTier: unknown; variant?: 'donut' | 'bars' }) {
  const [active, setActive] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const shaped = tierShares(byTier);
  const selectionExists = 'segments' in shaped && shaped.segments.some(segment => segment.name === selected);
  useEffect(() => { if (!selectionExists) setSelected(null); }, [selectionExists]);
  if ('refused' in shaped) return <p className="local-dashboard-empty" role="status">{shaped.refused}</p>;
  if (shaped.segments.length === 0 && shaped.unmeasured.length === 0) return null;
  const whole = shaped.segments.reduce((sum, segment) => sum + segment.share, 0);
  if (whole > 1 + WHOLE_TOLERANCE) return <p className="local-dashboard-empty" role="status">{SHARES_OVER_WHOLE}</p>;
  // Where each slice starts: where the one before it ended.
  const starts = shaped.segments.map((_, index) => shaped.segments.slice(0, index).reduce((sum, segment) => sum + segment.share, 0));
  const pinned = shaped.segments.find(segment => segment.name === selected) ?? null;
  const focus = active === null ? pinned : shaped.segments[active] ?? pinned;
  const mark = (index: number) => ({
    onMouseEnter: () => setActive(index),
    onMouseLeave: () => setActive(null),
  });
  return (
    <div className="local-share">
      {shaped.segments.length > 0 && variant === 'bars' && (
        <div className="local-tier-bars">
          <p className="local-tier-bars-caption">Share of tier-routed runs · select a tier to inspect</p>
          <div className="local-tier-bars-axis" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => {
            const tick = index / 4;
            return <span key={tick}>{tick.toLocaleString('en-US', { style: 'percent' })}</span>;
          })}</div>
          <ul className="local-tier-bars-list">
            {shaped.segments.map((segment, index) => (
              <li key={`${segment.name}-${index}`}>
                <button type="button" className="local-tier-bar-select" data-tone={TIER_TONES[segment.name] ?? 'other'} style={tierStyle(segment.name)}
                  aria-label={`Inspect ${tierLabel(segment.name)}`} aria-pressed={selected === segment.name}
                  onClick={() => setSelected(segment.name)}>
                  <span className="local-tier-bar-name"><span className="local-share-swatch" data-tone={TIER_TONES[segment.name] ?? 'other'} style={tierStyle(segment.name)} aria-hidden="true" />{tierLabel(segment.name)}</span>
                  <span className="local-tier-bar-track" aria-hidden="true"><span data-testid={`tier-bar-${segment.name}`} style={{ width: `${segment.share * 100}%` }} /></span>
                  <span className="local-tier-bar-value"><strong>{percent(segment.share)}</strong><span>{segment.count == null ? 'Count not recorded' : `${formatDashboardCount(segment.count)} runs`}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {shaped.segments.length > 0 && variant === 'donut' && (
        <div className="local-donut-row">
          <div className="local-donut-wrap">
          <svg
            className="local-donut"
            viewBox="0 0 42 42"
            role="img"
            aria-label={`Tier mix: ${shaped.segments.map((s) => `${tierLabel(s.name)} ${percent(s.share)}`).join(', ')}`}
          >
            <circle className="local-donut-track" cx={RING_CENTRE} cy={RING_CENTRE} r={RING_RADIUS} fill="none" />
            {shaped.segments.map((segment, index) => (
              <path
                className="local-donut-slice"
                data-testid="tier-segment"
                data-tier={segment.name}
                data-tone={TIER_TONES[segment.name] ?? 'other'}
                style={tierStyle(segment.name)}
                data-active={String(active === index || (active === null && selected === segment.name))}
                data-start={units(starts[index]!)}
                data-sweep={units(segment.share)}
                key={`${segment.name}-${index}`}
                d={arcPath(units(starts[index]!), units(segment.share))}
                fill="none"
                onClick={() => setSelected(segment.name)}
                {...mark(index)}
              >
                <title>{`${tierLabel(segment.name)}: ${percent(segment.share)} of tier-routed runs`}</title>
              </path>
            ))}
          </svg>
          {focus && (
            <div className="local-donut-focus" data-testid="tier-focus">
              <span>{focus.name}</span>
              <span className="local-donut-focus-value">{percent(focus.share)}</span>
            </div>
          )}
          </div>
          <ul className="local-share-legend">
            {shaped.segments.map((segment, index) => (
              <li
                key={`${segment.name}-${index}`}
                data-active={String(active === index || (active === null && selected === segment.name))}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                {...mark(index)}
              >
                <button type="button" className="local-tier-select" aria-label={`Inspect ${tierLabel(segment.name)}`} aria-pressed={selected === segment.name} style={tierStyle(segment.name)}
                  onClick={() => setSelected(segment.name)}>
                <span className="local-share-swatch" data-tone={TIER_TONES[segment.name] ?? 'other'} style={tierStyle(segment.name)} aria-hidden="true" />
                <span>{tierLabel(segment.name)}</span>
                <span className="local-share-value">{percent(segment.share)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pinned && <div className="local-chart-detail" role="status"><strong>{tierLabel(pinned.name)}</strong>
        <span>{percent(pinned.share)} of tier-routed runs</span><span>{pinned.count == null ? 'Run count not measured' : `${formatDashboardCount(pinned.count)} runs`}</span>
        <button type="button" className="local-chart-reset" onClick={() => { setSelected(null); setActive(null); }}>Clear tier selection</button>
      </div>}
      {shaped.unmeasured.length > 0 && (
        <p className="local-dashboard-caption">{`No share served for: ${shaped.unmeasured.map(tierLabel).join(', ')}`}</p>
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
