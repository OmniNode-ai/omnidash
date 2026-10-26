// @vitest-environment jsdom
// OMN-21166 part 17 (Lakshman 2026-10-26: "fix this clean unnesary things and make it unform in style"): Usage's
// "More usage" charts, each its own panel in the Overview style. Failure modes declared before code, each with a test:
//   U1  a figure changes value while moving into a chart (cost per call, token counts, route cost);
//   U2  a count the row does not record is drawn as a zero bar or reads 0;
//   U3  a share is shown for runs that have none (not-tier-routed runs, outside the tier shares);
//   U4  a value is reachable only by mouse: a bar has no focusable element naming its value;
//   U5  a bar is drawn solid or dotted instead of the one hatch (part 16 AC97): jsdom has no layout or stylesheet, so the
//       drawn hatch is checked in tests/e2e/local-dashboard-omn21166-surfaces-bars.spec.ts; here only the bar count;
//   U6  the removed parts come back: "Savings by route is not served yet", or a panel holding several charts.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UsageInsights } from '@/pages/local/usage-insights';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const USAGE = [
  { usage_day: '2026-10-20', model_id: 'model-a', measured_cost_usd: '0.10', call_count: 5, unmeasured_call_count: 0, input_tokens: 300, output_tokens: 120 },
  { usage_day: '2026-10-21', model_id: 'model-a', measured_cost_usd: '12.00', call_count: 4, unmeasured_call_count: 1, input_tokens: 30, output_tokens: 12 },
  { usage_day: '2026-10-21', model_id: 'model-b', measured_cost_usd: null, call_count: 2, unmeasured_call_count: 2, input_tokens: null, output_tokens: 40 },
];
const ROUTING = [{ total_delegations: 11, by_tier: { total_tasks: 11, tier_routed_total: 9, not_tier_routed_count: 2, tiers: [
  { cost_tier_name: 'local', count: 6, tier_routed: true, pct_of_tier_routed: 0.6667, models: [{ model_name: 'model-a', count: 6, cost_usd: '0.00', unmeasured_cost_count: 0 }] },
  { cost_tier_name: 'cheap_cloud', count: 3, tier_routed: true, pct_of_tier_routed: 0.3333, models: [{ model_name: 'model-b', count: 3, cost_usd: '0.23', unmeasured_cost_count: 0 }] },
  { cost_tier_name: 'not_tier_routed', count: 2, tier_routed: false, pct_of_tier_routed: 0, models: [{ model_name: 'model-a', count: 2, cost_usd: '0.00', unmeasured_cost_count: 0 }] },
] } }];

const part = (name: 'cost-per-run' | 'tokens-by-model' | 'cost-by-route') =>
  render(<UsageInsights now={NOW} usageRows={USAGE} decisionRows={[]} routingRows={ROUTING} part={name} />);

describe('Cost per run', () => {
  it('U1, U4: one bar per served day; its cost per call and unmeasured calls are in a focusable bar\'s name', () => {
    part('cost-per-run');
    const chart = screen.getByRole('figure', { name: 'Cost per run' });
    const days = within(chart).getAllByRole('listitem');
    expect(days.map(day => day.getAttribute('aria-label'))).toEqual([
      '2026-10-20 · measured cost per call $0.02 · 0 unmeasured calls',
      '2026-10-21 · measured cost per call $4.00 · 3 unmeasured calls',
    ]);
    expect(days.every(day => day.tabIndex === 0)).toBe(true);
    expect(chart.querySelectorAll('.gdb-bar.ins-seg')).toHaveLength(2);
  });

  it('U6: no resting sentence; one caption keeps the basis', () => {
    part('cost-per-run');
    const chart = screen.getByRole('figure', { name: 'Cost per run' });
    expect(chart).not.toHaveTextContent('Measured cost per call; unmeasured calls are excluded from the denominator');
    expect(chart).toHaveTextContent('Measured spend divided by calls with measured cost; unmeasured calls are left out.');
  });
});

describe('Tokens by model', () => {
  it('U1: two bars per model, tokens in and out, with the served counts in each bar\'s name', () => {
    part('tokens-by-model');
    const chart = screen.getByRole('figure', { name: 'Tokens in vs out by model' });
    const a = within(chart).getByRole('listitem', { name: /^model-a:/ });
    expect(a).toHaveAccessibleName('model-a: 330 tokens in, 132 tokens out');
    expect(a.querySelectorAll('.gdb-bar.ins-seg')).toHaveLength(2);
  });

  it('U2: a count the rows do not record draws no bar and reads not recorded, never 0', () => {
    part('tokens-by-model');
    const b = within(screen.getByRole('figure', { name: 'Tokens in vs out by model' })).getByRole('listitem', { name: /^model-b:/ });
    expect(b).toHaveAccessibleName('model-b: Not recorded tokens in, 40 tokens out');
    expect(b.querySelectorAll('.gdb-bar.ins-seg')).toHaveLength(1);
    expect(b).not.toHaveTextContent(/\b0 tokens in/);
  });
});

describe('Cost by route', () => {
  it('U1: a ranked bar per tier-routed route with its served cost, runs and share', () => {
    part('cost-by-route');
    const chart = screen.getByRole('region', { name: 'Cost by route' });
    expect(within(chart).getByLabelText('Cheap cloud: $0.23 · 3 runs · 33.3%, measured')).toBeInTheDocument();
    expect(within(chart).getByLabelText('Local: $0.00 · 6 runs · 66.7%, measured')).toBeInTheDocument();
    expect([...chart.querySelectorAll('.rb-bar')].every(bar => bar.getAttribute('data-pattern') === 'hatched')).toBe(true);
  });

  it('U3: not-tier-routed runs carry no share; they are a count under the chart', () => {
    part('cost-by-route');
    const chart = screen.getByRole('region', { name: 'Cost by route' });
    expect(within(chart).queryByLabelText(/^Not tier-routed:/)).toBeNull();
    expect(chart).toHaveTextContent('2 runs not tier-routed ($0.00), outside the tier shares');
    expect(chart).not.toHaveTextContent('0.0%');
  });

  it('U6: no "Savings by route is not served yet"', () => {
    part('cost-by-route');
    expect(screen.queryByText('Savings by route is not served yet')).toBeNull();
  });
});

it('U6: each part is one chart; no panel holds several', () => {
  for (const name of ['cost-per-run', 'tokens-by-model', 'cost-by-route'] as const) {
    const { container, unmount } = part(name);
    expect(container.querySelectorAll('figure.local-chart, section.local-chart').length, name).toBe(1);
    unmount();
  }
});
