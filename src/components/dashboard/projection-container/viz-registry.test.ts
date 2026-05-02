import { describe, it, expect, beforeEach } from 'vitest';
import { vizRegistry, registerViz } from './viz-registry';
import type { VisualizationContract } from '../../../../shared/types/visualization-contract';

const stubContract: VisualizationContract = {
  version: '1.0.0',
  topic: 'test',
  display_name: 'Test',
  default_visualization: 'bar_chart',
  available_visualizations: ['bar_chart'],
  controls: [],
  display_name_field: 'display_name',
  cost_field: 'cost_usd',
  latency_field: 'latency_ms',
  group_by: 'correlation_id',
};

describe('viz-registry', () => {
  beforeEach(() => {
    // Clear registry between tests.
    for (const key of Object.keys(vizRegistry)) {
      delete vizRegistry[key as keyof typeof vizRegistry];
    }
  });

  it('registerViz stores adapter under correct type key', () => {
    const mockAdapter = { render: () => null as unknown as ReturnType<typeof import('react').createElement> };
    registerViz('bar_chart', mockAdapter);
    expect(vizRegistry['bar_chart']).toBe(mockAdapter);
  });

  it('unregistered type returns undefined', () => {
    expect(vizRegistry['scatter_plot']).toBeUndefined();
  });

  it('registered adapter receives data and contract', () => {
    const received: { data: unknown[]; contract: VisualizationContract }[] = [];
    registerViz('bar_chart', {
      render(props) {
        received.push(props);
        return null as unknown as ReturnType<typeof import('react').createElement>;
      },
    });
    const data = [{ cost_usd: 1 }];
    vizRegistry['bar_chart']!.render({ data, contract: stubContract });
    expect(received).toHaveLength(1);
    expect(received[0].data).toBe(data);
    expect(received[0].contract).toBe(stubContract);
  });
});
