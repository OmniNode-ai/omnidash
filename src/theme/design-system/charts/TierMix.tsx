/**
 * OMN-22168 AC3: the tier mix of the local pages, as a donut or as bars, with its legend, its inspect detail and its
 * refusal states. Moved from src/pages/local/shares.tsx with the markup unchanged; shares.tsx keeps the shaping of the
 * served rows (tierShares), and this module draws exactly the shares it is handed.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { formatDashboardCount } from '@/theme/format';
import { tierColor } from '@/lib/dashboard-colors';
import { fixed as fmtFixed, localeString as fmtLocaleString } from '@/theme/format';
import { formatShare } from '@/theme/format';

/** A served share as a percent; a share that is not 0 or 1 never reads as 0.0% or 100.0%. */
export function percent(share: number): string {
  // OMN-23330 AC19: the one share formatter, from src/theme/format.
  return formatShare(share);
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
  return Number(fmtFixed(value, 6));
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
export function TierMix({ shares: shaped, nameOf: tierLabel, variant = 'donut' }: { shares: TierShares; nameOf: (tier: string) => string; variant?: 'donut' | 'bars' }) {
  const [active, setActive] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
            return <span key={tick}>{fmtLocaleString(tick, 'en-US', { style: 'percent' })}</span>;
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
