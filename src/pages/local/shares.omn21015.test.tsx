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
//   H8  a pass rate that is not served, or is off the 0 to 1 scale, is drawn as 0% or 100%;
//   H9  a small served share is drawn wider than its share because the stylesheet gives a segment a floor, padding or
//       a border of its own (jsdom lays nothing out, so the drawn widths are measured in a real browser by
//       tests/e2e/local-dashboard-omn21015.spec.ts; this file holds the stylesheet to the rule);
//   H11 a slice of the donut starts somewhere other than where the one before it ended, so slices overlap or leave
//       a gap that reads as a missing share;
//   H12 served shares that add up to more than the whole are drawn anyway, one slice over another;
//   H13 shares that add up to less than the whole are stretched to fill the ring, so each looks larger than served;
//   H14 pointing at a tier in the list marks another slice, marks none, or leaves the mark behind.
//   H10 a served share above zero is written as 0.0%, or one below the whole as 100.0%: with no floor on a segment
//       the written figure is the only place a sliver of a tier can be read, and rounding says it is none (or all).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PassRateMeter, TierShareChart, arcPath, tierShares } from './shares';

const tier = (name: string, count: number, share: unknown, routed = true) => ({
  cost_tier_name: name, count, tier_routed: routed, pct_of_tier_routed: share,
});

/**
 * A slice as it is drawn: where it starts and how far it sweeps, both as fractions of one clockwise turn from twelve
 * o'clock. The arc itself is `arcPath(start, sweep)`, which has its own tests against known points of the ring, and
 * the drawing is measured in a real browser by tests/e2e/local-dashboard-omn21015.spec.ts.
 */
