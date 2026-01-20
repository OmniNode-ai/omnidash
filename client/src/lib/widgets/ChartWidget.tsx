/**
 * ChartWidget
 *
 * A contract-driven chart component that renders various chart types
 * based on the widget configuration. Supports line, bar, area, pie, and scatter charts.
 *
 * @module lib/widgets/ChartWidget
 */

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { WidgetDefinition, WidgetConfigChart, DashboardData } from '@/lib/dashboard-schema';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Chart dimension and style constants.
 * Extracted from Recharts component props for maintainability.
 */
const AXIS_FONT_SIZE = 12;
const GRID_OPACITY = 0.3;
const TOOLTIP_BORDER_RADIUS = '6px';
const TOOLTIP_FONT_SIZE = '12px';
const LINE_STROKE_WIDTH = 2;
const ACTIVE_DOT_RADIUS = 4;
const BAR_CORNER_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const AREA_FILL_OPACITY = 0.2;
const PIE_INNER_RADIUS = 40;
const PIE_OUTER_RADIUS = 80;
const PIE_PADDING_ANGLE = 2;

/**
 * Semantic chart colors from CSS variables.
 * These colors are designed to work in both light and dark themes.
 */
const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

/**
 * Props for the ChartWidget component.
 *
 * @interface ChartWidgetProps
 */
interface ChartWidgetProps {
  /**
   * The widget definition containing common properties like
   * widget_id, title, and description.
   */
  widget: WidgetDefinition;

  /**
   * The chart-specific configuration including:
   * - chart_type: The type of chart (line, bar, area, pie, scatter)
   * - series: Array of data series to display
   * - x_axis/y_axis: Axis configuration (labels, grid, domain)
   * - show_legend: Whether to display the legend
   * - stacked: Whether to stack series (bar/area charts)
   */
  config: WidgetConfigChart;

  /**
   * The dashboard data object containing chart data arrays.
   * The widget looks for arrays at the configured data keys.
   */
  data: DashboardData;

  /**
   * When true, displays a loading skeleton instead of the chart.
   *
   * @default false
   */
  isLoading?: boolean;
}

/**
 * Gets the color for a chart series at a given index.
 *
 * Uses modulo arithmetic to cycle through CHART_COLORS array,
 * ensuring consistent color assignment regardless of series count.
 *
 * @param index - The zero-based series index
 * @returns An HSL color string from the semantic chart palette
 *
 * @example
 * ```ts
 * getSeriesColor(0)  // "hsl(var(--chart-1))"
 * getSeriesColor(5)  // "hsl(var(--chart-1))" (wraps around)
 * ```
 */
function getSeriesColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Renders a loading skeleton placeholder for chart widgets.
 *
 * Displays an animated skeleton UI while chart data is loading,
 * maintaining the same card structure as the loaded chart.
 *
 * @param props - Component props
 * @param props.title - The chart title to display in the header
 * @returns A Card with animated skeleton placeholders
 */
function ChartSkeleton({ title }: { title: string }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-48 w-full" />
          <div className="flex justify-center gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Common tooltip styles for Recharts tooltips.
 *
 * Uses CSS custom properties to match the application's theme,
 * ensuring tooltips look consistent in both light and dark modes.
 */
const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: TOOLTIP_BORDER_RADIUS,
  fontSize: TOOLTIP_FONT_SIZE,
};

/**
 * Renders a line chart using Recharts LineChart component.
 *
 * Line charts are ideal for showing trends over time or continuous data.
 * Supports multiple series with automatic color assignment.
 *
 * @param chartData - Array of data points with name and value properties
 * @param config - Chart configuration with series and axis settings
 * @returns A LineChart component configured according to the spec
 */
function renderLineChart(chartData: unknown[], config: WidgetConfigChart) {
  return (
    <LineChart data={chartData}>
      {config.x_axis?.show_grid !== false && (
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={GRID_OPACITY} />
      )}
      <XAxis
        dataKey="name"
        stroke="hsl(var(--muted-foreground))"
        fontSize={AXIS_FONT_SIZE}
        tickLine={false}
      />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={AXIS_FONT_SIZE}
        tickLine={false}
        label={
          config.y_axis?.label
            ? { value: config.y_axis.label, angle: -90, position: 'insideLeft' }
            : undefined
        }
        domain={[config.y_axis?.min_value ?? 'auto', config.y_axis?.max_value ?? 'auto']}
      />
      <Tooltip contentStyle={tooltipStyle} />
      {config.show_legend && <Legend />}
      {config.series.map((series, index) => (
        <Line
          key={series.data_key}
          type="monotone"
          dataKey={series.data_key}
          name={series.name}
          stroke={getSeriesColor(index)}
          strokeWidth={LINE_STROKE_WIDTH}
          dot={false}
          activeDot={{ r: ACTIVE_DOT_RADIUS }}
        />
      ))}
    </LineChart>
  );
}

