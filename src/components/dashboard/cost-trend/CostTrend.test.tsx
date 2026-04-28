import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CostTrend from './CostTrend';

// Sub-widgets stubbed to isolate router logic from real chart rendering.
// CostTrend2D's stub renders a testid that includes its received `chartType`
// so we can assert the router's `style` → `chartType` forwarding.
vi.mock('./CostTrend2D', () => ({
  default: ({ config }: { config: { chartType?: string } }) =>
    <div data-testid={`2d-${config.chartType ?? 'area'}`} />,
}));
vi.mock('./CostTrend3DBars', () => ({
  default: () => <div data-testid="3d-bars" />,
}));
vi.mock('./CostTrend3DArea', () => ({
  default: () => <div data-testid="3d-area" />,
}));

describe('CostTrend router', () => {
  it.each<[Record<string, string>, string]>([
    [{ dimension: '2d', style: 'area' }, '2d-area'],
    [{ dimension: '2d', style: 'bar' }, '2d-bar'],
    [{ dimension: '3d', style: 'area' }, '3d-area'],
    [{ dimension: '3d', style: 'bar' }, '3d-bars'],
  ])('renders %j as %s', async (config, expectedTestId) => {
    render(<CostTrend config={config} />);
    expect(await screen.findByTestId(expectedTestId)).toBeInTheDocument();
  });

  it('defaults to 2d / area when both dimension and style are undefined', async () => {
    render(<CostTrend config={{}} />);
    expect(await screen.findByTestId('2d-area')).toBeInTheDocument();
  });

  it('forwards style as chartType to CostTrend2D when dimension=2d', async () => {
    render(<CostTrend config={{ dimension: '2d', style: 'bar' }} />);
    expect(await screen.findByTestId('2d-bar')).toBeInTheDocument();
  });
});