function arc(slice: Element): { start: number; sweep: number; d: string | null } {
  return { start: Number(slice.getAttribute('data-start')), sweep: Number(slice.getAttribute('data-sweep')), d: slice.getAttribute('d') };
}

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
    const { container } = render(<TierShareChart byTier={{ tiers: [] }} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('OMN-21015 U2: the tier bar and the pass-rate meter on the page', () => {
  it('H1, H2: one slice per served tier, in served order, each as long as its served share of the ring', () => {
    render(<TierShareChart byTier={{ tiers: [tier('cheap_cloud', 9, 0.25), tier('local', 1, 0.75)] }} />);
    expect(segments().map((s) => [s.getAttribute('data-tier'), arc(s).sweep])).toEqual([
      ['cheap_cloud', 0.25],
      ['local', 0.75],
    ]);
    // Each slice is drawn as the arc of exactly that start and sweep.
    expect(segments().map((s) => arc(s).d)).toEqual([arcPath(0, 0.25), arcPath(0.25, 0.75)]);
    expect(screen.getByText('cheap_cloud').closest('li')?.textContent).toContain('25.0%');
    expect(screen.getByText('local').closest('li')?.textContent).toContain('75.0%');
  });

  it('H4: a share on another scale says why there is no bar', () => {
    render(<TierShareChart byTier={{ tiers: [tier('local', 5, 71.43)] }} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('not between 0 and 1');
  });

  it('H5: a tier with no served share is named under the bar', () => {
    render(<TierShareChart byTier={{ tiers: [tier('local', 5, 0.5), tier('cheap_cloud', 2, null)] }} />);
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

  it('H9: the stylesheet leaves a slice its served arc: no dash, offset, round cap or scaling of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/local-dashboard.css', 'utf8');
    const rules = [...css.matchAll(/([^{}]*\.local-donut-slice[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      for (const property of ['stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'transform', 'scale', 'r']) {
        expect(`${selector!.trim()} declares ${property}: ${new RegExp(`(^|[;\\s])${property}\\s*:`).test(body!)}`)
          .toBe(`${selector!.trim()} declares ${property}: false`);
      }
    }
  });

  it('H11: each slice starts where the one before it ended, the first at twelve o\u2019clock', () => {
    render(<TierShareChart byTier={{ tiers: [tier('local', 5, 0.5), tier('cheap_cloud', 3, 0.3), tier('claude', 2, 0.2)] }} />);
    expect(segments().map((s) => [arc(s).start, arc(s).sweep])).toEqual([[0, 0.5], [0.5, 0.3], [0.8, 0.2]]);
    expect(segments().map((s) => arc(s).d)).toEqual([arcPath(0, 0.5), arcPath(0.5, 0.3), arcPath(0.8, 0.2)]);
  });

  it('H11: the arc of a slice runs clockwise from its start for its sweep, through known points of the ring', () => {
    // The ring is centred on (21, 21) with radius 15.915494: twelve o'clock is (21, 5.084506), three is (36.915494, 21),
    // six is (21, 36.915494) and nine is (5.084506, 21).
    expect(arcPath(0, 0.25)).toBe('M 21 5.084506 A 15.915494 15.915494 0 0 1 36.915494 21');
    expect(arcPath(0.5, 0.25)).toBe('M 21 36.915494 A 15.915494 15.915494 0 0 1 5.084506 21');
    // More than half a turn takes the long way round.
    expect(arcPath(0, 0.75)).toBe('M 21 5.084506 A 15.915494 15.915494 0 1 1 5.084506 21');
    // A whole turn has no distinct end, so it is two half turns; nothing is drawn for no share.
    expect(arcPath(0, 1)).toBe('M 21 5.084506 A 15.915494 15.915494 0 1 1 21 36.915494 A 15.915494 15.915494 0 1 1 21 5.084506');
    expect(arcPath(0.3, 0)).toBe('');
  });

  it('H12: shares that add up to more than the whole are not drawn, and the reason is said', () => {
    render(<TierShareChart byTier={{ tiers: [tier('local', 5, 0.7), tier('cheap_cloud', 3, 0.6)] }} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('The served tier shares add up to more than the whole, so the chart is not drawn');
  });

  it('H12: shares that add up to the whole within rounding are drawn', () => {
    // Three equal tiers served to ten decimals: their sum is a hair over 1, which is the division's rounding and
    // not a second whole.
    render(<TierShareChart byTier={{ tiers: [tier('a', 1, 0.3333333334), tier('b', 1, 0.3333333334), tier('c', 1, 0.3333333334)] }} />);
    expect(0.3333333334 + 0.3333333334 + 0.3333333334).toBeGreaterThan(1);
    expect(segments()).toHaveLength(3);
  });

  it('H11: a share is drawn as served, with no arithmetic noise in its length or its start', () => {
    // 0.1 + 0.2 is not 0.3 in binary arithmetic; the third slice must still start at 0.3.
    render(<TierShareChart byTier={{ tiers: [tier('local', 1, 0.1), tier('cheap_cloud', 2, 0.2), tier('claude', 7, 0.7)] }} />);
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(segments().map((s) => s.getAttribute('data-start'))).toEqual(['0', '0.1', '0.3']);
    expect(segments().map((s) => s.getAttribute('data-sweep'))).toEqual(['0.1', '0.2', '0.7']);
  });

  it('H13: shares that add up to less than the whole leave the rest of the ring empty', () => {
    render(<TierShareChart byTier={{ tiers: [tier('local', 5, 0.25), tier('cheap_cloud', 3, 0.25)] }} />);
    expect(segments().map((s) => arc(s).sweep)).toEqual([0.25, 0.25]);
    expect(segments().map((s) => arc(s).start)).toEqual([0, 0.25]);
    expect(segments().map((s) => arc(s).d)).toEqual([arcPath(0, 0.25), arcPath(0.25, 0.25)]);
  });

  it('H14: pointing at a tier in the list marks its slice and names it in the middle; leaving clears both', () => {
    render(<TierShareChart byTier={{ tiers: [tier('local', 5, 0.75), tier('cheap_cloud', 3, 0.25)] }} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    const active = () => segments().map((s) => s.getAttribute('data-active'));
    expect(active()).toEqual(['false', 'false']);
    expect(screen.queryByTestId('tier-focus')).toBeNull();
    fireEvent.mouseEnter(items[1]!);
    expect(active()).toEqual(['false', 'true']);
    expect(screen.getByTestId('tier-focus').textContent).toBe('cheap_cloud25.0%');
    fireEvent.mouseLeave(items[1]!);
    expect(active()).toEqual(['false', 'false']);
    expect(screen.queryByTestId('tier-focus')).toBeNull();
    // The same from the keyboard, and from the slice itself.
    fireEvent.focus(items[0]!);
    expect(active()).toEqual(['true', 'false']);
    fireEvent.blur(items[0]!);
    fireEvent.mouseEnter(segments()[1]!);
    expect(active()).toEqual(['false', 'true']);
    expect(items.map((item) => item.getAttribute('data-active'))).toEqual(['false', 'true']);
  });

  it('H10: a share above zero is never written as 0.0%, and one below the whole never as 100.0%', () => {
    render(<TierShareChart byTier={{ tiers: [tier('local', 9999, 0.9999), tier('claude', 1, 0.0001), tier('cheap_cloud', 0, 0)] }} />);
    const written = within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent);
    expect(written).toEqual(['local>99.9%', 'claude<0.1%', 'cheap_cloud0.0%']);
    expect(screen.getByRole('img', { name: /Tier mix/ }).getAttribute('aria-label')).toBe('Tier mix: local >99.9%, claude <0.1%, cheap_cloud 0.0%');
    expect(segments().map((segment) => segment.querySelector('title')?.textContent)).toEqual([
      'local: >99.9% of tier-routed runs', 'claude: <0.1% of tier-routed runs', 'cheap_cloud: 0.0% of tier-routed runs',
    ]);
    // The slices stay the served shares, exactly.
    expect(segments().map((segment) => arc(segment).sweep)).toEqual([0.9999, 0.0001, 0]);
  });

  it('H10: a whole share is 100.0%, and one that rounds inside the scale is written as rounded', () => {
    const written = () => within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent);
    const { unmount } = render(<TierShareChart byTier={{ tiers: [tier('local', 5, 1)] }} />);
    expect(written()).toEqual(['local100.0%']);
    unmount();
    render(<TierShareChart byTier={{ tiers: [tier('claude', 1, 0.0006), tier('cheap_cloud', 1, 0.9994)] }} />);
    expect(written()).toEqual(['claude0.1%', 'cheap_cloud99.9%']);
  });

  it('H10: the pass-rate meter follows the same rule', () => {
    const { unmount } = render(<PassRateMeter row={{ overall_pass_rate: 0.9999 }} />);
    expect(screen.getByRole('meter').textContent).toBe('>99.9%');
    unmount();
    render(<PassRateMeter row={{ overall_pass_rate: 0.0001 }} />);
    expect(screen.getByRole('meter').textContent).toBe('<0.1%');
  });
});