/**
 * Renders a bar chart using Recharts BarChart component.
 *
 * Bar charts are ideal for comparing categorical data.
 * Supports stacked bars when config.stacked is true.
 *
 * @param chartData - Array of data points with category names and values
 * @param config - Chart configuration with series and stacking settings
 * @returns A BarChart component configured according to the spec
 */
function renderBarChart(chartData: unknown[], config: WidgetConfigChart) {
  return (
    <BarChart data={chartData}>
      {config.x_axis?.show_grid !== false && (
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={GRID_OPACITY} />
      )}
      <XAxis
        dataKey="name"
        stroke="hsl(var(--muted-foreground))"
        fontSize={AXIS_FONT_SIZE}
        tickLine={false}
      />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={AXIS_FONT_SIZE}
        tickLine={false}
        label={
          config.y_axis?.label
            ? { value: config.y_axis.label, angle: -90, position: 'insideLeft' }
            : undefined
        }
        domain={[config.y_axis?.min_value ?? 'auto', config.y_axis?.max_value ?? 'auto']}
      />
      <Tooltip
        contentStyle={tooltipStyle}
        cursor={{ fill: 'hsl(var(--muted))', opacity: GRID_OPACITY }}
      />
      {config.show_legend && <Legend />}
      {config.series.map((series, index) => (
        <Bar
          key={series.data_key}
          dataKey={series.data_key}
          name={series.name}
          fill={getSeriesColor(index)}
          radius={BAR_CORNER_RADIUS}
          stackId={config.stacked ? 'stack' : undefined}
        />
      ))}
    </BarChart>
  );
}

/**
 * Renders an area chart using Recharts AreaChart component.
 *
 * Area charts are similar to line charts but with filled areas below the lines.
 * Ideal for showing volume or cumulative values over time.
 * Supports stacked areas when config.stacked is true.
 *
 * @param chartData - Array of data points with name and value properties
 * @param config - Chart configuration with series and stacking settings
 * @returns An AreaChart component configured according to the spec
 */
function renderAreaChart(chartData: unknown[], config: WidgetConfigChart) {
  return (
    <AreaChart data={chartData}>
      {config.x_axis?.show_grid !== false && (
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={GRID_OPACITY} />
      )}
      <XAxis
        dataKey="name"
        stroke="hsl(var(--muted-foreground))"
        fontSize={AXIS_FONT_SIZE}
        tickLine={false}
      />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={AXIS_FONT_SIZE}
        tickLine={false}
        label={
          config.y_axis?.label
            ? { value: config.y_axis.label, angle: -90, position: 'insideLeft' }
            : undefined
        }
        domain={[config.y_axis?.min_value ?? 'auto', config.y_axis?.max_value ?? 'auto']}
      />
      <Tooltip contentStyle={tooltipStyle} />
      {config.show_legend && <Legend />}
      {config.series.map((series, index) => (
        <Area
          key={series.data_key}
          type="monotone"
          dataKey={series.data_key}
          name={series.name}
          stroke={getSeriesColor(index)}
          fill={getSeriesColor(index)}
          fillOpacity={AREA_FILL_OPACITY}
          stackId={config.stacked ? 'stack' : undefined}
        />
      ))}
    </AreaChart>
  );
}

/**
 * Renders a pie chart using Recharts PieChart component.
 *
 * Pie charts display data as proportional slices of a circle.
 * Best used for showing parts of a whole with limited categories (5-7 max).
 * Displays as a donut chart with inner radius for better label readability.
 *
 * **Note on data_key semantics:**
 * The `data_key` field in series config has dual semantics depending on chart type:
 * - **Pie charts**: `data_key` identifies the array in DashboardData (e.g., "distribution").
 *   The array items must have `name` and `value` fields per Recharts convention.
 * - **Line/Bar/Area charts**: `data_key` identifies fields within array objects
 *   (e.g., "requests", "errors") that map to Y-axis values.
 *
 * @param chartData - Array of data points with name and value properties
 * @param config - Chart configuration with legend settings
 * @returns A PieChart component with labeled segments
 */
function renderPieChart(chartData: unknown[], config: WidgetConfigChart) {
  // For pie charts, always use 'value' as the value key (standard Recharts convention)
  // The series data_key is used to locate the data array in DashboardData, not the field name
  const valueKey = 'value';
  const nameKey = 'name';

  return (
    <PieChart>
      <Pie
        data={chartData}
        dataKey={valueKey}
        nameKey={nameKey}
        cx="50%"
        cy="50%"
        innerRadius={PIE_INNER_RADIUS}
        outerRadius={PIE_OUTER_RADIUS}
        paddingAngle={PIE_PADDING_ANGLE}
        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
        labelLine={false}
      >
        {(chartData as Record<string, unknown>[]).map((_, index) => (
          <Cell key={`cell-${index}`} fill={getSeriesColor(index)} />
        ))}
      </Pie>
      <Tooltip contentStyle={tooltipStyle} />
      {config.show_legend && <Legend />}
    </PieChart>
  );
}

