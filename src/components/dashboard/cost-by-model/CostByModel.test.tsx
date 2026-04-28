import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CostByModel from './CostByModel';

// Sub-widgets stubbed to isolate the router. Suspense + lazy means
// resolution is async, so use findBy* on assertions.
vi.mock('./CostByModelBars', () => ({
  default: () => <div data-testid="bars-2d" />,
}));
vi.mock('./CostByModelPie', () => ({
  default: () => <div data-testid="pie-3d" />,
}));

describe('CostByModel router', () => {
  it('renders bars when dimension is 2d', async () => {
    render(<CostByModel config={{ dimension: '2d' }} />);
    expect(await screen.findByTestId('bars-2d')).toBeInTheDocument();
  });

  it('renders pie when dimension is 3d', async () => {
    render(<CostByModel config={{ dimension: '3d' }} />);
    expect(await screen.findByTestId('pie-3d')).toBeInTheDocument();
  });

  it('defaults to 2d when dimension is undefined', async () => {
    render(<CostByModel config={{}} />);
    expect(await screen.findByTestId('bars-2d')).toBeInTheDocument();
  });
});
