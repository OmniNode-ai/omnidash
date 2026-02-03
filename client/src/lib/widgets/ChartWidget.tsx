/**
 * ChartWidget
 *
 * A contract-driven chart component that renders various chart types
 * based on the widget configuration. Supports line, bar, area, pie, donut, and scatter charts.
 *
 * Features:
 * - Toggle between chart types (e.g., donut ↔ bar)
 * - Top N aggregation for charts with many categories
 * - Responsive sizing
 *
 * @module lib/widgets/ChartWidget
 */

import { useState, useMemo } from 'react';
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
import { Button } from '@/components/ui/button';
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';

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

/** Default key for value field in chart data objects */
const DEFAULT_VALUE_KEY = 'value';

/**
 * Semantic chart colors from CSS variables.
 *
 * Color Selection Strategy:
 * - Uses 60°+ hue separation between adjacent colors in the sequence for accessibility
 * - Ensures distinguishability for users with color vision deficiencies (deuteranopia,
 *   protanopia, tritanopia) by maximizing perceptual distance between commonly
 *   co-occurring colors
 * - Colors are designed to work in both light and dark themes with adjusted
 *   saturation and lightness values per theme
 *
 * Hue Distribution (approximate, from CSS variables):
 * - chart-1: ~211° (Blue)
 * - chart-2: ~142° (Green)
 * - chart-3: ~271° (Purple)
 * - chart-4: ~32° (Orange)
 * - chart-5: ~355° (Red)
 * - chart-6: ~175° (Teal)
 * - chart-7: ~48° (Yellow)
 *
 * Adjacent hue separations in the sequence:
 * - Blue → Green: 69°
 * - Green → Purple: 129°
 * - Purple → Orange: 121°
 * - Orange → Red: 37° (closest pair, but rarely adjacent in typical datasets)
 * - Red → Teal: 180°
 * - Teal → Yellow: 127°
 *
 * The sequence is optimized so that the most commonly used colors (first 3-4)
 * have strong separation, while later colors maintain reasonable distinction.
 *
 * @see client/src/index.css for actual HSL values in light/dark modes
 */
const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
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
 * Aggregates chart data to show top N items plus an "Other" category.
 *
 * This prevents pie/donut charts from becoming unreadable when there
 * are many categories. Items are sorted by value descending, and items
 * beyond maxItems are combined into a single "Other" entry.
 *
 * @param data - Array of data objects with name and value fields
 * @param maxItems - Maximum number of individual items to show
 * @param valueKey - The key to use for the value field (default: 'value' or 'eventCount')
 * @returns Aggregated data array with "Other" category if needed
 */
function aggregateToTopN(
  data: Record<string, unknown>[],
  maxItems: number,
  valueKey: string = DEFAULT_VALUE_KEY
): Record<string, unknown>[] {
  if (data.length <= maxItems) {
    return data;
  }

  // Determine the actual value key (could be 'value', 'eventCount', etc.)
  const actualValueKey =
    data[0]?.[valueKey] !== undefined
      ? valueKey
      : data[0]?.['eventCount'] !== undefined
        ? 'eventCount'
        : DEFAULT_VALUE_KEY;

  // Sort by value descending
  const sorted = [...data].sort((a, b) => {
    const aVal = Number(a[actualValueKey]) || 0;
    const bVal = Number(b[actualValueKey]) || 0;
    return bVal - aVal;
  });

  // Take top N-1 items to leave room for "Other"
  const topItems = sorted.slice(0, maxItems - 1);

  // Sum remaining items into "Other"
  const otherItems = sorted.slice(maxItems - 1);
  const otherTotal = otherItems.reduce((sum, item) => {
    return sum + (Number(item[actualValueKey]) || 0);
  }, 0);

  if (otherTotal > 0) {
    topItems.push({
      name: `Other (${otherItems.length})`,
      [actualValueKey]: otherTotal,
    });
  }

  return topItems;
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
          isAnimationActive={false}
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
          isAnimationActive={false}
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
        label={
          config.x_axis?.label
            ? { value: config.x_axis.label, position: 'bottom', offset: -5 }
            : undefined
        }
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
          isAnimationActive={false}
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
    // Increased top/bottom margins to prevent percentage labels from being clipped
    // Labels at 12 o'clock and 6 o'clock positions extend beyond the pie outer radius
    <PieChart margin={{ top: 25, right: 10, bottom: 25, left: 10 }}>
      <Pie
        data={chartData}
        dataKey={valueKey}
        nameKey={nameKey}
        cx={config.show_legend ? '32%' : '50%'}
        cy="50%"
        innerRadius={35}
        outerRadius={70}
        paddingAngle={PIE_PADDING_ANGLE}
        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
        labelLine={false}
        isAnimationActive={false}
      >
        {(chartData as Record<string, unknown>[]).map((_, index) => (
          <Cell key={`cell-${index}`} fill={getSeriesColor(index)} />
        ))}
      </Pie>
      <Tooltip contentStyle={tooltipStyle} />
      {config.show_legend && (
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{
            paddingLeft: '12px',
            fontSize: '11px',
            lineHeight: '1.4',
          }}
          formatter={(value: string) => (
            <span style={{ display: 'inline', whiteSpace: 'nowrap' }}>{value}</span>
          )}
        />
      )}
    </PieChart>
  );
}

