/**
 * MetricCardWidget
 *
 * A contract-driven wrapper for MetricCard that pulls data from DashboardData
 * based on the widget configuration.
 *
 * @module lib/widgets/MetricCardWidget
 */

import type {
  WidgetDefinition,
  WidgetConfigMetricCard,
  DashboardData,
} from '@/lib/dashboard-schema';
import { MetricCard } from '@/components/MetricCard';

/**
 * Props for the MetricCardWidget component.
 *
 * @interface MetricCardWidgetProps
 */
interface MetricCardWidgetProps {
  /**
   * The widget definition containing common properties like
   * widget_id, title, and description.
   */
  widget: WidgetDefinition;

  /**
   * The metric card-specific configuration including:
   * - metric_key: Key to look up the value in data
   * - label: Display label for the metric
   * - value_format: How to format the value (number, percent, currency, duration)
   * - thresholds: Optional severity thresholds for status indication
   * - show_trend: Whether to display trend information
   * - trend_key: Key to look up trend value in data
   */
  config: WidgetConfigMetricCard;

  /**
   * The dashboard data object containing all metric values.
   * The widget will look up config.metric_key in this object.
   */
  data: DashboardData;

  /**
   * When true, displays a loading skeleton instead of actual data.
   *
   * @default false
   */
  isLoading?: boolean;
}

/**
 * Renders a metric card widget that displays a single numeric value.
 *
 * This widget connects the contract-driven configuration system to the
 * MetricCard component. It handles:
 * - Data extraction from DashboardData using the configured metric_key
 * - Value formatting (number, percent, currency, duration)
 * - Threshold-based status coloring (healthy, warning, error)
 * - Trend indicator display when configured
 *
 * @example
 * ```tsx
 * const config: WidgetConfigMetricCard = {
 *   type: 'metric_card',
 *   metric_key: 'cpu_usage',
 *   label: 'CPU Usage',
 *   value_format: 'percent',
 *   precision: 1,
 *   thresholds: [
 *     { value: 90, severity: 'critical' },
 *     { value: 70, severity: 'warning' }
 *   ]
 * };
 *
 * <MetricCardWidget
 *   widget={widgetDef}
 *   config={config}
 *   data={{ cpu_usage: 75.5 }}
 * />
 * // Renders: "CPU Usage: 75.5%" with warning status
 * ```
 *
 * @param props - Component props
 * @returns A MetricCard component with data-bound values
 */
export function MetricCardWidget({ widget, config, data, isLoading }: MetricCardWidgetProps) {
  if (isLoading) {
    return <MetricCard label={config.label} value="..." className="h-full animate-pulse" />;
  }

  const rawValue = data[config.metric_key];
  const value =
    typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' ? rawValue : 0;
  const formattedValue = formatValue(value, config.value_format, config.precision);

  // Determine status: semantic_status takes precedence over threshold calculation
  let status: 'healthy' | 'warning' | 'error' | undefined;
  if (config.semantic_status) {
    // Explicit semantic status: 'neutral' maps to undefined (no status styling)
    status = config.semantic_status === 'neutral' ? undefined : config.semantic_status;
  } else if (config.thresholds && typeof value === 'number') {
    // Fallback to threshold-based calculation
    // Sort thresholds descending by value to find the first one exceeded
    const sortedThresholds = [...config.thresholds].sort((a, b) => b.value - a.value);
    for (const threshold of sortedThresholds) {
      if (value >= threshold.value) {
        status = threshold.severity === 'critical' ? 'error' : threshold.severity;
        break;
      }
    }
    // If no threshold exceeded, it's healthy
    if (!status) status = 'healthy';
  }

  // Extract trend if configured
  let trend: { value: number; isPositive: boolean } | undefined;
  if (config.show_trend && config.trend_key) {
    const trendValue = data[config.trend_key];
    if (typeof trendValue === 'number') {
      trend = { value: Math.abs(trendValue), isPositive: trendValue >= 0 };
    }
  }

  return (
    <MetricCard
      label={config.label}
      value={formattedValue}
      status={status}
      trend={trend}
      tooltip={widget.description}
      className="h-full"
    />
  );
}

/**
 * Formats a numeric or string value according to the specified format type.
 *
 * Supports multiple format types for different metric displays:
 * - `number`: Locale-formatted number with configurable decimal places
 * - `percent`: Value followed by '%' symbol
 * - `currency`: USD currency format with $ symbol
 * - `duration`: Value followed by 'ms' for milliseconds
 *
 * @param value - The value to format (string passthrough, number formatted)
 * @param format - The format type to apply
 * @param precision - Number of decimal places (default: 2)
 * @returns The formatted string representation
 *
 * @example
 * ```ts
 * formatValue(0.956, 'percent', 1)  // "95.6%"
 * formatValue(1234.5, 'currency')   // "$1,234.50"
 * formatValue(42, 'duration')       // "42.00ms"
 * formatValue(1000, 'number', 0)    // "1,000"
 * ```
 */
function formatValue(
  value: unknown,
  format?: 'number' | 'currency' | 'percent' | 'duration',
  precision = 2
): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'number') return String(value);

  switch (format) {
    case 'percent':
      return `${value.toFixed(precision)}%`;
    case 'currency':
      // Note: Currency hardcoded to USD. For i18n, consider making currency configurable.
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      }).format(value);
    case 'duration':
      return `${value.toFixed(precision)}ms`;
    case 'number':
    default:
      return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: precision,
      });
  }
}
