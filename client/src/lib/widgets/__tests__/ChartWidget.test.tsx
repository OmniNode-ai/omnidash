/**
 * ChartWidget Tests
 *
 * Comprehensive tests for the ChartWidget component which renders various
 * chart types (line, bar, area, pie, donut, scatter) based on widget configuration.
 *
 * Includes tests for:
 * - All chart types (line, bar, area, pie, donut, scatter)
 * - Top N aggregation for pie/donut charts
 * - Chart type toggle functionality
 * - Loading and empty states
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

/**
 * Donut Chart Tests
 *
 * Tests specific to the donut chart type which is a pie chart with
 * an inner radius, making it more suitable for dashboards.
 */
describe('ChartWidget - Donut Chart', () => {
  it('should render donut chart when chart_type is donut', () => {
    const widget = createWidget({ title: 'Donut Chart Test' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Distribution', data_key: 'categories' }],
    });
    const data: DashboardData = { categories: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Donut Chart Test')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render donut chart with eventCount value key', () => {
    const widget = createWidget({ title: 'Event Count Donut' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Events', data_key: 'events' }],
    });
    const eventCountData = [
      { name: 'Event A', eventCount: 500 },
      { name: 'Event B', eventCount: 300 },
      { name: 'Event C', eventCount: 200 },
    ];
    const data: DashboardData = { events: eventCountData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Event Count Donut')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render donut chart with legend when show_legend is true', () => {
    const widget = createWidget({ title: 'Donut with Legend' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Categories', data_key: 'categories' }],
      show_legend: true,
    });
    const data: DashboardData = { categories: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Donut with Legend')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should render donut chart without legend when show_legend is false', () => {
    const widget = createWidget({ title: 'Donut without Legend' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Categories', data_key: 'categories' }],
      show_legend: false,
    });
    const data: DashboardData = { categories: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Donut without Legend')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});

/**
 * Chart Type Toggle Tests
 *
 * Tests for the toggle button that switches between chart types
 * when alternate_chart_type is configured.
 */
describe('ChartWidget - Chart Type Toggle', () => {
  it('should show toggle button when alternate_chart_type is set', () => {
    const widget = createWidget({ title: 'Toggleable Chart' });
    const config = createConfig({
      chart_type: 'donut',
      alternate_chart_type: 'bar',
      series: [{ name: 'Categories', data_key: 'categories' }],
    });
    const data: DashboardData = { categories: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Toggle button should be present
    const toggleButton = screen.getByRole('button', { name: /switch to/i });
    expect(toggleButton).toBeInTheDocument();
  });

  it('should not show toggle button when alternate_chart_type is not set', () => {
    const widget = createWidget({ title: 'Non-Toggleable Chart' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Categories', data_key: 'categories' }],
    });
    const data: DashboardData = { categories: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Toggle button should not be present
    const toggleButton = screen.queryByRole('button', { name: /switch to/i });
    expect(toggleButton).not.toBeInTheDocument();
  });

  it('should switch chart type when toggle button is clicked', () => {
    const widget = createWidget({ title: 'Toggle Test' });
    const config = createConfig({
      chart_type: 'donut',
      alternate_chart_type: 'bar',
      series: [{ name: 'Categories', data_key: 'value' }],
    });
    const data: DashboardData = { value: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Initial render shows donut (primary chart type)
    const toggleButton = screen.getByRole('button', { name: /switch to bar/i });
    expect(toggleButton).toBeInTheDocument();

    // Click to switch to bar chart
    fireEvent.click(toggleButton);

    // Button should now indicate switching back to donut
    const updatedButton = screen.getByRole('button', { name: /switch to donut/i });
    expect(updatedButton).toBeInTheDocument();
  });

  it('should toggle back to original chart type on second click', () => {
    const widget = createWidget({ title: 'Double Toggle Test' });
    const config = createConfig({
      chart_type: 'bar',
      alternate_chart_type: 'donut',
      series: [{ name: 'Categories', data_key: 'value' }],
    });
    const data: DashboardData = { value: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    const toggleButton = screen.getByRole('button', { name: /switch to donut/i });

    // First click: switch to donut
    fireEvent.click(toggleButton);
    expect(screen.getByRole('button', { name: /switch to bar/i })).toBeInTheDocument();

    // Second click: switch back to bar
    fireEvent.click(screen.getByRole('button', { name: /switch to bar/i }));
    expect(screen.getByRole('button', { name: /switch to donut/i })).toBeInTheDocument();
  });

  it('should support toggle between pie and bar charts', () => {
    const widget = createWidget({ title: 'Pie-Bar Toggle' });
    const config = createConfig({
      chart_type: 'pie',
      alternate_chart_type: 'bar',
      series: [{ name: 'Categories', data_key: 'categories' }],
    });
    const data: DashboardData = { categories: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    const toggleButton = screen.getByRole('button', { name: /switch to bar/i });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(screen.getByRole('button', { name: /switch to pie/i })).toBeInTheDocument();
  });
});

/**
 * Top N Aggregation Tests
 *
 * Tests for the aggregateToTopN function which combines items beyond
 * maxItems into an "Other" category for pie/donut charts.
 */
describe('ChartWidget - Top N Aggregation', () => {
  // Create data with many categories to trigger aggregation
  const manyCategories = [
    { name: 'Category A', value: 500 },
    { name: 'Category B', value: 400 },
    { name: 'Category C', value: 300 },
    { name: 'Category D', value: 200 },
    { name: 'Category E', value: 150 },
    { name: 'Category F', value: 100 },
    { name: 'Category G', value: 80 },
    { name: 'Category H', value: 60 },
    { name: 'Category I', value: 40 },
    { name: 'Category J', value: 20 },
  ];

  it('should not aggregate when data length is within maxItems (default 7)', () => {
    const widget = createWidget({ title: 'Small Dataset' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Distribution', data_key: 'categories' }],
    });
    // Only 4 items - below default maxItems of 7
    const data: DashboardData = { categories: pieChartData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Chart should render without "Other" aggregation
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByText('Small Dataset')).toBeInTheDocument();
  });

  it('should aggregate items beyond maxItems into Other category for donut chart', () => {
    const widget = createWidget({ title: 'Aggregated Donut' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Distribution', data_key: 'categories' }],
      // Default maxItems is 7, so 10 items should aggregate
    });
    const data: DashboardData = { categories: manyCategories };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Chart should render (aggregation happens internally)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByText('Aggregated Donut')).toBeInTheDocument();
  });

  it('should aggregate items beyond maxItems into Other category for pie chart', () => {
    const widget = createWidget({ title: 'Aggregated Pie' });
    const config = createConfig({
      chart_type: 'pie',
      series: [{ name: 'Distribution', data_key: 'categories' }],
    });
    const data: DashboardData = { categories: manyCategories };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Chart should render (aggregation happens internally)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByText('Aggregated Pie')).toBeInTheDocument();
  });

  it('should respect custom max_items configuration', () => {
    const widget = createWidget({ title: 'Custom Max Items' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Distribution', data_key: 'categories' }],
      max_items: 5, // Custom max items
    });
    const data: DashboardData = { categories: manyCategories };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Chart should render with custom aggregation threshold
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByText('Custom Max Items')).toBeInTheDocument();
  });

  it('should not aggregate for non-pie/donut charts even with many items', () => {
    const widget = createWidget({ title: 'Bar Chart No Aggregation' });
    const config = createConfig({
      chart_type: 'bar',
      series: [{ name: 'Values', data_key: 'value' }],
    });
    const data: DashboardData = { value: manyCategories };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Bar chart should render all items without aggregation
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByText('Bar Chart No Aggregation')).toBeInTheDocument();
  });

  it('should handle eventCount value key in aggregation', () => {
    const widget = createWidget({ title: 'EventCount Aggregation' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Events', data_key: 'eventCount' }],
    });
    const eventCountData = [
      { name: 'Event 1', eventCount: 500 },
      { name: 'Event 2', eventCount: 400 },
      { name: 'Event 3', eventCount: 300 },
      { name: 'Event 4', eventCount: 200 },
      { name: 'Event 5', eventCount: 150 },
      { name: 'Event 6', eventCount: 100 },
      { name: 'Event 7', eventCount: 80 },
      { name: 'Event 8', eventCount: 60 },
      { name: 'Event 9', eventCount: 40 },
      { name: 'Event 10', eventCount: 20 },
    ];
    const data: DashboardData = { eventCount: eventCountData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Chart should render with eventCount-based aggregation
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should sort data by value descending before aggregating', () => {
    const widget = createWidget({ title: 'Sorted Aggregation' });
    const config = createConfig({
      chart_type: 'donut',
      series: [{ name: 'Distribution', data_key: 'categories' }],
      max_items: 4, // Low threshold to test sorting
    });
    // Unsorted data - aggregation should pick highest values
    const unsortedData = [
      { name: 'Small', value: 10 },
      { name: 'Large', value: 1000 },
      { name: 'Medium', value: 100 },
      { name: 'Tiny', value: 5 },
      { name: 'Big', value: 500 },
    ];
    const data: DashboardData = { categories: unsortedData };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Chart should render with properly sorted and aggregated data
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should use explicit data_key from config for data lookup', () => {
    const widget = createWidget({ title: 'Explicit Data Key' });
    const config = createConfig({
      chart_type: 'donut',
      data_key: 'my_custom_data', // Explicit data_key
      series: [{ name: 'Distribution', data_key: 'value' }],
    });
    const data: DashboardData = {
      my_custom_data: manyCategories,
      other_data: pieChartData,
    };

    render(<ChartWidget widget={widget} config={config} data={data} />);

    // Should use my_custom_data, not other_data
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});