/**
 * Renders a donut chart using Recharts PieChart component with inner radius.
 *
 * Donut charts are pie charts with a hollow center, making them more visually
 * appealing and easier to read for part-to-whole comparisons. The center
 * space can optionally display a total or label.
 *
 * Better than pie charts for:
 * - Multiple small slices (easier to compare arc lengths)
 * - Dashboards (more modern, less visually heavy)
 * - Showing proportions without exact values
 *
 * @param chartData - Array of data points with name and value properties
 * @param config - Chart configuration with legend settings
 * @returns A PieChart component configured as a donut
 */
function renderDonutChart(chartData: unknown[], config: WidgetConfigChart) {
  // Determine the value key from the data
  const firstItem = chartData[0] as Record<string, unknown> | undefined;
  const valueKey =
    firstItem?.['value'] !== undefined
      ? 'value'
      : firstItem?.['eventCount'] !== undefined
        ? 'eventCount'
        : 'value';
  const nameKey = 'name';

  // Calculate total for center label
  const total = (chartData as Record<string, unknown>[]).reduce((sum, item) => {
    return sum + (Number(item[valueKey]) || 0);
  }, 0);

  return (
    <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
      <Pie
        data={chartData}
        dataKey={valueKey}
        nameKey={nameKey}
        cx={config.show_legend ? '35%' : '50%'}
        cy="50%"
        innerRadius="55%"
        outerRadius="85%"
        paddingAngle={2}
        label={({ percent }) => (percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '')}
        labelLine={false}
        isAnimationActive={false}
      >
        {(chartData as Record<string, unknown>[]).map((_, index) => (
          <Cell key={`cell-${index}`} fill={getSeriesColor(index)} />
        ))}
      </Pie>
      <Tooltip
        contentStyle={tooltipStyle}
        formatter={(value: number, name: string) => {
          const safePercent = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
          return [`${value.toLocaleString()} (${safePercent}%)`, name];
        }}
      />
      {config.show_legend && (
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{
            paddingLeft: '8px',
            fontSize: '11px',
            lineHeight: '1.5',
          }}
          formatter={(value: string) => (
            <span style={{ display: 'inline', whiteSpace: 'nowrap' }}>{value}</span>
          )}
        />
      )}
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
  // Toggle state for switching between chart types
  const [useAlternate, setUseAlternate] = useState(false);

  // Determine the active chart type
  const activeChartType =
    useAlternate && config.alternate_chart_type ? config.alternate_chart_type : config.chart_type;

  // Check if this chart type benefits from aggregation
  const shouldAggregate = ['pie', 'donut'].includes(activeChartType);
  // Default from schema: CHART_MAX_ITEMS_DEFAULT (7)
  const maxItems = config.max_items ?? 7;

  // Extract chart data using explicit data_key or fallback to heuristics
  // Must happen before any returns to maintain hooks order
  const rawChartData = useMemo(() => {
    let result: unknown[] = [];

    // 1. Use explicit data_key if provided (preferred)
    if (config.data_key && Array.isArray(data[config.data_key])) {
      result = data[config.data_key] as unknown[];
    }
    // 2. Fallback: try the first series data_key as an array key
    else {
      const primaryDataKey = config.series[0]?.data_key;
      if (primaryDataKey && Array.isArray(data[primaryDataKey])) {
        result = data[primaryDataKey] as unknown[];
      } else {
        // 3. Last resort: look for any array in data
        const arrayKeys = Object.keys(data).filter((key) => Array.isArray(data[key]));
        if (arrayKeys.length > 0) {
          result = data[arrayKeys[0]] as unknown[];
        }
      }
    }

    // If still no data, check for a 'data' key
    if (result.length === 0 && Array.isArray(data['data'])) {
      result = data['data'] as unknown[];
    }

    return result;
  }, [data, config.data_key, config.series]);

  // Apply Top N aggregation for pie/donut charts with many categories
  const chartData = useMemo(() => {
    if (shouldAggregate && rawChartData.length > maxItems) {
      return aggregateToTopN(
        rawChartData as Record<string, unknown>[],
        maxItems,
        config.series[0]?.data_key || 'value'
      );
    }
    return rawChartData;
  }, [rawChartData, shouldAggregate, maxItems, config.series]);

  if (isLoading) {
    return <ChartSkeleton title={widget.title} />;
  }

  // Render appropriate chart type
  const renderChart = () => {
    switch (activeChartType) {
      case 'line':
        return renderLineChart(chartData, config);
      case 'bar':
        return renderBarChart(chartData, config);
      case 'area':
        return renderAreaChart(chartData, config);
      case 'pie':
        return renderPieChart(chartData, config);
      case 'donut':
        return renderDonutChart(chartData, config);
      case 'scatter':
        return renderScatterChart(chartData, config);
      default:
        return renderLineChart(chartData, config);
    }
  };

  // Determine icons for toggle button
  const getToggleIcon = () => {
    const targetType = useAlternate ? config.chart_type : config.alternate_chart_type;
    if (targetType === 'bar') return <BarChart3 className="h-3.5 w-3.5" />;
    if (targetType === 'donut' || targetType === 'pie')
      return <PieChartIcon className="h-3.5 w-3.5" />;
    return <BarChart3 className="h-3.5 w-3.5" />;
  };

  const hasToggle = !!config.alternate_chart_type;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{widget.title}</CardTitle>
            {widget.description && (
              <CardDescription className="text-xs">{widget.description}</CardDescription>
            )}
          </div>
          {hasToggle && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setUseAlternate(!useAlternate)}
              title={`Switch to ${useAlternate ? config.chart_type : config.alternate_chart_type} view`}
            >
              {getToggleIcon()}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-[200px] pb-4">
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <span className="text-sm">No data available</span>
            <span className="text-xs">Start demo playback to see events</span>
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
