/**
 * ChartWidget Tests
 *
 * Comprehensive tests for the ChartWidget component which renders various
 * chart types (line, bar, area, pie, scatter) based on widget configuration.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ChartWidget } from '../ChartWidget';
import type { WidgetDefinition, WidgetConfigChart, DashboardData } from '@/lib/dashboard-schema';

// Mock Recharts ResponsiveContainer to avoid ResizeObserver issues in tests
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 400, height: 300 }}>
        {children}
      </div>
    ),
  };
});

// Helper to create a widget definition
function createWidget(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return {
    widget_id: 'test-chart-widget',
    title: 'Test Chart',
    config: {
      config_kind: 'chart',
      chart_type: 'line',
      series: [{ name: 'Series 1', data_key: 'value' }],
    },
    row: 0,
    col: 0,
    width: 4,
    height: 2,
    ...overrides,
  };
}

// Helper to create a chart config
function createConfig(overrides: Partial<WidgetConfigChart> = {}): WidgetConfigChart {
  return {
    config_kind: 'chart',
    chart_type: 'line',
    series: [{ name: 'Series 1', data_key: 'value' }],
    ...overrides,
  };
}

// Sample chart data
const sampleChartData = [
  { name: 'Jan', value: 100, value2: 50 },
  { name: 'Feb', value: 150, value2: 75 },
  { name: 'Mar', value: 200, value2: 100 },
  { name: 'Apr', value: 180, value2: 90 },
];

const pieChartData = [
  { name: 'Category A', value: 400 },
  { name: 'Category B', value: 300 },
  { name: 'Category C', value: 200 },
  { name: 'Category D', value: 100 },
];

describe('ChartWidget', () => {
  it('should render line chart with data', () => {
    const widget = createWidget({ title: 'Line Chart Test' });
    const config = createConfig({
      chart_type: 'line',
      series: [{ name: 'Values', data_key: 'value' }],
    });
    const data: DashboardData = { value: sampleChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Line Chart Test')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render bar chart with data', () => {
    const widget = createWidget({ title: 'Bar Chart Test' });
    const config = createConfig({
      chart_type: 'bar',
      series: [{ name: 'Values', data_key: 'value' }],
    });
    const data: DashboardData = { value: sampleChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Bar Chart Test')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render area chart with data', () => {
    const widget = createWidget({ title: 'Area Chart Test' });
    const config = createConfig({
      chart_type: 'area',
      series: [{ name: 'Values', data_key: 'value' }],
    });
    const data: DashboardData = { value: sampleChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Area Chart Test')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render pie chart with data', () => {
    const widget = createWidget({ title: 'Pie Chart Test' });
    const config = createConfig({
      chart_type: 'pie',
      series: [{ name: 'Distribution', data_key: 'categories' }],
    });
    const data: DashboardData = { categories: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Pie Chart Test')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render scatter chart with data', () => {
    const widget = createWidget({ title: 'Scatter Chart Test' });
    const config = createConfig({
      chart_type: 'scatter',
      series: [
        { name: 'X Values', data_key: 'x' },
        { name: 'Y Values', data_key: 'y' },
      ],
    });
    const scatterData = [
      { x: 10, y: 20 },
      { x: 15, y: 30 },
      { x: 20, y: 25 },
    ];
    const data: DashboardData = { x: scatterData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Scatter Chart Test')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should show loading skeleton when isLoading=true', () => {
    const widget = createWidget({ title: 'Loading Chart' });
    const config = createConfig();
    const data: DashboardData = {};

    render(<ChartWidget widget={widget} config={config} data={data} isLoading={true} />);

    // Title should still be visible in skeleton
    expect(screen.getByText('Loading Chart')).toBeInTheDocument();
    // Should not render the chart container
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument();
  });

  it('should display "No data available" when data is empty', () => {
    const widget = createWidget({ title: 'Empty Chart' });
    const config = createConfig({
      series: [{ name: 'Values', data_key: 'nonexistent' }],
    });
    const data: DashboardData = {};

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('should display "No data available" when data array is empty', () => {
    const widget = createWidget({ title: 'Empty Data Chart' });
    const config = createConfig({
      series: [{ name: 'Values', data_key: 'empty_data' }],
    });
    const data: DashboardData = { empty_data: [] };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('should show legend when configured', () => {
    const widget = createWidget({ title: 'Chart with Legend' });
    const config = createConfig({
      chart_type: 'line',
      series: [
        { name: 'Series A', data_key: 'value' },
        { name: 'Series B', data_key: 'value2' },
      ],
      show_legend: true,
    });
    const data: DashboardData = { value: sampleChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Chart renders with legend configuration (Recharts Legend component)
    expect(screen.getByText('Chart with Legend')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should handle missing data gracefully by finding array data', () => {
    const widget = createWidget({ title: 'Fallback Data Chart' });
    const config = createConfig({
      series: [{ name: 'Values', data_key: 'wrong_key' }],
    });
    // Data has an array at a different key
    const data: DashboardData = { actual_data: sampleChartData, scalar: 42 };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Should find and use actual_data array
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render chart description when provided', () => {
    const widget = createWidget({
      title: 'Described Chart',
      description: 'This chart shows trends over time',
    });
    const config = createConfig();
    const data: DashboardData = { value: sampleChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('This chart shows trends over time')).toBeInTheDocument();
  });

  it('should render multiple series in line chart', () => {
    const widget = createWidget({ title: 'Multi-Series Line' });
    const config = createConfig({
      chart_type: 'line',
      series: [
        { name: 'Primary', data_key: 'value' },
        { name: 'Secondary', data_key: 'value2' },
      ],
    });
    const data: DashboardData = { value: sampleChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Multi-Series Line')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render stacked bar chart when configured', () => {
    const widget = createWidget({ title: 'Stacked Bar Chart' });
    const config = createConfig({
      chart_type: 'bar',
      series: [
        { name: 'Group A', data_key: 'value' },
        { name: 'Group B', data_key: 'value2' },
      ],
      stacked: true,
    });
    const data: DashboardData = { value: sampleChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Stacked Bar Chart')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should use data key from first array found when primary key missing', () => {
    const widget = createWidget({ title: 'Auto Data Discovery' });
    const config = createConfig({
      series: [{ name: 'Values', data_key: 'missing_key' }],
    });
    const data: DashboardData = {
      not_array: 'string value',
      actual_array: sampleChartData,
    };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Should find actual_array and render chart
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should check for data key in dashboard data', () => {
    const widget = createWidget({ title: 'Direct Data Key Chart' });
    const config = createConfig({
      series: [{ name: 'Metrics', data_key: 'metrics' }],
    });
    const data: DashboardData = { data: sampleChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Falls back to 'data' key
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});
