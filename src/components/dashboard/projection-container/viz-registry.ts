import type { JSX } from 'react';
import type { VisualizationContract, VisualizationType } from '@shared/types/visualization-contract';

export interface VizAdapter {
  render(props: { data: unknown[]; contract: VisualizationContract }): JSX.Element;
}

export const vizRegistry: Partial<Record<VisualizationType, VizAdapter>> = {};

export function registerViz(type: VisualizationType, adapter: VizAdapter): void {
  vizRegistry[type] = adapter;
}
