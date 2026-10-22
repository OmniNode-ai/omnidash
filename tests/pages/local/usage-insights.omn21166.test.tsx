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
