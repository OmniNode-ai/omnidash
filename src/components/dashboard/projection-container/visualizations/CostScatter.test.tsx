import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { CostScatter } from './CostScatter';
import { vizRegistry } from '../viz-registry';
import type { VisualizationContract } from '@shared/types/visualization-contract';

// Import to trigger self-registration side-effect
import './CostScatter';

const contract: VisualizationContract = {
  version: '1.0.0',
  topic: 'onex.snapshot.projection.ab-compare.v1',
  display_name: 'Test',
  default_visualization: 'scatter_plot',
  available_visualizations: ['scatter_plot'],
  controls: [],
  display_name_field: 'display_name',
  cost_field: 'cost_usd',
  latency_field: 'latency_ms',
  group_by: 'correlation_id',
};

const mockData = [
  { display_name: 'local-model', cost_usd: '0.0000', latency_ms: '120', total_tokens: '1000' },
  { display_name: 'cheap-cloud', cost_usd: '0.0050', latency_ms: '800', total_tokens: '2000' },
  { display_name: 'expensive-cloud', cost_usd: '0.0500', latency_ms: '2000', total_tokens: '3000' },
];

describe('CostScatter', () => {
  it('renders a dot for each model', () => {
    render(<CostScatter data={mockData} contract={contract} />);
    expect(screen.getByTestId('dot-local-model')).toBeInTheDocument();
    expect(screen.getByTestId('dot-cheap-cloud')).toBeInTheDocument();
    expect(screen.getByTestId('dot-expensive-cloud')).toBeInTheDocument();
  });

  it('applies correct tier to each dot', () => {
    render(<CostScatter data={mockData} contract={contract} />);
    expect(screen.getByTestId('dot-local-model').getAttribute('data-tier')).toBe('free');
    expect(screen.getByTestId('dot-cheap-cloud').getAttribute('data-tier')).toBe('cheap');
    expect(screen.getByTestId('dot-expensive-cloud').getAttribute('data-tier')).toBe('expensive');
  });

  it('renders labels for each model', () => {
    render(<CostScatter data={mockData} contract={contract} />);
    expect(screen.getByText('local-model')).toBeInTheDocument();
    expect(screen.getByText('cheap-cloud')).toBeInTheDocument();
    expect(screen.getByText('expensive-cloud')).toBeInTheDocument();
  });

  it('falls back to a finite radius for invalid token values', () => {
    const data = [
      { display_name: 'bad-token-model', cost_usd: '0.0100', latency_ms: '450', total_tokens: 'n/a' },
    ];

    render(<CostScatter data={data} contract={contract} />);

    const circle = screen.getByTestId('dot-bad-token-model').querySelector('circle');
    expect(circle?.getAttribute('r')).toBe('18');
  });

  it('renders empty state when data is empty', () => {
    render(<CostScatter data={[]} contract={contract} />);
    expect(screen.getByText(/no data to display/i)).toBeInTheDocument();
  });

  it('uses contract latency_field and cost_field — not hardcoded names', () => {
    const altContract: VisualizationContract = {
      ...contract,
      cost_field: 'price',
      latency_field: 'response_ms',
      display_name_field: 'label',
    };
    const altData = [
      { label: 'modelA', price: '0.001', response_ms: '300', total_tokens: '500' },
    ];
    render(<CostScatter data={altData} contract={altContract} />);
    expect(screen.getByTestId('dot-modelA')).toBeInTheDocument();
    expect(screen.getByText('modelA')).toBeInTheDocument();
  });

  it('renders SVG with accessible role and aria-label', () => {
    render(<CostScatter data={mockData} contract={contract} />);
    expect(screen.getByRole('img', { name: /cost vs latency/i })).toBeInTheDocument();
  });

  describe('viz-registry self-registration', () => {
    beforeEach(() => {
      // re-import already ran at module load
    });

    it('registers scatter_plot adapter in the viz registry', () => {
      expect(vizRegistry['scatter_plot']).toBeDefined();
    });

    it('registry adapter renders CostScatter output', () => {
      const adapter = vizRegistry['scatter_plot']!;
      render(adapter.render({ data: mockData, contract }));
      expect(screen.getByTestId('dot-local-model')).toBeInTheDocument();
    });
  });
});
