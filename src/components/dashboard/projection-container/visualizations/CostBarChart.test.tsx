import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { CostBarChart } from './CostBarChart';
import { vizRegistry } from '../viz-registry';
import type { VisualizationContract } from '@shared/types/visualization-contract';

// Import to trigger self-registration side-effect
import './CostBarChart';

const contract: VisualizationContract = {
  version: '1.0.0',
  topic: 'onex.snapshot.projection.ab-compare.v1',
  display_name: 'Test',
  default_visualization: 'bar_chart',
  available_visualizations: ['bar_chart'],
  controls: [],
  display_name_field: 'display_name',
  cost_field: 'cost_usd',
  latency_field: 'latency_ms',
  group_by: 'correlation_id',
};

const mockData = [
  { display_name: 'local-model', cost_usd: '0.0000', latency_ms: '120' },
  { display_name: 'cheap-cloud', cost_usd: '0.0050', latency_ms: '800' },
  { display_name: 'expensive-cloud', cost_usd: '0.0500', latency_ms: '2000' },
];

describe('CostBarChart', () => {
  it('renders a bar for each data row', () => {
    render(<CostBarChart data={mockData} contract={contract} />);
    expect(screen.getByTestId('bar-local-model')).toBeInTheDocument();
    expect(screen.getByTestId('bar-cheap-cloud')).toBeInTheDocument();
    expect(screen.getByTestId('bar-expensive-cloud')).toBeInTheDocument();
  });

  it('sorts bars cheapest first — local-model (free) bar renders before expensive-cloud', () => {
    render(<CostBarChart data={mockData} contract={contract} />);
    const bars = screen.getAllByTestId(/^bar-/);
    const names = bars.map((b) => b.getAttribute('data-testid')!.replace('bar-', ''));
    expect(names[0]).toBe('local-model');
    expect(names[names.length - 1]).toBe('expensive-cloud');
  });

  it('applies correct tier color class — free=green, cheap=amber, expensive=red', () => {
    render(<CostBarChart data={mockData} contract={contract} />);
    expect(screen.getByTestId('bar-local-model').getAttribute('data-tier')).toBe('free');
    expect(screen.getByTestId('bar-cheap-cloud').getAttribute('data-tier')).toBe('cheap');
    expect(screen.getByTestId('bar-expensive-cloud').getAttribute('data-tier')).toBe('expensive');
  });

  it('shows savings annotation on the cheapest non-zero model', () => {
    render(<CostBarChart data={mockData} contract={contract} />);
    expect(screen.getByText(/saves \$0\.0450/)).toBeInTheDocument();
  });

  it('renders empty state when data is empty', () => {
    render(<CostBarChart data={[]} contract={contract} />);
    expect(screen.getByText(/no cost data/i)).toBeInTheDocument();
  });

  it('uses contract cost_field and display_name_field — not hardcoded names', () => {
    const altContract: VisualizationContract = {
      ...contract,
      cost_field: 'price',
      display_name_field: 'label',
    };
    const altData = [
      { label: 'modelA', price: '0.001' },
      { label: 'modelB', price: '0.01' },
    ];
    render(<CostBarChart data={altData} contract={altContract} />);
    expect(screen.getByTestId('bar-modelA')).toBeInTheDocument();
    expect(screen.getByTestId('bar-modelB')).toBeInTheDocument();
  });

  describe('viz-registry self-registration', () => {
    beforeEach(() => {
      // re-import already ran at module load
    });

    it('registers bar_chart adapter in the viz registry', () => {
      expect(vizRegistry['bar_chart']).toBeDefined();
    });

    it('registry adapter renders CostBarChart output', () => {
      const adapter = vizRegistry['bar_chart']!;
      render(adapter.render({ data: mockData, contract }));
      expect(screen.getByTestId('bar-local-model')).toBeInTheDocument();
    });
  });
});
