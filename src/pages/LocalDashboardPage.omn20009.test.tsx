// @vitest-environment jsdom
// OMN-20009: the Overview's Run locally share and Avg saving / call, each from a served field, never 0 when unmeasured.
//
// Failure modes, each with a test below:
//   H1  the share card shows the served local_call_share unchanged, never a ratio the browser computed from counts;
//   H2  the share card names the served counts, the not-tier-routed count included, so the gap stays visible;
//   H3  no model-routing row (no runs) is the typed no-runs state, never 0%;
//   H4  a served row without local_call_share (a backend before the view change) is a typed not-served state;
//   H5  a null share is Not measured, never 0%;
//   H6  a measured zero share (runs, none local) is a real 0.0%, not an empty state;
//   S1  the per-run saving card shows the served decimal text unchanged, never savings over runs from the browser;
//   S2  a null per-run saving says why: no measured run, or an unresolved baseline; never $0;
//   S3  a row without the field is a typed not-served state;
//   S4  only the all-time row is read; no all-time row, or one per baseline model, is a typed state, not a guess;
//   S5  a negative saving keeps its sign;
//   P1  on the page, the Run locally card reads delegation.model-routing.v1 and shows its served share;
//   P2  on the page, the per-run saving card waits on metering-summary.v1 while the lab does not serve it, and shows
//       the served value once it does.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
// OMN-21166 live review 2026-10-25: Run locally and Avg saving / call left Overview; the Run locally card's own checks
// remain, and the page and saving-per-call checks were retired with those panels.
import { RunLocallyCard } from './LocalDashboardPage';

/** The lab's model-routing by_tier on 2026-10-04 14:26Z, with the keys the OMN-20009 view adds. */
const labByTier = {
  tiers: [
    { count: 104, tier_routed: true, cost_tier_name: 'local', pct_of_tier_routed: 1 },
    { count: 20, tier_routed: false, cost_tier_name: 'not_tier_routed', pct_of_tier_routed: 0 },
  ],
  total_tasks: 124,
  tier_routed_total: 104,
  not_tier_routed_count: 20,
  local_call_count: 104,
  total_call_count: 124,
  local_call_share: 104 / 124,
};


describe('RunLocallyCard (OMN-20009 AC1, AC2, AC4)', () => {
  it('H1: shows the served share, not the tier-routed share and not a ratio of the counts', () => {
    // Served deliberately unlike 104/124 (0.8387): a browser that divides the counts would show 83.9%.
    render(<RunLocallyCard row={{ by_tier: { ...labByTier, local_call_share: 0.5 } }} />);
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Local share of all runs' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.queryByText('83.9%')).toBeNull();
    expect(screen.queryByText('100.0%')).toBeNull();
  });

  it('H1, H2: renders the lab row as 83.9% with its served counts and the not-tier-routed gap', () => {
    render(<RunLocallyCard row={{ by_tier: labByTier }} />);
    expect(screen.getByText('83.9%')).toBeInTheDocument();
    expect(screen.getByText('Local runs')).toBeInTheDocument();
    expect(screen.getByText('104')).toBeInTheDocument();
    expect(screen.getByText('All runs')).toBeInTheDocument();
    expect(screen.getByText('124')).toBeInTheDocument();
    expect(screen.getByText('Without a tier')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect([...document.querySelectorAll('.local-routing-counts > div')].map(div => [div.querySelector('dt')?.textContent, div.querySelector('dd')?.textContent])).toEqual([['Local runs', '104'], ['All runs', '124'], ['Without a tier', '20']]);
  });

  it('H3: no served row is the typed no-runs state, never 0%', () => {
    render(<RunLocallyCard row={null} />);
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByText(/0(\.0)?%/)).toBeNull();
  });

  it('H4: a row without local_call_share says what it waits on', () => {
    const { local_call_share: _drop, ...older } = labByTier;
    render(<RunLocallyCard row={{ by_tier: older }} />);
    expect(screen.getByText('Not available yet: share of runs kept local')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('H4: a row without by_tier says what it waits on', () => {
    render(<RunLocallyCard row={{ total_delegations: 3 }} />);
    expect(screen.getByText('Not available yet: share of runs kept local')).toBeInTheDocument();
  });

  it('H5: a null share is Not measured, never 0%', () => {
    render(<RunLocallyCard row={{ by_tier: { ...labByTier, local_call_share: null } }} />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText(/0(\.0)?%/)).toBeNull();
  });

  it('H6: a measured zero share is 0.0%', () => {
    render(<RunLocallyCard row={{ by_tier: { ...labByTier, local_call_count: 0, local_call_share: 0 } }} />);
    expect(screen.getByText('0.0%')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Local share of all runs' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('H7: out-of-range shares never render a misleading meter', () => {
    render(<RunLocallyCard row={{ by_tier: { ...labByTier, local_call_share: 1.2 } }} />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).toBeNull();
  });
});


// OMN-21166 live review 2026-10-25: Lakshman removed Run locally and Avg saving / call from Overview ("delete them");
// the card components above keep their tests, and no page draws them now.
