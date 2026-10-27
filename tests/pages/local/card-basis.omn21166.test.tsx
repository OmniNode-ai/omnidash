// @vitest-environment jsdom
// OMN-21166 part 12 AC73, as superseded by part 29 AC191: Overview headline cards show their figure with its basis as a
// caption under it (no popover). Failure modes: a fact dropped in the move, a button or popover left behind, a
// non-headline card losing its visible lines, an empty caption.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardBasis, MetricCard } from '@/pages/LocalDashboardPage';

const binding = (fields: string[]) => [{ binding_id: 'b', projection_topic: 'onex.snapshot.projection.metering-summary.v1', ordering_authority_field: 'as_of', required_fields: fields }];
const component = (id: string, title: string, fields: string[]) => ({ component_id: id, title, component_kind: 'metric_card', contract_version: { major: 1, minor: 0, patch: 0 }, data_bindings: binding(fields) }) as never;
const ROW = { window_kind: 'all', as_of: '2026-10-25T10:00:00Z', spend_usd: '0.232022', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0' };
const BASIS = { baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0',
  excluded_runs: [[7, 'run with no token counts', 'runs with no token counts'], [0, 'run with no spend recorded', 'runs with no spend recorded']] };

describe('CardBasis', () => {
  // Part 29 AC191: an inline caption, no button and no popover; every line it is given stays in the page.
  it('keeps its facts in the page as the card caption, with no button or popover', () => {
    const { container } = render(<CardBasis label="Actual spend"><p>Baseline claude-sonnet-5-5</p><p>pricing manifest v1.0.0</p></CardBasis>);
    const caption = container.querySelector('.local-card-caption')!;
    expect(caption.textContent).toBe('Baseline claude-sonnet-5-5pricing manifest v1.0.0');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('MetricCard on an Overview headline card', () => {
  it('keeps the figure in view and puts every basis fact in the caption', () => {
    const { container } = render(<MetricCard component={component('overview-spend', 'Actual spend', ['window_kind', 'as_of', 'spend_usd'])}
      config={{ metric_key: 'spend_usd', format: 'currency' } as never} row={ROW} caption={BASIS} />);
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('$0.23');
    const caption = container.querySelector('.local-card-caption')!;
    for (const fact of ['Baseline claude-sonnet-5-5', 'pricing manifest v1.0.0', '7 runs with no token counts', '0 runs with no spend recorded']) {
      expect(caption.textContent).toContain(fact);
    }
    // No basis line outside the caption.
    const outside = [...container.querySelectorAll('.local-dashboard-caption')].filter(node => !caption.contains(node));
    expect(outside).toEqual([]);
  });

  it('draws no caption when the card has no basis to tell', () => {
    const { container } = render(<MetricCard component={component('overview-tokens', 'Tokens processed', ['window_kind', 'as_of', 'spend_usd'])}
      config={{ metric_key: 'spend_usd', format: 'currency' } as never} row={ROW} caption={null} />);
    expect(container.querySelector('.local-card-caption')).toBeNull();
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
