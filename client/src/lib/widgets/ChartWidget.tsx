/**
 * ChartWidget
 *
 * A contract-driven chart component that renders various chart types
 * based on the widget configuration. Supports line, bar, area, pie, and scatter charts.
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

// Semantic chart colors from CSS variables
const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

interface ChartWidgetProps {
  widget: WidgetDefinition;
  config: WidgetConfigChart;
  data: DashboardData;
  isLoading?: boolean;
}

/**
 * Get color for a series at a given index.
 * Falls back to semantic chart colors if not specified.
 */
function getSeriesColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Loading skeleton for chart widgets
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
 * Common tooltip styles matching the codebase pattern
 */
const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  fontSize: '12px',
};

/**
 * Render a line chart
 */
function renderLineChart(chartData: unknown[], config: WidgetConfigChart) {
  return (
    <LineChart data={chartData}>
      {config.x_axis?.show_grid !== false && (
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
      )}
      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
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
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      ))}
    </LineChart>
  );
}

/**
 * Render a bar chart
 */
function renderBarChart(chartData: unknown[], config: WidgetConfigChart) {
  return (
    <BarChart data={chartData}>
      {config.x_axis?.show_grid !== false && (
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
      )}
      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
        tickLine={false}
        label={
          config.y_axis?.label
            ? { value: config.y_axis.label, angle: -90, position: 'insideLeft' }
            : undefined
        }
        domain={[config.y_axis?.min_value ?? 'auto', config.y_axis?.max_value ?? 'auto']}
      />
      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
      {config.show_legend && <Legend />}
      {config.series.map((series, index) => (
        <Bar
          key={series.data_key}
          dataKey={series.data_key}
          name={series.name}
          fill={getSeriesColor(index)}
          radius={[4, 4, 0, 0]}
          stackId={config.stacked ? 'stack' : undefined}
        />
      ))}
    </BarChart>
  );
}

/**
 * Render an area chart
 */
function renderAreaChart(chartData: unknown[], config: WidgetConfigChart) {
  return (
    <AreaChart data={chartData}>
      {config.x_axis?.show_grid !== false && (
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
      )}
      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
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
          fillOpacity={0.2}
          stackId={config.stacked ? 'stack' : undefined}
        />
      ))}
    </AreaChart>
  );
}

/**
 * Render a pie chart
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
        innerRadius={40}
        outerRadius={80}
        paddingAngle={2}
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
 * Render a scatter chart
 */
function renderScatterChart(chartData: unknown[], config: WidgetConfigChart) {
  // Scatter charts typically use x and y data keys
  const xKey = config.series[0]?.data_key || 'x';
  const yKey = config.series[1]?.data_key || 'y';

  return (
    <ScatterChart>
      {config.x_axis?.show_grid !== false && (
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
      )}
      <XAxis
        type="number"
        dataKey={xKey}
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
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
        fontSize={12}
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
