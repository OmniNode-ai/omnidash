import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DashboardRenderer } from '../DashboardRenderer';
import type { DashboardConfig, DashboardData } from '@/lib/dashboard-schema';

// Mock the WidgetRenderer to control behavior
vi.mock('../WidgetRenderer', () => ({
  WidgetRenderer: ({ widget }: { widget: { widget_id: string; title: string } }) => {
    // Simulate a widget that throws if the id contains 'error'
    if (widget.widget_id.includes('error')) {
      throw new Error(`Widget ${widget.widget_id} crashed`);
    }
    return <div data-testid={`widget-${widget.widget_id}`}>{widget.title}</div>;
  },
}));

// Suppress console.error during tests since we expect errors
const originalError = console.error;

const createTestConfig = (widgets: Array<{ id: string; title: string }>): DashboardConfig => ({
  dashboard_id: 'test-dashboard',
  name: 'Test Dashboard',
  layout: {
    columns: 4,
    row_height: 100,
    gap: 16,
  },
  widgets: widgets.map((w, idx) => ({
    widget_id: w.id,
    title: w.title,
    config: {
      config_kind: 'metric_card' as const,
      metric_key: 'test_metric',
      label: w.title,
    },
    row: Math.floor(idx / 2),
    col: (idx % 2) * 2,
    width: 2,
    height: 1,
  })),
  data_source: 'test-source',
});

const testData: DashboardData = {
  test_metric: 42,
};

describe('DashboardRenderer', () => {
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('should render all widgets when no errors occur', () => {
    const config = createTestConfig([
      { id: 'widget-1', title: 'Widget 1' },
      { id: 'widget-2', title: 'Widget 2' },
    ]);

    render(<DashboardRenderer config={config} data={testData} />);

    expect(screen.getByText('Widget 1')).toBeInTheDocument();
    expect(screen.getByText('Widget 2')).toBeInTheDocument();
  });

  it('should isolate widget errors - other widgets still render', () => {
    const config = createTestConfig([
      { id: 'widget-1', title: 'Healthy Widget 1' },
      { id: 'error-widget', title: 'Failing Widget' },
      { id: 'widget-2', title: 'Healthy Widget 2' },
    ]);

    render(<DashboardRenderer config={config} data={testData} />);

    // Healthy widgets should render normally
    expect(screen.getByText('Healthy Widget 1')).toBeInTheDocument();
    expect(screen.getByText('Healthy Widget 2')).toBeInTheDocument();

    // Failing widget should show error boundary
    expect(screen.getByText('Failing Widget Error')).toBeInTheDocument();
    expect(screen.getByText('Widget error-widget crashed')).toBeInTheDocument();
  });

  it('should call onWidgetError callback when a widget throws', () => {
    const onWidgetError = vi.fn();
    const config = createTestConfig([{ id: 'error-widget-test', title: 'Crashing Widget' }]);

    render(<DashboardRenderer config={config} data={testData} onWidgetError={onWidgetError} />);

    expect(onWidgetError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('error-widget-test') }),
      'error-widget-test'
    );
  });

  it('should render retry button for failed widgets', () => {
    const config = createTestConfig([{ id: 'error-widget', title: 'Failing Widget' }]);

    render(<DashboardRenderer config={config} data={testData} />);

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('should handle multiple failing widgets independently', () => {
    const config = createTestConfig([
      { id: 'error-widget-1', title: 'Failing 1' },
      { id: 'widget-ok', title: 'Working' },
      { id: 'error-widget-2', title: 'Failing 2' },
    ]);

    render(<DashboardRenderer config={config} data={testData} />);

    // Both error boundaries should show
    expect(screen.getByText('Failing 1 Error')).toBeInTheDocument();
    expect(screen.getByText('Failing 2 Error')).toBeInTheDocument();

    // Working widget should still render
    expect(screen.getByText('Working')).toBeInTheDocument();
  });

  it('should apply grid layout with error boundaries', () => {
    const config = createTestConfig([{ id: 'widget-1', title: 'Widget 1' }]);

    const { container } = render(<DashboardRenderer config={config} data={testData} />);

    // Check grid is applied
    const grid = container.querySelector('.dashboard-grid');
    expect(grid).toHaveStyle({
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
    });
  });

  it('should apply custom className', () => {
    const config = createTestConfig([{ id: 'widget-1', title: 'Widget 1' }]);

    const { container } = render(
      <DashboardRenderer config={config} data={testData} className="custom-dashboard" />
    );

    expect(container.querySelector('.custom-dashboard')).toBeInTheDocument();
  });
});
