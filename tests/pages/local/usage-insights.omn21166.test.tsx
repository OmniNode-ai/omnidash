// @vitest-environment jsdom
// OMN-21166 AC29: the cost-per-run trend is computed from served usage rows.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { UsageInsights } from '@/pages/local/usage-insights';

const NOW = Date.parse('2026-10-21T12:00:00Z');

it('AC29 shows measured cost per call from served usage rows and labels unmeasured calls', () => {
  render(<UsageInsights now={NOW} usageRows={[
    { usage_day: '2026-10-21', model_id: 'model-a', measured_cost_usd: '12.00', call_count: 4, unmeasured_call_count: 1, cost_tier_name: 'cloud', input_tokens: 30, output_tokens: 12 },
  ]} decisionRows={[]} routingRows={[]} />);
  const figure = screen.getByRole('figure', { name: 'Cost per run' });
  expect(figure).toHaveTextContent('Oct 21');
  expect(figure).toHaveTextContent('$4.00');
  expect(figure).toHaveTextContent('1 unmeasured calls excluded');
});

// AC29 Cost by route, on the shape the served delegation.model-routing.v1 row has: a tier carries cost_tier_name, count,
// models, pct_of_tier_routed and tier_routed, with NO cost_usd; cost_usd and unmeasured_cost_count are on tiers[].models[].
// Failure modes: reading a tier-level cost the row does not have (every route "Not measured"); a partial sum shown as a
// total when a model is unpriced; a tier with no models given a figure.
function routeRow(name: string) {
  const region = screen.getByRole('region', { name: 'Cost by route' });
  return [...region.querySelectorAll('dl > div')].find(div => div.querySelector('dt')?.textContent === name) as HTMLElement;
}

it('AC29 Cost by route sums each tier from its served models and never reads a tier-level cost the row does not carry', () => {
  render(<UsageInsights now={NOW} usageRows={[]} decisionRows={[]} routingRows={[{ total_delegations: 9, by_tier: { total_tasks: 9, tier_routed_total: 9, not_tier_routed_count: 0, tiers: [
    { cost_tier_name: 'local', count: 4, tier_routed: true, pct_of_tier_routed: 0.4444, models: [
      { model_name: 'qwen-a', count: 3, pct_of_tier_routed: 0.3333, cost_usd: '0.50', unmeasured_cost_count: 0 },
      { model_name: 'qwen-b', count: 1, pct_of_tier_routed: 0.1111, cost_usd: 0.25, unmeasured_cost_count: 0 },
    ] },
    { cost_tier_name: 'cloud', count: 3, tier_routed: true, pct_of_tier_routed: 0.3333, models: [
      { model_name: 'gem-a', count: 2, pct_of_tier_routed: 0.2222, cost_usd: '0.40', unmeasured_cost_count: 0 },
      { model_name: 'gem-b', count: 1, pct_of_tier_routed: 0.1111, cost_usd: null, unmeasured_cost_count: 1 },
    ] },
    { cost_tier_name: 'edge', count: 2, tier_routed: true, pct_of_tier_routed: 0.2222, models: [
      { model_name: 'edge-a', count: 2, pct_of_tier_routed: 0.2222, cost_usd: null, unmeasured_cost_count: 2 },
    ] },
    { cost_tier_name: 'bare', count: 1, tier_routed: true, pct_of_tier_routed: 0.1, cost_usd: '9.99' },
  ] } }]} />);
  expect(routeRow('local')).toHaveTextContent('$0.75');
  expect(routeRow('local')).not.toHaveTextContent(/unmeasured|Not measured/);
  // A partial sum is labelled as measured, with what is missing, and is not shown as the route's total.
  expect(routeRow('cloud')).toHaveTextContent('$0.40 measured');
  expect(routeRow('cloud')).toHaveTextContent('1 unmeasured');
  expect(routeRow('edge')).toHaveTextContent('Not measured');
  expect(routeRow('edge')).toHaveTextContent('2 unmeasured');
  expect(routeRow('edge')).not.toHaveTextContent('$');
  // No models served: not measured, and a cost_usd the tier does not officially carry is not read.
  expect(routeRow('bare')).toHaveTextContent('Not measured');
  expect(routeRow('bare')).not.toHaveTextContent('9.99');
});
