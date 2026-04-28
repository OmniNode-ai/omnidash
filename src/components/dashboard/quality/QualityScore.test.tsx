import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QualityScore from './QualityScore';

// Sub-widgets are stubbed so this test isolates the router logic from the
// real Histogram / Tilted3D rendering. The router uses React.lazy(), so
// assertions use findBy* (Suspense fallback resolves in the next microtask).
vi.mock('./QualityScoreHistogram', () => ({
  default: () => <div data-testid="histogram-2d" />,
}));
vi.mock('./QualityScoreTilted3D', () => ({
  default: () => <div data-testid="tilted-3d" />,
}));

describe('QualityScore router', () => {
  it('renders the 3D tilted view when dimension is 3d', async () => {
    render(<QualityScore config={{ dimension: '3d' }} />);
    expect(await screen.findByTestId('tilted-3d')).toBeInTheDocument();
  });

  it('renders the 2D histogram when dimension is 2d', async () => {
    render(<QualityScore config={{ dimension: '2d' }} />);
    expect(await screen.findByTestId('histogram-2d')).toBeInTheDocument();
  });

  it('defaults to 3D when dimension is undefined', async () => {
    render(<QualityScore config={{}} />);
    expect(await screen.findByTestId('tilted-3d')).toBeInTheDocument();
  });
});