/**
 * Renders a scatter chart using Recharts ScatterChart component.
 *
 * Scatter charts display individual data points to show correlation
 * between two numeric variables. Uses the first two series data_keys
 * as x and y coordinates.
 *
 * @param chartData - Array of data points with x and y coordinates
 * @param config - Chart configuration with axis labels and domain settings
 * @returns A ScatterChart component showing data point distribution
 */
function renderScatterChart(chartData: unknown[], config: WidgetConfigChart) {
  // Scatter charts typically use x and y data keys
  const xKey = config.series[0]?.data_key || 'x';
  const yKey = config.series[1]?.data_key || 'y';

  return (
    <ScatterChart>
      {config.x_axis?.show_grid !== false && (
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={GRID_OPACITY} />
      )}
      <XAxis
        type="number"
        dataKey={xKey}
        stroke="hsl(var(--muted-foreground))"
        fontSize={AXIS_FONT_SIZE}
        tickLine={false}
        label={
          config.x_axis?.label ? { value: config.x_axis.label, position: 'bottom' } : undefined
        }
        domain={[config.x_axis?.min_value ?? 'auto', config.x_axis?.max_value ?? 'auto']}
      />
      <YAxis
        type="number"
        dataKey={yKey}
        stroke="hsl(var(--muted-foreground))"
        fontSize={AXIS_FONT_SIZE}
        tickLine={false}
        label={
          config.y_axis?.label
            ? { value: config.y_axis.label, angle: -90, position: 'insideLeft' }
            : undefined
        }
        domain={[config.y_axis?.min_value ?? 'auto', config.y_axis?.max_value ?? 'auto']}
      />
      <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
      {config.show_legend && <Legend />}
      <Scatter name={config.series[0]?.name || 'Data'} data={chartData} fill={getSeriesColor(0)} />
    </ScatterChart>
  );
}

/**
 * Renders a chart widget based on contract-driven configuration.
 *
 * The ChartWidget component connects the dashboard schema to Recharts,
 * providing a unified API for rendering different chart types. It handles:
 * - Chart type selection (line, bar, area, pie, scatter)
 * - Data extraction from DashboardData
 * - Loading states with skeleton UI
 * - Empty state handling
 * - Responsive sizing
 *
 * @example
 * ```tsx
 * const config: WidgetConfigChart = {
 *   type: 'chart',
 *   chart_type: 'line',
 *   series: [
 *     { data_key: 'requests', name: 'Requests' },
 *     { data_key: 'errors', name: 'Errors' }
 *   ],
 *   show_legend: true,
 *   y_axis: { label: 'Count' }
 * };
 *
 * <ChartWidget
 *   widget={widgetDef}
 *   config={config}
 *   data={{
 *     requests: [
 *       { name: 'Mon', requests: 100, errors: 5 },
 *       { name: 'Tue', requests: 120, errors: 3 }
 *     ]
 *   }}
 * />
 * ```
 *
 * @param props - Component props
 * @returns A card containing the configured chart type
 */
export function ChartWidget({ widget, config, data, isLoading }: ChartWidgetProps) {
  if (isLoading) {
    return <ChartSkeleton title={widget.title} />;
  }

  // Extract chart data from the first series data_key
  // The data should be an array at this key
  const primaryDataKey = config.series[0]?.data_key;
  let chartData: unknown[] = [];

  // Try to find data - check if there's a common data key pattern
  // First check if data has a direct array at the series data key
  if (primaryDataKey && Array.isArray(data[primaryDataKey])) {
    chartData = data[primaryDataKey] as unknown[];
  } else {
    // Look for array data in the dashboard data
    const arrayKeys = Object.keys(data).filter((key) => Array.isArray(data[key]));
    if (arrayKeys.length > 0) {
      // Use the first array found
      chartData = data[arrayKeys[0]] as unknown[];
    }
  }

  // If still no data, check for a 'data' key
  if (chartData.length === 0 && Array.isArray(data['data'])) {
    chartData = data['data'] as unknown[];
  }

  // Render appropriate chart type
  const renderChart = () => {
    switch (config.chart_type) {
      case 'line':
        return renderLineChart(chartData, config);
      case 'bar':
        return renderBarChart(chartData, config);
      case 'area':
        return renderAreaChart(chartData, config);
      case 'pie':
        return renderPieChart(chartData, config);
      case 'scatter':
        return renderScatterChart(chartData, config);
      default:
        return renderLineChart(chartData, config);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{widget.title}</CardTitle>
        {widget.description && (
          <CardDescription className="text-xs">{widget.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
