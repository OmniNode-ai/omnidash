import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DelegationMetrics from './DelegationMetrics';

// Sub-widgets stubbed to isolate the router. Suspense + lazy means
// resolution is async, so use findBy* on assertions. Mirrors
// CostByModel.test.tsx.
vi.mock('./DelegationMetrics2D', () => ({
  default: () => <div data-testid="delegation-2d" />,
}));
vi.mock('./DelegationMetrics3D', () => ({
  default: () => <div data-testid="delegation-3d" />,
}));

describe('DelegationMetrics router', () => {
  it('renders 2D donut when dimension is 2d', async () => {
    render(<DelegationMetrics config={{ dimension: '2d' }} />);
    expect(await screen.findByTestId('delegation-2d')).toBeInTheDocument();
  });

  it('renders 3D doughnut when dimension is 3d', async () => {
    render(<DelegationMetrics config={{ dimension: '3d' }} />);
    expect(await screen.findByTestId('delegation-3d')).toBeInTheDocument();
  });

  it('defaults to 2d when dimension is undefined', async () => {
    render(<DelegationMetrics config={{}} />);
    expect(await screen.findByTestId('delegation-2d')).toBeInTheDocument();
  });
});
