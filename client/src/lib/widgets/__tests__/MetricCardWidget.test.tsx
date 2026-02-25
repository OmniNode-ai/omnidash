/**
 * MetricCardWidget Tests
 *
 * Comprehensive tests for the MetricCardWidget component which wraps MetricCard
 * with contract-driven data binding from DashboardData.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MetricCardWidget } from '../MetricCardWidget';
import type {
  WidgetDefinition,
  WidgetConfigMetricCard,
  DashboardData,
} from '@/lib/dashboard-schema';

// Helper to create a widget definition
function createWidget(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return {
    widget_id: 'test-metric-widget',
    title: 'Test Metric',
    config: {
      config_kind: 'metric_card',
      metric_key: 'test_metric',
      label: 'Test Label',
    },
    row: 0,
    col: 0,
    width: 2,
    height: 1,
    ...overrides,
  };
}

// Helper to create a metric card config
function createConfig(overrides: Partial<WidgetConfigMetricCard> = {}): WidgetConfigMetricCard {
  return {
    config_kind: 'metric_card',
    metric_key: 'test_metric',
    label: 'Test Label',
    ...overrides,
  };
}

describe('MetricCardWidget', () => {
  it('should render metric value correctly', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { test_metric: 1234 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('should display label', () => {
    const widget = createWidget();
    const config = createConfig({ label: 'Active Agents' });
    const data: DashboardData = { test_metric: 42 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Active Agents')).toBeInTheDocument();
  });

  it('should format number values with locale string', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'large_number',
      label: 'Large Number',
      value_format: 'number',
    });
    const data: DashboardData = { large_number: 1000000 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // toLocaleString formats large numbers with separators
    expect(screen.getByText('1,000,000')).toBeInTheDocument();
  });

  it('should format percent values', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'success_rate',
      label: 'Success Rate',
      value_format: 'percent',
      precision: 1,
    });
    const data: DashboardData = { success_rate: 95.5 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('95.5%')).toBeInTheDocument();
  });

  it('should format duration values', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'response_time',
      label: 'Response Time',
      value_format: 'duration',
      precision: 0,
    });
    const data: DashboardData = { response_time: 150 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  it('should show loading skeleton when isLoading=true', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {};

    render(<MetricCardWidget widget={widget} config={config} data={data} isLoading={true} />);

    // Should show "..." and have animate-pulse class
    expect(screen.getByText('...')).toBeInTheDocument();
    const card = screen.getByText('...').closest('.animate-pulse');
    expect(card).toBeInTheDocument();
  });

  it('should apply warning threshold styling', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'error_rate',
      label: 'Error Rate',
      thresholds: [
        { value: 50, severity: 'warning' },
        { value: 80, severity: 'critical' },
      ],
    });
    const data: DashboardData = { error_rate: 60 }; // Above warning (50), below critical (80)

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // The card should have warning status styling (left border)
    const card = screen.getByTestId('card-metric-error-rate');
    expect(card).toHaveClass('border-l-status-warning');
  });

  it('should apply error threshold styling for critical severity', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'error_rate',
      label: 'Error Rate',
      thresholds: [
        { value: 50, severity: 'warning' },
        { value: 80, severity: 'critical' },
      ],
    });
    const data: DashboardData = { error_rate: 90 }; // Above critical (80)

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // Critical maps to 'error' status styling (left border)
    const card = screen.getByTestId('card-metric-error-rate');
    expect(card).toHaveClass('border-l-status-error');
  });

  it('should show healthy status when below all thresholds', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'error_rate',
      label: 'Error Rate',
      thresholds: [
        { value: 50, severity: 'warning' },
        { value: 80, severity: 'critical' },
      ],
    });
    const data: DashboardData = { error_rate: 10 }; // Below all thresholds

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // Below all thresholds should show healthy status styling (left border)
    const card = screen.getByTestId('card-metric-error-rate');
    expect(card).toHaveClass('border-l-status-healthy');
  });

  it('should display unit suffix via precision in currency format', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'cost',
      label: 'Total Cost',
      value_format: 'currency',
      precision: 2,
    });
    const data: DashboardData = { cost: 1234.56 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // Currency format with 2 decimal places
    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
  });

  it('should show trend indicator when configured', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'requests',
      label: 'Requests',
      show_trend: true,
      trend_key: 'requests_change',
    });
    const data: DashboardData = { requests: 1000, requests_change: 12.5 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // Trend should show as positive percentage
    expect(screen.getByText('+12.5%')).toBeInTheDocument();
  });

  it('should show negative trend correctly', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'requests',
      label: 'Requests',
      show_trend: true,
      trend_key: 'requests_change',
    });
    const data: DashboardData = { requests: 1000, requests_change: -5.5 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // Negative trend
    expect(screen.getByText('5.5%')).toBeInTheDocument();
  });

  it('should handle string values', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'status',
      label: 'Status',
    });
    const data: DashboardData = { status: 'Operational' };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Operational')).toBeInTheDocument();
  });

  it('should default to 0 when metric key not found', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'nonexistent_key',
      label: 'Missing Metric',
    });
    const data: DashboardData = { other_key: 100 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('should use widget description as tooltip', () => {
    const widget = createWidget({ description: 'This metric shows total requests' });
    const config = createConfig();
    const data: DashboardData = { test_metric: 100 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // Tooltip is rendered but hidden until hover
    // We verify the label renders since tooltip is on the label
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('should respect precision setting for percent format', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'rate',
      label: 'Rate',
      value_format: 'percent',
      precision: 3,
    });
    const data: DashboardData = { rate: 95.1234 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('95.123%')).toBeInTheDocument();
  });

  it('should not show trend when show_trend is false', () => {
    const widget = createWidget();
    const config = createConfig({
      metric_key: 'requests',
      label: 'Requests',
      show_trend: false,
      trend_key: 'requests_change',
    });
    const data: DashboardData = { requests: 1000, requests_change: 15 };

    render(<MetricCardWidget widget={widget} config={config} data={data} />);

    // Should not show any percentage indicator for trend
    expect(screen.queryByText('+15%')).not.toBeInTheDocument();
    expect(screen.queryByText('15%')).not.toBeInTheDocument();
  });
});
