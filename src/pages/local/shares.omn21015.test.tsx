// @vitest-environment jsdom
// OMN-21015 stage 5, U2: Overview's tier mix as a bar of the served tier shares, and the quality pass rate as a meter.
// Both draw one served value each: a tier's pct_of_tier_routed and the view's overall_pass_rate. Both fields are
// fractions between 0 and 1 (read in the runtime's Postgres view, migration 0055, and in the local store's view:
// count / tier_routed_total, with no factor of 100), whatever the first field's name suggests.
//
// Failure modes, each with a test below:
//   H1  the tiers are re-sorted for the bar instead of drawn in the order served;
//   H2  a segment's width is recomputed from the counts instead of taken from the served share;
//   H3  a row that is not a tier (not tier-routed) is drawn as a segment;
//   H4  a share on another scale (71.43, or below 0) is drawn anyway, as a bar wider than the panel or as nonsense;
//   H5  a tier with no served share is drawn as an empty segment, as if it were 0;
//   H6  no tiers draws an empty bar;
//   H7  the pass rate shown is recomputed from passed and total instead of read as served;
//   H8  a pass rate that is not served, or is off the 0 to 1 scale, is drawn as 0% or 100%.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PassRateMeter, TierShareBar, tierShares } from './shares';

const tier = (name: string, count: number, share: unknown, routed = true) => ({
  cost_tier_name: name, count, tier_routed: routed, pct_of_tier_routed: share,
});

function segments(): HTMLElement[] {
  return within(screen.getByRole('img', { name: /Tier mix/ })).getAllByTestId('tier-segment');
}

describe('OMN-21015 U2: tier shares, shaped for a bar', () => {
  it('H1: tiers keep the order served', () => {
    const shaped = tierShares({ tiers: [tier('cheap_cloud', 2, 0.25), tier('local', 5, 0.625), tier('claude', 1, 0.125)] });
    expect('segments' in shaped && shaped.segments.map((s) => s.name)).toEqual(['cheap_cloud', 'local', 'claude']);
  });

  it('H2: a share is the served value, not count over total', () => {
    // Served shares that deliberately do not match the counts: the bar must follow the shares.
    const shaped = tierShares({ tiers: [tier('local', 1, 0.9), tier('cheap_cloud', 9, 0.1)] });
    expect('segments' in shaped && shaped.segments.map((s) => s.share)).toEqual([0.9, 0.1]);
  });

  it('H3: a row that is not tier-routed is not a segment', () => {
    const shaped = tierShares({ tiers: [tier('local', 104, 1), tier('not_tier_routed', 20, 0, false)] });
    expect('segments' in shaped && shaped.segments.map((s) => s.name)).toEqual(['local']);
  });

  it.each([
    ['on a 0 to 100 scale', 71.43],
    ['below 0', -0.1],
  ])('H4: a share %s is refused, and nothing is drawn', (_name, share) => {
    const shaped = tierShares({ tiers: [tier('local', 5, share), tier('cheap_cloud', 2, 0.2)] });
    expect(shaped).toEqual({ refused: 'A served tier share is not between 0 and 1, so the bar is not drawn' });
  });

  it('H5: a tier with no served share is left out of the bar and named', () => {
    const shaped = tierShares({ tiers: [tier('local', 5, 0.5), tier('cheap_cloud', 2, null)] });
    expect('segments' in shaped && shaped.segments.map((s) => s.name)).toEqual(['local']);
    expect('segments' in shaped && shaped.unmeasured).toEqual(['cheap_cloud']);
  });

  it('H6: no tiers is no bar', () => {
    expect(tierShares({ tiers: [] })).toEqual({ segments: [], unmeasured: [] });
    expect(tierShares(null)).toEqual({ segments: [], unmeasured: [] });
    const { container } = render(<TierShareBar byTier={{ tiers: [] }} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('OMN-21015 U2: the tier bar and the pass-rate meter on the page', () => {
  it('H1, H2: one segment per served tier, in served order, each as wide as its served share', () => {
    render(<TierShareBar byTier={{ tiers: [tier('cheap_cloud', 9, 0.25), tier('local', 1, 0.75)] }} />);
    expect(segments().map((s) => [s.getAttribute('data-tier'), s.style.width])).toEqual([
      ['cheap_cloud', '25%'],
      ['local', '75%'],
    ]);
    expect(screen.getByText('cheap_cloud').closest('li')?.textContent).toContain('25.0%');
    expect(screen.getByText('local').closest('li')?.textContent).toContain('75.0%');
  });

  it('H4: a share on another scale says why there is no bar', () => {
    render(<TierShareBar byTier={{ tiers: [tier('local', 5, 71.43)] }} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('not between 0 and 1');
  });

  it('H5: a tier with no served share is named under the bar', () => {
    render(<TierShareBar byTier={{ tiers: [tier('local', 5, 0.5), tier('cheap_cloud', 2, null)] }} />);
    expect(segments()).toHaveLength(1);
    expect(screen.getByText(/No share served for: cheap_cloud/)).toBeInTheDocument();
  });

  it('H7: the meter shows the served pass rate, not passed over total', () => {
    // 2 of 10 would be 20%; the served rate says 87.5%, and the served rate is what is shown.
    render(<PassRateMeter row={{ overall_pass_rate: 0.875, total_passed: 2, total_checks: 10 }} />);
    const meter = screen.getByRole('meter', { name: 'Quality pass rate' });
    expect(meter.getAttribute('aria-valuenow')).toBe('0.875');
    expect(meter.textContent).toContain('87.5%');
    expect((meter.querySelector('[data-testid="pass-rate-fill"]') as HTMLElement).style.width).toBe('87.5%');
  });

  it.each([
    ['not served', null],
    ['absent', undefined],
    ['on a 0 to 100 scale', 87.5],
    ['not a number', 'high'],
  ])('H8: a pass rate that is %s draws no meter', (_name, rate) => {
    const { container } = render(<PassRateMeter row={{ overall_pass_rate: rate, total_passed: 2, total_checks: 10 }} />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(container.textContent).not.toContain('%');
  });
});
