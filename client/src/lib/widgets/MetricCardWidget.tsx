/**
 * MetricCardWidget
 *
 * A contract-driven wrapper for MetricCard that pulls data from DashboardData
 * based on the widget configuration.
 */

import type {
  WidgetDefinition,
  WidgetConfigMetricCard,
  DashboardData,
} from '@/lib/dashboard-schema';
import { MetricCard } from '@/components/MetricCard';

interface MetricCardWidgetProps {
  widget: WidgetDefinition;
  config: WidgetConfigMetricCard;
  data: DashboardData;
  isLoading?: boolean;
}

export function MetricCardWidget({ widget, config, data, isLoading }: MetricCardWidgetProps) {
  if (isLoading) {
    return <MetricCard label={config.label} value="..." className="h-full animate-pulse" />;
  }

  const rawValue = data[config.metric_key];
  const value =
    typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' ? rawValue : 0;
  const formattedValue = formatValue(value, config.value_format, config.precision);

  // Determine status from thresholds (semantic → theme token mapping in MetricCard)
  let status: 'healthy' | 'warning' | 'error' | undefined;
  if (config.thresholds && typeof value === 'number') {
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
 * Format a value according to the specified format type and precision.
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
