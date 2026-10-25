// @vitest-environment jsdom
// Failure modes: binary addition loses a cent within a model or across models;
// decimal text is rounded before display; missing values become zero; a route repeats the same sum bug.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { UsageInsights } from '@/pages/local/usage-insights';

const NOW = Date.parse('2026-10-21T12:00:00Z');
function usage(cost: unknown, model = 'model-a') {
  return { usage_day: '2026-10-21', model_id: model, measured_cost_usd: cost, call_count: 1, unmeasured_call_count: cost === null ? 1 : 0, cost_tier_name: 'cloud', input_tokens: 2, output_tokens: 1 };
}
function show(rows: ReturnType<typeof usage>[]) {
  render(<UsageInsights now={NOW} usageRows={rows} decisionRows={[]} routingRows={[]} />);
  return screen.getByRole('figure', { name: 'Spend by model' });
}
// OMN-21166 AC64: the model figures are ranked bars; each bar's value and the chart's total are checked as the
// legend and donut were.
const bar = (figure: HTMLElement, model: string) => figure.querySelector(`[data-ranked-item="${model}"] .rb-value`);
const total = (figure: HTMLElement) => figure.querySelector('.rb-unit');
it('adds the exact 0.10 and 0.70 inputs before formatting the model bar and total', () => {
  const figure = show([usage('0.10'), usage('0.70')]);
  expect(bar(figure, 'model-a')).toHaveTextContent('$0.80');
  expect(total(figure)).toHaveTextContent('$0.80 in all');
  expect(screen.getByRole('figure', { name: 'Cost per run' })).toHaveTextContent('$0.40');
});
it('adds model totals as decimals for the total too', () => {
  const figure = show([usage('0.10'), usage('0.70', 'model-b')]);
  expect(total(figure)).toHaveTextContent('$0.80 in all');
});
it.each([
  [['0.7999999999999999999', '0'], '$0.79'],
  [['9007199254740993.12', '0.01'], '$9,007,199,254,740,993.13'],
  [['1e-8', '2e-8'], '$0.01'],
  [['-0.10', '-0.70'], '-$0.80'],
  [[0, null], '$0.00'],
  [[null, null], 'Not measured'],
])('preserves decimal precision and measurement state for %j', (costs, expected) => {
  const figure = show(costs.map(cost => usage(cost)));
  expect(bar(figure, 'model-a')).toHaveTextContent(expected);
  if (expected === 'Not measured') expect(total(figure)?.textContent).not.toContain('$');
  else expect(total(figure)).toHaveTextContent(`${expected} in all`);
});
it('sums the served route model costs without losing a cent', () => {
  render(<UsageInsights now={NOW} usageRows={[]} decisionRows={[]} routingRows={[{ by_tier: { tiers: [{ cost_tier_name: 'cloud', count: 2, pct_of_tier_routed: 1, models: [
    { cost_usd: '0.10', unmeasured_cost_count: 0 }, { cost_usd: '0.70', unmeasured_cost_count: 0 },
  ] }] } }]} />);
  expect(screen.getByRole('region', { name: 'Cost by route' })).toHaveTextContent('$0.80');
});
it('divides the exact daily spend without losing a cent per measured call', () => {
  show([{ ...usage('0.57'), call_count: 3 }]);
  expect(screen.getByRole('figure', { name: 'Cost per run' })).toHaveTextContent('$0.19');
});
