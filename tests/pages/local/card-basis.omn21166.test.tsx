// @vitest-environment jsdom
// OMN-21166 part 12 AC73: Overview headline cards show their figure; the basis lines sit in a tooltip behind an info
// button. Failure modes: a fact dropped in the move, a tooltip only a mouse can open, a non-headline card losing its
// visible lines, an empty tooltip.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardBasis, MetricCard } from '@/pages/LocalDashboardPage';

const binding = (fields: string[]) => [{ binding_id: 'b', projection_topic: 'onex.snapshot.projection.metering-summary.v1', ordering_authority_field: 'as_of', required_fields: fields }];
const component = (id: string, title: string, fields: string[]) => ({ component_id: id, title, component_kind: 'metric_card', contract_version: { major: 1, minor: 0, patch: 0 }, data_bindings: binding(fields) }) as never;
const ROW = { window_kind: 'all', as_of: '2026-10-25T10:00:00Z', spend_usd: '0.232022', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0' };
const BASIS = { baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0',
  excluded_runs: [[7, 'run with no token counts', 'runs with no token counts'], [0, 'run with no spend recorded', 'runs with no spend recorded']] };

describe('CardBasis', () => {
  it('opens on keyboard focus, closes on Escape, and describes the button with its facts', () => {
    render(<CardBasis label="Actual spend"><p>Baseline claude-sonnet-5-5</p></CardBasis>);
    const button = screen.getByRole('button', { name: 'About Actual spend' });
    const tip = document.getElementById(button.getAttribute('aria-describedby')!)!;
    expect(tip).toHaveAttribute('role', 'tooltip');
    expect(tip.textContent).toBe('Baseline claude-sonnet-5-5');
    fireEvent.focus(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('MetricCard on an Overview headline card', () => {
  it('keeps the figure in view and puts every basis fact in the tooltip', () => {
    const { container } = render(<MetricCard component={component('overview-spend', 'Actual spend', ['window_kind', 'as_of', 'spend_usd'])}
      config={{ metric_key: 'spend_usd', format: 'currency' } as never} row={ROW} caption={BASIS} />);
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('$0.23');
    const tip = screen.getByRole('tooltip');
    for (const fact of ['Baseline claude-sonnet-5-5', 'pricing manifest v1.0.0', '7 runs with no token counts', '0 runs with no spend recorded']) {
      expect(tip.textContent).toContain(fact);
    }
    // No basis line outside the tooltip.
    const outside = [...container.querySelectorAll('.local-dashboard-caption')].filter(node => !tip.contains(node));
    expect(outside).toEqual([]);
  });

  it('draws no tooltip when the card has no basis to tell', () => {
    render(<MetricCard component={component('overview-tokens', 'Tokens processed', ['window_kind', 'as_of', 'spend_usd'])}
      config={{ metric_key: 'spend_usd', format: 'currency' } as never} row={ROW} caption={null} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByRole('button', { name: /About/ })).toBeNull();
  });
});

describe('MetricCard on any other card', () => {
  it('keeps its basis lines in view, with no tooltip', () => {
    const { container } = render(<MetricCard component={component('overview-baseline-spend', 'Baseline spend', ['window_kind', 'as_of', 'spend_usd'])}
      config={{ metric_key: 'spend_usd', format: 'currency' } as never} row={ROW} caption={BASIS} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(within(container).getByText(/7 runs with no token counts/)).toBeInTheDocument();
  });
});
