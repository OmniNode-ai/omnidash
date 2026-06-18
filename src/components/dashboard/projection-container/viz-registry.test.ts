import { describe, it, expect, beforeEach } from 'vitest';
import { vizRegistry, registerViz, resolveViz } from './viz-registry';
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

  describe('resolveViz — capability-driven selection (OMN-13131, W4)', () => {
    it('resolves a registered visualization via capability dispatch', () => {
      const adapter = {
        render: () => null as unknown as ReturnType<typeof import('react').createElement>,
      };
      registerViz('bar_chart', adapter);
      expect(resolveViz('bar_chart')).toBe(adapter);
    });

    it('returns null for an unregistered type — absent capability handled, not thrown', () => {
      let result: ReturnType<typeof resolveViz> | undefined;
      expect(() => {
        result = resolveViz('scatter_plot');
      }).not.toThrow();
      expect(result).toBeNull();
    });

    it('selects the renderer for the component kind the visualization advertises', () => {
      const tableAdapter = {
        render: () => null as unknown as ReturnType<typeof import('react').createElement>,
      };
      registerViz('table', tableAdapter);
      // 'table' maps to component kind 'table'; the capability dispatcher must
      // select the registered renderer whose advertised kind satisfies it.
      expect(resolveViz('table')).toBe(tableAdapter);
    });
  });
});
