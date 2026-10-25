// @vitest-environment jsdom
// Failure modes: count-derived widths, minimum-width inflation of tiny tiers,
// lost keyboard selection, invented missing counts, and invalid shares drawn.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TierShareChart } from './shares';

const tier = (name: string, count: unknown, share: unknown) => ({ cost_tier_name: name, count, tier_routed: true, pct_of_tier_routed: share });

describe('Routing horizontal bars', () => {
  it('uses served shares on a common 0–100 scale, even when counts disagree', () => {
    render(<TierShareChart variant="bars" byTier={{ tiers: [tier('local', 1, 0.9), tier('harness', 99, 0.1)] }} />);
    expect(screen.getByTestId('tier-bar-local')).toHaveStyle({ width: '90%' });
    expect(screen.getByTestId('tier-bar-harness')).toHaveStyle({ width: '10%' });
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('preserves zero and tiny shares without rounding up their bar widths', () => {
    render(<TierShareChart variant="bars" byTier={{ tiers: [tier('local', 0, 0), tier('claude', 1, 0.0001)] }} />);
    expect(screen.getByTestId('tier-bar-local')).toHaveStyle({ width: '0%' });
    expect(screen.getByTestId('tier-bar-claude')).toHaveStyle({ width: '0.01%' });
    expect(screen.getByText('<0.1%')).toBeInTheDocument();
  });
  it('keeps inspect and clear controls on each bar', () => {
    render(<TierShareChart variant="bars" byTier={{ tiers: [tier('local', 3, 0.75)] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Local' }));
    expect(screen.getByRole('status')).toHaveTextContent('3 runs');
    fireEvent.click(screen.getByRole('button', { name: 'Clear tier selection' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('shows missing count explicitly without substituting zero', () => {
    render(<TierShareChart variant="bars" byTier={{ tiers: [tier('harness', null, 0.2)] }} />);
    expect(screen.getByText('Count not recorded')).toBeInTheDocument();
  });
  it('does not draw invalid or overfull distributions', () => {
    render(<TierShareChart variant="bars" byTier={{ tiers: [tier('local', 10, 1.2)] }} />);
    expect(screen.queryByTestId('tier-bar-local')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('not between 0 and 1');
  });
});
