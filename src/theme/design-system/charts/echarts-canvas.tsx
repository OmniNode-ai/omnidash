import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([BarChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);

/** The props a chart passes to its ECharts canvas: the option, the click handlers and the canvas class. */
export interface EChartProps {
  option: Record<string, unknown>;
  /** ECharts hands each handler its own event shape, so each handler is typed by the chart that registers it. */
  onEvents?: Record<string, (params: never) => void>;
}

/**
 * OMN-23330 AC22: the one place echarts is imported. It is loaded only when a chart that draws with it renders (see
 * echarts-lazy.tsx), so a page with no such chart never downloads echarts. Every chart is drawn as SVG, never merged.
 */
export function EChartCanvas({ option, onEvents }: EChartProps) {
  // OMN-23330 AC30: no inline height (echarts-for-react writes 300px unless told otherwise), so each chart's height is
  // its stylesheet's alone; the page rules had needed !important to beat the inline 300px.
  return <ReactEChartsCore echarts={echarts} option={option} notMerge opts={{ renderer: 'svg' }} className="local-chart-canvas"
    style={{ height: undefined }} onEvents={onEvents} />;
}

export default EChartCanvas;
