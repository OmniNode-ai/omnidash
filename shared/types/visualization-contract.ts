export interface VisualizationContract {
  version: string;
  topic: string;
  display_name: string;
  default_visualization: VisualizationType;
  available_visualizations: VisualizationType[];
  controls: ControlSpec[];
  display_name_field: string;
  cost_field: string;
  latency_field: string;
  group_by: string;
  query_params?: {
    run_selector?: { field: string; param: string };
    time_range?: { field: string; param: string };
    model_filter?: { field: string; param: string };
  };
}

export type VisualizationType = 'table' | 'bar_chart' | 'scatter_plot' | 'trend_line' | 'kpi_tiles';

export interface ControlSpec {
  type: 'run_selector' | 'time_range' | 'model_filter' | 'visualization_picker';
  field?: string;
  param?: string;
}

export const AB_COMPARE_VIZ_CONTRACT: VisualizationContract = {
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
