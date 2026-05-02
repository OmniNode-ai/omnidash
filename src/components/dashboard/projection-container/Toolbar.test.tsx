import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import type { VisualizationContract } from '@shared/types/visualization-contract';

const BASE_CONTRACT: VisualizationContract = {
  version: '1.0.0',
  topic: 'onex.snapshot.projection.ab-compare.v1',
  display_name: 'A/B Model Cost Comparison',
  default_visualization: 'bar_chart',
  available_visualizations: ['bar_chart', 'scatter_plot', 'table'],
  controls: [
    { type: 'run_selector', field: 'correlation_id', param: 'run_id' },
    { type: 'visualization_picker' },
  ],
  display_name_field: 'display_name',
  cost_field: 'cost_usd',
  latency_field: 'latency_ms',
  group_by: 'correlation_id',
  query_params: {
    run_selector: { field: 'correlation_id', param: 'run_id' },
  },
};

const MOCK_DATA = [
  { correlation_id: 'run-abc', display_name: 'Qwen3-Coder-30B', cost_usd: 0.0, latency_ms: 250 },
  { correlation_id: 'run-abc', display_name: 'DeepSeek-R1-14B', cost_usd: 0.0, latency_ms: 400 },
  { correlation_id: 'run-xyz', display_name: 'Claude Sonnet', cost_usd: 0.05, latency_ms: 800 },
];

describe('Toolbar (OMN-10507)', () => {
  it('renders both run_selector and visualization_picker when both declared in contract', () => {
    render(
      <Toolbar
        contract={BASE_CONTRACT}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('projection-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('run-selector')).toBeInTheDocument();
    expect(screen.getByTestId('viz-picker')).toBeInTheDocument();
    expect(screen.getByLabelText('Run filter')).toBeInTheDocument();
    expect(screen.getByLabelText('Visualization type')).toBeInTheDocument();
  });

  it('renders only visualization_picker when only picker declared in contract', () => {
    const pickerOnlyContract: VisualizationContract = {
      ...BASE_CONTRACT,
      controls: [{ type: 'visualization_picker' }],
    };
    render(
      <Toolbar
        contract={pickerOnlyContract}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('viz-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('run-selector')).toBeNull();
  });

  it('renders only run_selector when only run_selector declared in contract', () => {
    const runOnlyContract: VisualizationContract = {
      ...BASE_CONTRACT,
      controls: [{ type: 'run_selector', field: 'correlation_id', param: 'run_id' }],
    };
    render(
      <Toolbar
        contract={runOnlyContract}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('run-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('viz-picker')).toBeNull();
  });

  it('sources run selector options from query_params when control.field is absent', () => {
    const contract: VisualizationContract = {
      ...BASE_CONTRACT,
      controls: [{ type: 'run_selector', param: 'run_id' }],
      query_params: {
        run_selector: { field: 'correlation_id', param: 'run_id' },
      },
    };
    render(
      <Toolbar
        contract={contract}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    const selector = screen.getByTestId('run-selector') as HTMLSelectElement;
    const options = Array.from(selector.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('run-abc');
    expect(options).toContain('run-xyz');
    expect(options.filter((o) => o === 'run-abc')).toHaveLength(1);
  });

  it('sources run selector options from query_params with multiple controls', () => {
    const contract: VisualizationContract = {
      ...BASE_CONTRACT,
      controls: [
        { type: 'run_selector', param: 'run_id' },
        { type: 'visualization_picker' },
      ],
      query_params: {
        run_selector: { field: 'correlation_id', param: 'run_id' },
      },
    };
    render(
      <Toolbar
        contract={contract}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('viz-picker')).toBeInTheDocument();
    const selector = screen.getByTestId('run-selector') as HTMLSelectElement;
    const options = Array.from(selector.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('run-abc');
    expect(options).toContain('run-xyz');
    expect(options.filter((o) => o === 'run-abc')).toHaveLength(1);
  });

  it('prefers query_params run selector field over control.field when both are present', () => {
    const contract: VisualizationContract = {
      ...BASE_CONTRACT,
      controls: [{ type: 'run_selector', field: 'legacy_field', param: 'run_id' }],
      query_params: {
        run_selector: { field: 'correlation_id', param: 'run_id' },
      },
    };
    render(
      <Toolbar
        contract={contract}
        data={[...MOCK_DATA, { legacy_field: 'wrong-run', correlation_id: 'run-query-param' }]}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    const selector = screen.getByTestId('run-selector') as HTMLSelectElement;
    const options = Array.from(selector.options).map((o) => o.value);
    expect(options).toContain('run-query-param');
    expect(options).not.toContain('wrong-run');
  });

  it('returns null when contract.controls is empty', () => {
    const emptyContract: VisualizationContract = { ...BASE_CONTRACT, controls: [] };
    const { container } = render(
      <Toolbar
        contract={emptyContract}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('viz-picker lists all available_visualizations from contract', () => {
    render(
      <Toolbar
        contract={BASE_CONTRACT}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    const picker = screen.getByTestId('viz-picker') as HTMLSelectElement;
    const options = Array.from(picker.options).map((o) => o.value);
    expect(options).toEqual(['bar_chart', 'scatter_plot', 'table']);
  });

  it('viz-picker shows active visualization as selected', () => {
    render(
      <Toolbar
        contract={BASE_CONTRACT}
        data={MOCK_DATA}
        activeVisualization="scatter_plot"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    const picker = screen.getByTestId('viz-picker') as HTMLSelectElement;
    expect(picker.value).toBe('scatter_plot');
  });

  it('onVizChange is called with new visualization type when picker changes', () => {
    const onVizChange = vi.fn();
    render(
      <Toolbar
        contract={BASE_CONTRACT}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={onVizChange}
        onRunChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('viz-picker'), { target: { value: 'table' } });
    expect(onVizChange).toHaveBeenCalledWith('table');
  });

  it('run-selector lists unique values of the group_by field from data', () => {
    render(
      <Toolbar
        contract={BASE_CONTRACT}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={vi.fn()}
      />,
    );
    const selector = screen.getByTestId('run-selector') as HTMLSelectElement;
    const options = Array.from(selector.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('run-abc');
    expect(options).toContain('run-xyz');
    // run-abc appears twice in data but should be deduplicated
    expect(options.filter((o) => o === 'run-abc')).toHaveLength(1);
  });

  it('onRunChange is called with run id when selector changes', () => {
    const onRunChange = vi.fn();
    render(
      <Toolbar
        contract={BASE_CONTRACT}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={onRunChange}
      />,
    );
    fireEvent.change(screen.getByTestId('run-selector'), { target: { value: 'run-xyz' } });
    expect(onRunChange).toHaveBeenCalledWith('run-xyz');
  });

  it('onRunChange is called with null when "All runs" is selected', () => {
    const onRunChange = vi.fn();
    render(
      <Toolbar
        contract={BASE_CONTRACT}
        data={MOCK_DATA}
        activeVisualization="bar_chart"
        onVizChange={vi.fn()}
        onRunChange={onRunChange}
      />,
    );
    // First select a run, then reset to "All runs"
    fireEvent.change(screen.getByTestId('run-selector'), { target: { value: '' } });
    expect(onRunChange).toHaveBeenCalledWith(null);
  });
});
